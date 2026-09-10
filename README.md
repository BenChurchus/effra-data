# league-data

Turns ~150 Google Sheets season trackers (weekly 5-a-side scorecards, 3 years,
one file per source) into a queryable DuckDB base and readable per-gameweek
JSON, instead of fragile in-sheet formulas.

## Pipeline

```
python ingest.py <source_name> <path.xlsx> [<source_name> <path.xlsx> ...]
```

- **bronze** (`data/bronze/<source>/<tab>.json`) — every tab, raw, untouched
- **base** (`data/league.duckdb`) — `matches` + `appearances` tables
- **gold** (`data/gold/<source>/GW<N>.json`) — one clean record per gameweek

Each source file is expected to have tabs `GW1`...`GWN` (match scorecards) plus
a `Template` tab and derived summary tabs (`Analysis Tab`, `Captaincy`, `Apps`,
`Awards`) that are archived to bronze but not parsed — those carry live
formulas that get handled separately.

## Setup

```
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
```
