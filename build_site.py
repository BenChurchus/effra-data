"""
Builds docs/players.json from the DuckDB base for the static player-stats site.

Usage: python build_site.py
"""
import hashlib
import json
import re
from pathlib import Path

import duckdb

import accolades
import gaffer_gate

ROOT = Path(__file__).parent
DB_PATH = ROOT / "data" / "league.duckdb"
DOCS = ROOT / "docs"

def as_int(value, default=0):
    if value is None or value == "":
        return default
    if isinstance(value, str):
        value = value.strip()
        if value in {"", "-"}:
            return default
        try:
            if "." in value:
                return int(float(value))
            return int(value)
        except ValueError:
            return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


QUERY = """
SELECT a.player, a.source, a.year, a.gw, a.team_side, a.is_captain,
       a.goals, a.assists, a.clean_sheets,
       CASE WHEN a.team_side = 1 THEN m.team1_result ELSE m.team2_result END AS result,
       m.venue
FROM appearances a
JOIN matches m ON a.source = m.source AND a.year = m.year AND a.gw = m.gw
ORDER BY a.player, a.source, a.gw
"""

MATCHES_QUERY = """
SELECT m.source, m.year, m.gw, m.venue, m.tracked, m.team1_result, m.team1_goals, m.team2_result, m.team2_goals,
       a.team_side, a.player, a.is_captain, a.goals, a.assists, a.clean_sheets
FROM matches m
LEFT JOIN appearances a ON a.source = m.source AND a.year = m.year AND a.gw = m.gw
ORDER BY m.source, m.gw, a.team_side
"""


def build_matches(con) -> list[dict]:
    rows = con.execute(MATCHES_QUERY).fetchall()
    cols = [d[0] for d in con.description]

    matches: dict[tuple, dict] = {}
    for row in rows:
        r = dict(zip(cols, row))
        key = (r["source"], r["year"], r["gw"])
        m = matches.setdefault(key, {
            "source": r["source"],
            "year": r["year"],
            "gw": r["gw"],
            "venue": r["venue"],
            # which per-player stats this scorecard recorded (2024/25: goals only)
            "tracked": [t for t in (r["tracked"] or "").split(",") if t],
            "team1_result": r["team1_result"],
            "team1_goals": as_int(r["team1_goals"]),
            "team2_result": r["team2_result"],
            "team2_goals": as_int(r["team2_goals"]),
            "team1_players": [],
            "team2_players": [],
        })
        if r["player"] is None:
            continue
        entry = {
            "player": r["player"],
            "is_captain": r["is_captain"],
            "goals": as_int(r["goals"], default=None),
            "assists": as_int(r["assists"], default=None),
            "clean_sheets": as_int(r["clean_sheets"], default=None),
        }
        m["team1_players" if r["team_side"] == 1 else "team2_players"].append(entry)

    return sorted(matches.values(), key=lambda m: (m["source"], m["year"] or 0, m["gw"]))


# Pages and the files they load. GitHub Pages lets browsers cache everything
# for 10 minutes, so after a deploy a new page could run against an old cached
# script and break. Each reference gets ?v=<content hash>, which changes
# whenever the file does, so browsers always fetch the matching version.
ASSETS = ("effra.css", "effra.js", "charts.js", "wrapped.js")
ASSET_REF_RE = re.compile(r'(?P<attr>href|src)="(?P<name>' + "|".join(re.escape(a) for a in ASSETS) + r')(?:\?v=[0-9a-f]+)?"')


def asset_version(name: str) -> str:
    # Normalise line endings first: git stores LF, but a Windows checkout can
    # have CRLF, and the stamp must be identical on every machine (and in CI).
    data = (DOCS / name).read_bytes().replace(b"
", b"
")
    return hashlib.sha256(data).hexdigest()[:10]


def stamp(html: str, versions: dict) -> str:
    return ASSET_REF_RE.sub(lambda m: f'{m["attr"]}="{m["name"]}?v={versions[m["name"]]}"', html)


def stamp_asset_versions() -> None:
    versions = {a: asset_version(a) for a in ASSETS if (DOCS / a).exists()}
    # public pages are stamped in place; the gaffer room is stamped from its
    # source, then encrypted into docs/master.html (see gaffer_gate.py)
    for path in (DOCS / "index.html", gaffer_gate.SOURCE):
        if not path.exists():
            continue
        html = path.read_text(encoding="utf-8")
        stamped = stamp(html, versions)
        if stamped != html:
            path.write_text(stamped, encoding="utf-8")
    print(f"Stamped asset versions: {versions}")
    if gaffer_gate.SOURCE.exists():
        gaffer_gate.build(gaffer_gate.SOURCE.read_text(encoding="utf-8"), f"effra.css?v={versions['effra.css']}")


def main():
    con = duckdb.connect(str(DB_PATH))
    rows = con.execute(QUERY).fetchall()
    cols = [d[0] for d in con.description]
    matches = build_matches(con)
    con.close()

    players: dict[str, dict] = {}
    for row in rows:
        r = dict(zip(cols, row))
        if r["player"] and r["player"].strip().lower() in {"og", "own goal"}:
            continue
        p = players.setdefault(r["player"], {
            "name": r["player"],
            "appearances": 0,
            "goals": 0,
            "assists": 0,
            "clean_sheets": 0,
            "captaincies": 0,
            "wins": 0,
            "draws": 0,
            "losses": 0,
            "games": [],
        })
        goals = as_int(r["goals"], default=0)
        assists = as_int(r["assists"], default=0)
        clean_sheets = as_int(r["clean_sheets"], default=0)
        p["appearances"] += 1
        p["goals"] += goals
        p["assists"] += assists
        p["clean_sheets"] += clean_sheets
        p["captaincies"] += 1 if r["is_captain"] else 0
        if r["result"] == "W":
            p["wins"] += 1
        elif r["result"] == "D":
            p["draws"] += 1
        elif r["result"] == "L":
            p["losses"] += 1
        p["games"].append({
            "source": r["source"],
            "year": r["year"],
            "gw": r["gw"],
            "result": r["result"],
            "venue": r["venue"],
            "goals": goals,
            "assists": assists,
            "clean_sheets": clean_sheets,
            "is_captain": r["is_captain"],
        })

    for p in players.values():
        p["goals"] = int(p["goals"])
        p["assists"] = int(p["assists"])
        p["clean_sheets"] = int(p["clean_sheets"])

    out = sorted(players.values(), key=lambda p: -p["goals"])

    DOCS.mkdir(exist_ok=True)
    with open(DOCS / "players.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    with open(DOCS / "matches.json", "w", encoding="utf-8") as f:
        json.dump(matches, f, indent=2)

    print(f"Wrote {len(out)} players to {DOCS / 'players.json'}")
    print(f"Wrote {len(matches)} matches to {DOCS / 'matches.json'}")
    accolades.main()
    stamp_asset_versions()


if __name__ == "__main__":
    main()
