"""
Builds docs/players.json from the DuckDB base for the static player-stats site.

Usage: python build_site.py
"""
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent
DB_PATH = ROOT / "data" / "league.duckdb"
DOCS = ROOT / "docs"

QUERY = """
SELECT a.player, a.source, a.gw, a.team_side, a.is_captain,
       a.goals, a.assists, a.clean_sheets,
       CASE WHEN a.team_side = 1 THEN m.team1_result ELSE m.team2_result END AS result,
       m.venue
FROM appearances a
JOIN matches m ON a.source = m.source AND a.gw = m.gw
ORDER BY a.player, a.source, a.gw
"""


def main():
    con = duckdb.connect(str(DB_PATH))
    rows = con.execute(QUERY).fetchall()
    cols = [d[0] for d in con.description]
    con.close()

    players: dict[str, dict] = {}
    for row in rows:
        r = dict(zip(cols, row))
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
        p["appearances"] += 1
        p["goals"] += r["goals"] or 0
        p["assists"] += r["assists"] or 0
        p["clean_sheets"] += r["clean_sheets"] or 0
        p["captaincies"] += 1 if r["is_captain"] else 0
        if r["result"] == "W":
            p["wins"] += 1
        elif r["result"] == "D":
            p["draws"] += 1
        elif r["result"] == "L":
            p["losses"] += 1
        p["games"].append({
            "source": r["source"],
            "gw": r["gw"],
            "result": r["result"],
            "venue": r["venue"],
            "goals": r["goals"],
            "assists": r["assists"],
            "clean_sheets": r["clean_sheets"],
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

    print(f"Wrote {len(out)} players to {DOCS / 'players.json'}")


if __name__ == "__main__":
    main()
