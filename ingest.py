"""
Bronze -> base -> gold pipeline for weekly 5-a-side scorecards.

Each source is one Google Sheets export (.xlsx) containing tabs:
  Template (skip), GW1..GWN (match data), plus derived summary tabs we
  don't trust and recompute instead (Captaincy, Analysis Tab, Apps, Awards).

Usage:
    python ingest.py [<year>] <source_name> <path> [[<year>] <source_name> <path> ...]

<path> is either a workbook (.xlsx) or an archived bronze folder
(data/bronze/<year>/<source>/), so finished seasons can be rebuilt from the
repo without their original Google Sheet (see refresh.py).
"""
import json
import re
import sys
from pathlib import Path

import duckdb
import openpyxl

ROOT = Path(__file__).parent
BRONZE = ROOT / "data" / "bronze"
SILVER = ROOT / "data" / "silver"
GOLD = ROOT / "data" / "gold"
DB_PATH = ROOT / "data" / "league.duckdb"
YEAR_RE = re.compile(r"^\d{4}$")

GW_TAB_RE = re.compile(r"^GW(\d+)$", re.IGNORECASE)


def trim_trailing_none(row: tuple) -> list:
    row = list(row)
    while row and row[-1] is None:
        row.pop()
    return row


def load_workbook_tabs(xlsx_path: Path) -> dict[str, list[list]]:
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    tabs = {}
    for name in wb.sheetnames:
        ws = wb[name]
        tabs[name] = [trim_trailing_none(row) for row in ws.iter_rows(values_only=True)]
    return tabs


def layer_dir(layer: Path, source: str, year: int | None = None) -> Path:
    """<layer>/<year>/<source>, so seasons never overwrite each other's GW files."""
    base = layer / str(year) if year is not None else layer
    return base / source


def bronze_dir(source: str, year: int | None = None) -> Path:
    return layer_dir(BRONZE, source, year)


def dump_bronze(source: str, tabs: dict[str, list[list]], year: int | None = None) -> None:
    out_dir = bronze_dir(source, year)
    out_dir.mkdir(parents=True, exist_ok=True)
    for tab_name, rows in tabs.items():
        safe_name = tab_name.replace("/", "_")
        with open(out_dir / f"{safe_name}.json", "w", encoding="utf-8") as f:
            json.dump(rows, f, default=str, indent=2)


def get(row: list, i: int, default=None):
    return row[i] if i < len(row) else default


def normalize_cs(value):
    # Source data inconsistency: some rows use "Y" (like the captain flag)
    # instead of a count in the clean-sheets column.
    if value == "Y":
        return 1
    return value


def clean_text(value):
    # Manual data entry leaves stray leading/trailing whitespace (e.g. "Jez "
    # vs "Jez"), which would otherwise fracture one player into two entries.
    return value.strip() if isinstance(value, str) else value


def normalize_venue(value):
    # Venues are typed by hand: "MILE END" vs "Mile End", and the template's
    # "VENUE" placeholder sometimes survives on a played match. Title-case
    # (collapsing internal spaces) and treat the placeholder as unknown.
    venue = clean_text(value)
    if not isinstance(venue, str) or not venue:
        return None
    venue = " ".join(venue.split())
    if venue.lower() == "venue":
        return None
    return venue.title()


# Only alias names confirmed to be the same person. NB "Davis" is NOT Joe --
# they're two different players (confirmed Nov 2026; both play in the same
# 2026 matches), so don't alias them.
PLAYER_ALIASES = {
    "joe": "Joe",
    "george": "Gman",
    "g man": "Gman",
    "g-man": "Gman",
    "bill": "Bill",
    "will maidment": "Bill",
    "will maidment bill": "Bill",
    "willmaidment": "Bill",
    "will-maidment": "Bill",
}


def canonicalize_player_name(value):
    cleaned = clean_text(value)
    if cleaned is None:
        return None
    key = cleaned.lower()
    return PLAYER_ALIASES.get(key, cleaned)


def write_silver(source: str, gw_number: int, appearances: list[dict],
                 year: int | None = None) -> None:
    gw_dir = layer_dir(SILVER, source, year)
    gw_dir.mkdir(parents=True, exist_ok=True)
    canonical_appearances = [{
        **a,
        "player": canonicalize_player_name(a["player"]),
    } for a in appearances]
    with open(gw_dir / f"GW{gw_number}.json", "w", encoding="utf-8") as f:
        json.dump(canonical_appearances, f, indent=2)


# 2026 layout, used if a tab's header row can't be read.
DEFAULT_LAYOUT = {
    1: {"name": 1, "captain": 2, "goals": 3, "assists": 4, "clean_sheets": 5},
    2: {"name": 6, "captain": 7, "goals": 8, "assists": 9, "clean_sheets": 10},
    "venue": 11,
}
HEADER_FIELDS = {"(c)": "captain", "c": "captain", "goals": "goals",
                 "assists": "assists", "cs": "clean_sheets", "clean sheets": "clean_sheets"}
TEAM_HEADER_RE = re.compile(r"^team\s*([12])$", re.IGNORECASE)


def column_layout(header: list) -> dict:
    """Map each team's columns from the tab's header row.

    Seasons use different scorecards: 2024/25 are `Team1 | Goals | Team 2 |
    Goals | Venue`; 2026 adds (C)/Assists/CS per team and puts the venue in
    column L. Reading the header (instead of fixed positions) keeps every
    season parsing correctly and tells us which stats were tracked.
    """
    labels = [str(v).strip().lower() if v is not None else "" for v in header]
    starts = [(i, int(m.group(1))) for i, l in enumerate(labels) if (m := TEAM_HEADER_RE.match(l))]
    if len(starts) != 2:
        return DEFAULT_LAYOUT
    layout: dict = {"venue": None}
    for k, (i, team) in enumerate(starts):
        stop = starts[k + 1][0] if k + 1 < len(starts) else len(labels)
        cols = {"name": i}
        for j in range(i + 1, stop):
            field = HEADER_FIELDS.get(labels[j])
            if field and field not in cols:
                cols[field] = j
            elif labels[j] == "venue":
                layout["venue"] = j
        layout[team] = cols
    if layout["venue"] is None:
        layout["venue"] = DEFAULT_LAYOUT["venue"]
    return layout


def parse_gw_tab(gw_number: int, rows: list[list], source: str) -> tuple[dict, list[dict]]:
    score_row = None
    for row in rows:
        if row and row[0] == "Score":
            score_row = row
            break
    if score_row is None:
        raise ValueError(f"{source} GW{gw_number}: no Score row found")

    layout = column_layout(rows[0] if rows else [])
    t1, t2, vcol = layout[1], layout[2], layout["venue"]
    tracked = [f for f in ("goals", "assists", "clean_sheets", "captain") if f in t1 and f in t2]

    # Venue normally sits on the Score row; occasionally it's typed on its own
    # row just above (team-name cells blank), so fall back to that.
    venue = normalize_venue(get(score_row, vcol))
    if venue is None:
        for row in rows[1:]:
            if row is score_row or not row:
                continue
            if get(row, t1["name"]) is None and get(row, t2["name"]) is None:
                venue = normalize_venue(get(row, vcol)) or venue

    match = {
        "source": source,
        "year": None,
        "gw": gw_number,
        "team1_result": clean_text(get(score_row, t1["name"])),
        "team1_goals": get(score_row, t1.get("goals", -1)) if "goals" in t1 else None,
        "team2_result": clean_text(get(score_row, t2["name"])),
        "team2_goals": get(score_row, t2.get("goals", -1)) if "goals" in t2 else None,
        "venue": venue,
        "tracked": ",".join(tracked),
    }

    def field(row, cols, name):
        return get(row, cols[name]) if name in cols else None

    appearances = []
    for row in rows:
        if not row or row[0] == "Score" or row is rows[0]:
            continue
        for side, cols in ((1, t1), (2, t2)):
            name = canonicalize_player_name(get(row, cols["name"]))
            # Data-entry slip recovery (team 1 only): col0 should only ever
            # hold "Score" or the GW header; if the name cell is blank but
            # col0 has a name, it was typed one cell to the left.
            if name is None and side == 1 and cols["name"] == 1:
                name = canonicalize_player_name(get(row, 0))
            if name is None:
                continue
            appearances.append({
                "source": source,
                "year": None,
                "gw": gw_number,
                "team_side": side,
                "player": name,
                "is_captain": clean_text(field(row, cols, "captain")) == "Y",
                "goals": field(row, cols, "goals"),
                "assists": field(row, cols, "assists"),
                "clean_sheets": normalize_cs(field(row, cols, "clean_sheets")),
            })
    return match, appearances


def load_bronze_tabs(folder: Path) -> dict[str, list[list]]:
    """Read an archived season (one JSON file per tab) instead of a workbook."""
    return {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in sorted(folder.glob("*.json"))}


def process_source(source: str, xlsx_path: Path, all_matches: list, all_appearances: list,
                  year: int | None = None) -> None:
    if xlsx_path.is_dir():
        tabs = load_bronze_tabs(xlsx_path)
        if xlsx_path.resolve() != bronze_dir(source, year).resolve():
            dump_bronze(source, tabs, year)
    else:
        tabs = load_workbook_tabs(xlsx_path)
        dump_bronze(source, tabs, year)

    gw_tabs = []
    for tab_name in tabs:
        m = GW_TAB_RE.match(tab_name.strip())
        if m:
            gw_tabs.append((int(m.group(1)), tab_name))
    gw_tabs.sort()

    for gw_number, tab_name in gw_tabs:
        match, appearances = parse_gw_tab(gw_number, tabs[tab_name], source)
        match["year"] = year
        for appearance in appearances:
            appearance["year"] = year
        all_matches.append(match)
        all_appearances.extend(appearances)

        def player_view(a: dict) -> dict:
            return {k: v for k, v in a.items() if k not in ("source", "gw", "team_side")}

        write_silver(source, gw_number, appearances, year)

        gw_dir = layer_dir(GOLD, source, year)
        gw_dir.mkdir(parents=True, exist_ok=True)
        record = {
            **match,
            "team1_players": [player_view(a) for a in appearances if a["team_side"] == 1],
            "team2_players": [player_view(a) for a in appearances if a["team_side"] == 2],
        }
        with open(gw_dir / f"GW{gw_number}.json", "w", encoding="utf-8") as f:
            json.dump(record, f, indent=2)

    source_appearances = sum(1 for a in all_appearances
                             if a["source"] == source and a["year"] == year)
    label = f"{year} {source}" if year is not None else source
    print(f"{label}: parsed {len(gw_tabs)} gameweeks, {source_appearances} appearances")


def build_duckdb(all_matches: list[dict], all_appearances: list[dict]) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH))
    import pandas as pd
    matches_df = pd.DataFrame(all_matches)
    appearances_df = pd.DataFrame(all_appearances)
    con.execute("CREATE OR REPLACE TABLE matches AS SELECT * FROM matches_df")
    con.execute("CREATE OR REPLACE TABLE appearances AS SELECT * FROM appearances_df")
    con.close()


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    all_matches: list[dict] = []
    all_appearances: list[dict] = []
    i = 0

    while i < len(args):
        if i + 2 < len(args) and YEAR_RE.match(args[i]):
            year = int(args[i])
            source = args[i + 1]
            path = Path(args[i + 2])
            i += 3
        elif i + 1 < len(args):
            year = None
            source = args[i]
            path = Path(args[i + 1])
            i += 2
        else:
            print(__doc__)
            sys.exit(1)

        process_source(source, path, all_matches, all_appearances, year)

    build_duckdb(all_matches, all_appearances)
    print(f"\nTotal: {len(all_matches)} matches, {len(all_appearances)} appearances across "
          f"{len(set(m['source'] for m in all_matches))} source(s)")
    print(f"DuckDB: {DB_PATH}")
    print(f"Gold JSON: {GOLD}")


if __name__ == "__main__":
    main()
