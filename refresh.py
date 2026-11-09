"""
Pull the live season from Google Sheets and rebuild everything.

Run by the scheduled GitHub Action after match days (and runnable locally):
    python refresh.py

- The current season is downloaded as .xlsx from its Google Sheet. The sheet
  must be shared "Anyone with the link: Viewer" so no login is needed.
- Finished seasons are rebuilt from their archived bronze copies in the repo,
  so their original sheets don't need to stay shared.
- The download is sanity-checked before anything is rebuilt: if Google
  returns an error page or a sheet without GW tabs, this exits non-zero and
  nothing is published.

New season? Add it to CURRENT (and move last season into ARCHIVED once its
bronze folder is committed).
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
from pathlib import Path

import openpyxl

ROOT = Path(__file__).parent
SOURCE = "effra"

# year -> Google Sheet id of the season still being played
CURRENT = {2026: "1CLY7edmX_m2TClYeUJ7cFaiH1BbIjqPu3ljxpUlk4z0"}
# finished seasons, rebuilt from data/bronze/<year>/<source>/
ARCHIVED = [2024, 2025]
# where the current season's workbook is saved (tests/test_spotcheck.py reads it)
CURRENT_XLSX = ROOT / "raw" / "effra_sample.xlsx"

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def download_sheet(sheet_id: str) -> bytes:
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    req = urllib.request.Request(url, headers={"User-Agent": "effra-data-refresh"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        ctype = resp.headers.get("Content-Type", "")
        body = resp.read()
    if XLSX_MIME not in ctype:
        raise SystemExit(f"Sheet {sheet_id}: expected an .xlsx export, got {ctype!r}. "
                         "Is it still shared 'Anyone with the link: Viewer'?")
    wb = openpyxl.load_workbook(io.BytesIO(body), read_only=True)
    gw_tabs = [n for n in wb.sheetnames if n.strip().lower().startswith("gw")]
    if not gw_tabs:
        raise SystemExit(f"Sheet {sheet_id}: downloaded, but it has no GW tabs ({wb.sheetnames[:5]}...)")
    print(f"Downloaded sheet {sheet_id}: {len(gw_tabs)} GW tabs, {len(body):,} bytes")
    return body


def gw_count(path: Path) -> int:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return len(data)
    except FileNotFoundError:
        return 0


def main() -> int:
    if len(CURRENT) != 1:
        raise SystemExit("refresh.py expects exactly one current season")
    (year, sheet_id), = CURRENT.items()

    before = gw_count(ROOT / "docs" / "matches.json")
    CURRENT_XLSX.parent.mkdir(parents=True, exist_ok=True)
    CURRENT_XLSX.write_bytes(download_sheet(sheet_id))

    args: list[str] = []
    for y in ARCHIVED:
        folder = ROOT / "data" / "bronze" / str(y) / SOURCE
        if not folder.is_dir():
            raise SystemExit(f"Archived season {y} has no bronze folder at {folder}")
        args += [str(y), SOURCE, str(folder)]
    args += [str(year), SOURCE, str(CURRENT_XLSX)]

    import ingest  # noqa: E402  (imported late so --help style use stays cheap)
    import build_site  # noqa: E402
    sys.argv = ["ingest.py", *args]
    ingest.main()
    build_site.main()

    after = gw_count(ROOT / "docs" / "matches.json")
    print(f"Matches: {before} -> {after}" + (f" (+{after - before} new)" if after > before else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
