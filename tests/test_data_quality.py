"""
Generic data-quality guards against docs/players.json and docs/matches.json.
Not source-specific like test_spotcheck.py -- these should keep holding as
more sources get added.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent


def load(name):
    with open(ROOT / "docs" / name, encoding="utf-8") as f:
        return json.load(f)


def test_no_whitespace_padded_player_names():
    players = load("players.json")
    bad = [p["name"] for p in players if p["name"] != p["name"].strip()]
    assert not bad, f"player names with stray whitespace: {bad}"


def test_no_case_or_whitespace_duplicate_players():
    players = load("players.json")
    seen = {}
    dupes = []
    for p in players:
        key = p["name"].strip().lower()
        if key in seen:
            dupes.append((seen[key], p["name"]))
        seen[key] = p["name"]
    assert not dupes, f"likely-duplicate player names (same after trim/lowercase): {dupes}"


def test_no_whitespace_padded_venues():
    matches = load("matches.json")
    bad = [(m["source"], m["gw"], m["venue"]) for m in matches
           if m["venue"] and m["venue"] != m["venue"].strip()]
    assert not bad, f"venues with stray whitespace: {bad}"


def test_match_goals_sum_matches_scoreline():
    matches = load("matches.json")
    mismatches = []
    for m in matches:
        t1 = sum(p["goals"] or 0 for p in m["team1_players"])
        t2 = sum(p["goals"] or 0 for p in m["team2_players"])
        if t1 != m["team1_goals"] or t2 != m["team2_goals"]:
            mismatches.append((m["source"], m["gw"], t1, m["team1_goals"], t2, m["team2_goals"]))
    assert not mismatches, f"per-player goals don't sum to scoreline: {mismatches}"
