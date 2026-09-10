"""
Independent spot-check: re-reads two raw gameweek tabs straight from the
source .xlsx with openpyxl (bypassing ingest.py entirely) and asserts the
published docs/matches.json agrees, cell for cell.

Run: pytest tests/test_spotcheck.py -v
"""
import json
from pathlib import Path

import openpyxl
import pytest

ROOT = Path(__file__).parent.parent
XLSX = ROOT / "effra_sample.xlsx"
MATCHES_JSON = ROOT / "docs" / "matches.json"


@pytest.fixture(scope="module")
def wb():
    return openpyxl.load_workbook(XLSX, data_only=True)


@pytest.fixture(scope="module")
def matches():
    with open(MATCHES_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return {m["gw"]: m for m in data if m["source"] == "effra"}


def raw_rows(wb, tab_name):
    ws = wb[tab_name]
    return [row for row in ws.iter_rows(values_only=True) if any(v is not None for v in row)]


def find_player(team_players, name):
    match = [p for p in team_players if p["player"] == name]
    assert len(match) == 1, f"expected exactly one row for {name!r}, found {len(match)}"
    return match[0]


def test_gw7_matches_source(wb, matches):
    rows = raw_rows(wb, "GW7")
    score = rows[-1]
    assert score[0] == "Score"

    m = matches[7]
    assert m["team1_result"] == score[1] == "L"
    assert m["team1_goals"] == score[3] == 6
    assert m["team2_result"] == score[6] == "W"
    assert m["team2_goals"] == score[8] == 10
    assert m["venue"] == score[11] == "Stockwell"

    assert len(m["team1_players"]) == 6
    assert len(m["team2_players"]) == 6

    kempy = find_player(m["team2_players"], "Kempy")
    assert kempy["goals"] == 2
    assert kempy["assists"] == 1
    assert kempy["clean_sheets"] == 1
    assert kempy["is_captain"] is False

    bill = find_player(m["team2_players"], "Bill")
    assert bill["is_captain"] is True
    assert bill["goals"] == 2
    assert bill["assists"] == 2

    dave = find_player(m["team1_players"], "Dave")
    assert dave["is_captain"] is True
    assert dave["goals"] == 1

    gman = find_player(m["team1_players"], "Gman")
    assert gman["goals"] is None
    assert gman["assists"] is None

    team1_total = sum(p["goals"] or 0 for p in m["team1_players"])
    team2_total = sum(p["goals"] or 0 for p in m["team2_players"])
    assert team1_total == m["team1_goals"]
    assert team2_total == m["team2_goals"]


def test_gw14_recovers_misplaced_names(wb, matches):
    # Source data entry slip: "Bart" and "Mark" were typed into column A
    # (normally only ever "Score" or the GW header) instead of column B,
    # dropping them from Team1 entirely until the parser recovered them.
    rows = raw_rows(wb, "GW14")
    assert rows[4][0] == "Bart"
    assert rows[4][1] is None
    assert rows[5][0] == "Mark"
    assert rows[5][1] is None

    m = matches[14]
    assert m["team1_goals"] == 9

    bart = find_player(m["team1_players"], "Bart")
    assert bart["goals"] == 2

    find_player(m["team1_players"], "Mark")  # present with no stats

    team1_total = sum(p["goals"] or 0 for p in m["team1_players"])
    assert team1_total == m["team1_goals"] == 9


def test_gw33_matches_source(wb, matches):
    rows = raw_rows(wb, "GW33")
    # Known source quirk: the tab is named GW33 but the leftover header
    # cell in A1 still reads "GW12" from whatever it was copied from.
    assert rows[0][0] == "GW12"

    score = rows[-1]
    assert score[0] == "Score"

    m = matches[33]
    assert m["gw"] == 33  # keyed off the tab name, not the stale A1 label
    assert m["team1_result"] == score[1] == "W"
    assert m["team1_goals"] == score[3] == 9
    assert m["team2_result"] == score[6] == "L"
    assert m["team2_goals"] == score[8] == 0
    assert m["venue"] == score[11] == "Brixton"

    assert len(m["team1_players"]) == 5
    assert len(m["team2_players"]) == 5

    jph = find_player(m["team1_players"], "JPH")
    assert jph["is_captain"] is True
    assert jph["goals"] == 2
    assert jph["assists"] == 2

    jez = find_player(m["team1_players"], "Jez")
    assert jez["goals"] == 5
    assert jez["assists"] == 2

    will_mac = find_player(m["team1_players"], "Will Mac")
    assert will_mac["clean_sheets"] == 1

    nik = find_player(m["team2_players"], "Joel")
    assert nik["goals"] is None

    ram = find_player(m["team2_players"], "Ram")
    assert ram["is_captain"] is True

    team1_total = sum(p["goals"] or 0 for p in m["team1_players"])
    team2_total = sum(p["goals"] or 0 for p in m["team2_players"])
    assert team1_total == m["team1_goals"]
    assert team2_total == m["team2_goals"]
