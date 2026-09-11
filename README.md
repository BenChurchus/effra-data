# effra-data

Turns ~150 Google Sheets season trackers (weekly 5-a-side scorecards, 3 years,
one file per source) into a queryable DuckDB base and readable per-gameweek
JSON, instead of fragile in-sheet formulas.

**Live site**: https://benchurchus.github.io/effra-data/ — pick a player or a
gameweek from the dropdowns to see their record / that match.

## Pipeline

```
python ingest.py [<year>] <source_name> <path.xlsx> [ [<year>] <source_name> <path.xlsx> ... ]
python build_site.py   # regenerate docs/players.json + docs/matches.json
```

`<year>` is optional; when provided the raw workbook is archived under
`data/bronze/<year>/<source_name>/`, which keeps 2025 and 2026 tabs separate.

- **bronze** (`data/bronze/<year>/<source>/<tab>.json`) — every tab, raw, untouched
- **base** (`data/league.duckdb`) — `matches` + `appearances` tables. DuckDB
  turned out to be a great fit here: single file, no server, reads/queries
  the data instantly, and doubles as a portable artifact in the repo.
- **gold** (`data/gold/<source>/GW<N>.json`) — one clean record per gameweek
- **site** (`docs/`) — static player/gameweek lookup, hosted via GitHub Pages
  from `main` / `/docs`

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

- **Scale to the other ~149 sources.** Only "Effra" (this season) is wired in
  so far. Need the list/location of the rest, then just run `ingest.py` with
  each `(name, xlsx)` pair — the parser already handles the quirks found so
  far, but expect new ones; extend `tests/` rather than hand-checking each
  new source.
- **`Analysis Tab` formulas.** Deliberately not parsed yet — it's broken in
  the raw export (`#NAME?` errors) and the user is handing over the "heavy
  lifting" formula logic separately to reimplement properly in DuckDB
  instead of trusting the sheet's own calculations.
- **Microsite polish.** Currently two independent dropdowns (player, GW) on
  one static page. No cross-linking (e.g. click a name in a match to jump to
  their player page), no season/source filter yet — fine while there's one
  source, will matter once there are ~150.
- **This machine has no `gh` CLI, no SSH key for GitHub, and no Node/npm** —
  pushes work via Git Credential Manager (already configured, authenticates
  silently), and there's no headless-browser tooling for visually testing
  the microsite (verification here has relied on curl smoke tests + a
  manual JS trace + the pytest suite). Worth knowing before assuming either
  is available in a fresh session.
