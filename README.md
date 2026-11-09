# effra-data

Turns ~150 Google Sheets season trackers (weekly 5-a-side scorecards, 3 years,
one file per source) into a queryable DuckDB base and readable per-gameweek
JSON, instead of fragile in-sheet formulas.

**Live site**: https://benchurchus.github.io/effra-data/ — pick a player or a
gameweek from the dropdowns to see their record / that match.

## Current state

The repo is now set up to process the live multi-season data set used by the site:

- 2024: source workbook kept outside the repo
- 2025: source workbook kept outside the repo
- 2026: current season workbook kept outside the repo

The pipeline keeps the raw exports separate by year and rebuilds the static site
from the canonicalized match records. Source workbooks are intentionally kept in
an external local archive and ignored by Git so the repo stays lean while the
versioned data remains in bronze + DuckDB + generated docs.

Recommended local storage pattern:

- `C:/Users/bened/effra-data/raw/` for current workbooks
- or a dedicated external archive folder if you want to keep raw files off the
  project drive entirely

This keeps the repo clean without losing the original source material.

## Pipeline

```
python ingest.py [<year>] <source_name> <path.xlsx> [ [<year>] <source_name> <path.xlsx> ... ]
python build_site.py   # regenerate docs/players.json + docs/matches.json
```

`<year>` is optional; when provided the raw workbook is archived under
`data/bronze/<year>/<source_name>/`, which keeps each season's tabs separate.

- **bronze** (`data/bronze/<year>/<source>/<tab>.json`) — every tab, raw, untouched
- **silver** (`data/silver/<year>/<source>/GW<N>.json`) — per-gameweek canonicalized rows after name cleanup and aliasing
- **base** (`data/league.duckdb`) — `matches` + `appearances` tables. DuckDB
  turned out to be a great fit here: single file, no server, reads/queries
  the data instantly, and doubles as a portable artifact in the repo.
- **gold** (`data/gold/<year>/<source>/GW<N>.json`) — one clean record per gameweek
- **site** (`docs/`) — static site, hosted via GitHub Pages from `main` / `/docs`:
  - `index.html` — Leaderboard / Players / Matches tabs, season filter, radar +
    cumulative charts, pairings, "pair with" head-to-head, theme toggle,
    shareable deep links (`#tab=players&y=2026&p=Jez&with=Ram`)
  - `master.html` — **unlisted** master sheet: all 16 awards (with runners-up and
    adjustable thresholds), a wide per-player sheet and a per-pair sheet, CSV
    export. `noindex` and not linked anywhere, but *not private* — anyone with
    the URL or access to this public repo can open it.
  - `effra.js` — the one stats engine both pages use (all awards/streaks/pairs
    are computed in the browser from `matches.json`); `charts.js` — SVG charts;
    `effra.css` — crest-blue/pint-gold theme with a navy dark mode
  - `assets/` — crest PNGs and icons generated from `branding/` originals

Each source file is expected to have tabs `GW1`...`GWN` (match scorecards) plus
a `Template` tab and derived summary tabs (`Analysis Tab`, `Captaincy`, `Apps`,
`Awards`) that are archived to bronze but not parsed — those carry live
formulas that get handled separately.

## Known source data quirks the parser handles

Manual weekly data entry across 3 years produces real inconsistencies. Found
so far (via `tests/test_data_quality.py` and spot-checks against raw tabs):

- Some rows use `"Y"` in the clean-sheets column (copying the captain-flag
  convention) instead of a count — normalized to `1`.
- Stray leading/trailing whitespace on names and venues (e.g. `"Jez "`
  silently fractured into a second player) — stripped during parsing.
- A player's name occasionally lands in column A (reserved for `"Score"`/the
  GW header) instead of column B, dropping them from Team1 entirely — the
  parser recovers these (see GW14 in `tests/test_spotcheck.py`).
- A tab can be correctly named (`GW33`) while its internal header cell still
  says something else (`"GW12"`, leftover from copy-paste) — harmless, since
  the parser keys off the tab name, not that cell.

## Tests

```
pytest tests/
```

`test_spotcheck.py` independently re-parses specific gameweeks straight from
the source `.xlsx` (bypassing `ingest.py`) and checks the published JSON
agrees. `test_data_quality.py` runs generic invariants (no whitespace/case
duplicate names, per-player goals sum to the recorded scoreline) meant to
keep catching this class of issue as more of the ~150 sources are added.

## Setup

```
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
```

## Next steps

- **Scale to more seasons/sources.** The parser is now verified against 2024,
  2025 and the current 2026 source set. Add more workbooks by reusing the same
  pattern in `ingest.py` and keeping each season in its own raw bronze folder.
- **`Analysis Tab` formulas.** Deliberately not parsed yet — it's broken in
  the raw export (`#NAME?` errors) and the user is handing over the "heavy
  lifting" formula logic separately to reimplement properly in DuckDB
  instead of trusting the sheet's own calculations.
- **Award thresholds (agreed Nov 2026):** 12+ apps for individual awards,
  8+ games for pairings and Nemesis, 3+ captaincies — fixed in
  `defaultThresholds` in `docs/effra.js`. Still open: the literal G+A rule
  ("not awarded" when it duplicates Golden Boot/Assist King) and a tiebreaker
  for tied awards. Data Darling is a suggestion only (win-rate impact).
- **Verification loop.** Project checks remain simple and reliable: run
  `python build_site.py` and `pytest tests/` after any source or parser change.
