"""
Generic data-quality guards against docs/players.json and docs/matches.json.
Not source-specific like test_spotcheck.py -- these should keep holding as
more sources get added.
"""
import json
from pathlib import Path

from build_site import as_int
from ingest import canonicalize_player_name

ROOT = Path(__file__).parent.parent


def load(name):
    with open(ROOT / "docs" / name, encoding="utf-8") as f:
        return json.load(f)


def test_player_aliases_are_canonicalized():
    assert canonicalize_player_name("Joe") == "Joe"
    # Davis and Joe are two different players -- must not be merged.
    assert canonicalize_player_name("  Davis ") == "Davis"
    assert canonicalize_player_name("George") == "Gman"
    assert canonicalize_player_name("G Man") == "Gman"
    assert canonicalize_player_name("Will Maidment") == "Bill"
    assert canonicalize_player_name("  will maidment  ") == "Bill"
    assert canonicalize_player_name("OG") == "OG"


def test_numeric_fields_are_coerced_to_ints():
    assert as_int("3") == 3
    assert as_int("0") == 0
    assert as_int("2.0") == 2
    assert as_int(None) == 0
    assert as_int("") == 0
    assert as_int("Gman") == 0


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


# (year, gw, (names...)) for accepted duplicates; empty means none allowed.
KNOWN_DUPLICATES: set[tuple] = set()


def test_no_player_listed_twice_in_a_match():
    # Catches over-eager aliasing (two real people merged into one name) and
    # copy-paste duplicates. "OG" (own goal) rows are allowed on both sides.
    # Known, accepted cases are in KNOWN_DUPLICATES; anything new fails.
    dupes = []
    for m in load("matches.json"):
        names = [p["player"] for side in ("team1_players", "team2_players")
                 for p in m[side] if p["player"].strip().lower() not in {"og", "own goal"}]
        repeated = sorted({n for n in names if names.count(n) > 1})
        if repeated and (m.get("year"), m["gw"], tuple(repeated)) not in KNOWN_DUPLICATES:
            dupes.append((m.get("year"), m["gw"], repeated))
    assert not dupes, f"players listed twice in one match: {dupes}"
