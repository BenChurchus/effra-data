"""
Builds docs/accolades.json: every award actually handed out, by season.

Source of truth is the gaffer's running honours list: the "Awards" tab of the
most recent season's sheet, which has one row per award and a "Winner NN"
column per season (Winner 24, Winner 25, Winner 26...). Archived copies of
that tab live in data/bronze/<year>/<source>/Awards.json, so this refreshes
automatically with the data. Filling in "Winner 26" after awards night is all
it takes for the site's Accolades tab to update.

Winner cells are hand-typed, so this accepts: "Nairn (3.15)", "Bill + Kempy",
"Harry/Jez", "Joe, Crell, Gman, Char, Bill", "Bill (vs Harry)",
"Kempy (Medal) / Dave (Spoon)"; "N/A" or blank means not awarded.
Names go through the same aliases as match data (George -> Gman).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from ingest import canonicalize_player_name

ROOT = Path(__file__).parent
BRONZE = ROOT / "data" / "bronze"
OUT = ROOT / "docs" / "accolades.json"

WINNER_COL_RE = re.compile(r"^winner\s*'?(\d{2,4})$", re.IGNORECASE)
NOT_AWARDED = {"", "n/a", "na", "none", "-", "tbc", "tbd"}


def prize_kind(prize: str) -> str:
    """trophy / medal / booby (spoons, wood chips...) for the honours board."""
    p = (prize or "").lower()
    if any(w in p for w in ("spoon", "wood", "donkey", "rubber", "door stop", "doorstop")):
        return "medal" if "medal" in p else "booby"
    if "trophy" in p:
        return "trophy"
    return "medal"


def parse_winners(cell) -> tuple[list[str], str]:
    """'Bill (vs Harry)' -> (['Bill'], 'vs Harry'); 'Bill + Kempy' -> (['Bill', 'Kempy'], '')."""
    text = " ".join(str(cell).split()) if cell is not None else ""
    if text.lower() in NOT_AWARDED:
        return [], ""
    notes = re.findall(r"\(([^)]*)\)", text)
    # 'Kempy (Medal) / Dave (Spoon)': the medal goes to the first-named player
    if re.search(r"\(\s*medal\s*\)", text, re.IGNORECASE):
        winner = re.split(r"\(", text)[0]
        loser = re.findall(r"/\s*([^(/]+?)\s*\(\s*spoon", text, re.IGNORECASE)
        detail = f"vs {loser[0].strip()}" if loser else ""
        extra = [n for n in notes if n.lower() not in ("medal", "spoon")]
        return [canonicalize_player_name(winner.strip())], " ".join([detail, *extra]).strip()
    bare = re.sub(r"\([^)]*\)", "", text)
    parts = [p.strip() for p in re.split(r"\s*(?:\+|/|,|&|\band\b)\s*", bare) if p.strip()]
    names = []
    for part in parts:
        name = canonicalize_player_name(part)
        if name and name not in names:
            names.append(name)
    return names, "; ".join(n.strip() for n in notes if n.strip())


def load_awards_tab() -> tuple[int, list[list]] | None:
    """The newest season's Awards tab (it carries every season's winners)."""
    years = sorted((int(p.name) for p in BRONZE.iterdir() if p.is_dir() and p.name.isdigit()), reverse=True)
    for year in years:
        for f in (BRONZE / str(year)).glob("*/Awards.json"):
            return year, json.loads(f.read_text(encoding="utf-8"))
    return None


def build() -> list[dict]:
    found = load_awards_tab()
    if not found:
        return []
    _, rows = found
    header_i = next((i for i, r in enumerate(rows) if any(str(c).strip().lower() == "award" for c in r if c)), None)
    if header_i is None:
        return []
    header = [str(c).strip() if c is not None else "" for c in rows[header_i]]
    col = {h.lower(): i for i, h in enumerate(header) if h}
    award_i, cat_i = col.get("award"), col.get("category")
    expl_i, prize_i = col.get("explanation"), col.get("prize")
    seasons = {}
    for i, h in enumerate(header):
        m = WINNER_COL_RE.match(h)
        if m:
            y = int(m.group(1))
            seasons[i] = y + 2000 if y < 100 else y

    out = []
    for r in rows[header_i + 1:]:
        get = lambda i: (r[i] if i is not None and i < len(r) else None)  # noqa: E731
        name = get(award_i)
        if not isinstance(name, str) or not name.strip():
            continue
        award = " ".join(name.split())
        for ci, season in seasons.items():
            winners, detail = parse_winners(get(ci))
            if not winners:
                continue
            prize = str(get(prize_i) or "").strip()
            # "Medal, spoon" awards (Nemesis): the beaten rival gets the spoon
            rival = re.match(r"^vs\s+(.+)$", detail, re.IGNORECASE)
            if "spoon" in prize.lower() and "medal" in prize.lower() and rival:
                loser = canonicalize_player_name(rival.group(1).split(";")[0].strip())
                if loser:
                    out.append({
                        "season": season, "award": f"{award} (spoon)",
                        "category": str(get(cat_i) or "").strip() or "Other",
                        "explanation": f"On the wrong end of {winners[0]}'s {award.lower()} record",
                        "prize": "Spoon", "kind": "booby", "winners": [loser], "detail": f"vs {winners[0]}",
                    })
            out.append({
                "season": season,
                "award": award,
                "category": str(get(cat_i) or "").strip() or "Other",
                "explanation": str(get(expl_i) or "").strip(),
                "prize": prize,
                "kind": prize_kind(prize),
                "winners": winners,
                "detail": detail,
            })
    return sorted(out, key=lambda a: (-a["season"], a["category"] != "Stats", a["award"]))


def main() -> None:
    data = build()
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    seasons = sorted({a["season"] for a in data})
    print(f"Wrote {len(data)} accolades across seasons {seasons} to {OUT}")


if __name__ == "__main__":
    main()
