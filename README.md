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
- **site** (`docs/`) — static site on GitHub Pages, built and deployed by
  `.github/workflows/site.yml` (tests must pass before anything is published):
  - `index.html` — Leaderboard (Players / Pairings / Nemesis / Venues) /
    Players / Matches tabs, season filter, radar + cumulative charts, venue
    split, "pair with" head-to-head, **Season Wrapped** story reveal per
    player, theme toggle, deep links (`#tab=players&y=2026&p=Jez&with=Ram`,
    add `&w=1` to open Wrapped)
  - `master.html` — the **gaffer's room** (awards + master sheet), published
    **encrypted** (see below). Its source is `site-src/master.html`.
  - `effra.js` — the one stats engine every page uses (awards/streaks/pairs/
    venues are computed in the browser from `matches.json`); `charts.js` — SVG
    charts; `wrapped.js` — Season Wrapped; `effra.css` — crest-blue/pint-gold
    theme with a navy dark mode
  - `assets/` — crest PNGs and icons generated from `branding/` originals
  - Asset links carry `?v=<content hash>` (stamped by `build_site.py`) so a
    cached old script can never run against a new page.

## Automatic refresh

`site.yml` runs `refresh.py` every **Wednesday and Friday at 07:00 UTC** (the
morning after Tuesday/Thursday games) and on demand (Actions → Site → Run
workflow). It downloads the current season's Google Sheet as .xlsx (the sheet
must stay shared *Anyone with the link: Viewer*), rebuilds finished seasons
from their bronze archive in the repo, runs the tests, commits new data and
deploys. A bad download (error page, no GW tabs) or a failing test stops it
before anything is published. Locally: `python refresh.py`.

New season: add its sheet id to `CURRENT` in `refresh.py` and move the old
year into `ARCHIVED`.

## Gaffer's room (password)

`build_site.py` encrypts `site-src/master.html` into `docs/master.html`
(AES-256-GCM, key from the password via PBKDF2-SHA256, 310k rounds); the
browser decrypts it with WebCrypto. The password lives only in a local,
git-ignored `.gaffer-password` file (or `EFFRA_GAFFER_PASSWORD`). To change
it, edit that file and run `python build_site.py`. The scheduled refresh has no
password and leaves the encrypted page alone — so after changing shared code
(`effra.js`, `effra.css`, `site-src/master.html`) rebuild locally; a test fails
if the encrypted page is stale. Caveat: this hides the awards *page*; the
match data and stats engine are public, so a determined person could still
recompute standings.

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
