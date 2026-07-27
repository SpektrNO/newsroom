#!/usr/bin/env bash
# Record a shipped feature in docs/feature-completed.md and mark ✅ in feature-backlog.md.
#
# Usage:
#   ./scripts/record-feature-complete.sh prog-clarity-flash
#   ./scripts/record-feature-complete.sh prog-clarity-flash --issue 42 --note "via implement-handoff"
#   ./scripts/record-feature-complete.sh --dry-run prog-clarity-flash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKLOG="$ROOT/docs/feature-backlog.md"
COMPLETED="$ROOT/docs/feature-completed.md"

DRY_RUN=false
FEATURE_ID=""
ISSUE=""
NOTE=""
DATE="$(date +%Y-%m-%d)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --issue) ISSUE="$2"; shift 2 ;;
    --note) NOTE="$2"; shift 2 ;;
    --date) DATE="$2"; shift 2 ;;
    -*) echo "unknown option: $1" >&2; exit 1 ;;
    *)
      if [[ -z "$FEATURE_ID" ]]; then
        FEATURE_ID="$1"
      else
        echo "unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$FEATURE_ID" ]]; then
  echo "usage: $0 <feature-id> [--issue N] [--note text] [--date YYYY-MM-DD] [--dry-run]" >&2
  exit 1
fi

export ROOT BACKLOG COMPLETED FEATURE_ID ISSUE NOTE DATE DRY_RUN
python3 <<'PY'
import os
import re
import sys
from pathlib import Path

root = Path(os.environ["ROOT"])
backlog = Path(os.environ["BACKLOG"])
completed = Path(os.environ["COMPLETED"])
feature_id = os.environ["FEATURE_ID"]
issue = os.environ.get("ISSUE", "")
note = os.environ.get("NOTE", "")
date = os.environ["DATE"]
dry_run = os.environ.get("DRY_RUN", "false") == "true"

SECTION_HEADERS = {
    "scaffold-": "## A. Foundation",
    "ingest-": "## B. Ingest and ranking",
    "hybrid-": "## B. Ingest and ranking",
    "rank-": "## B. Ingest and ranking",
    "ai-": "## B. Ingest and ranking",
    "web-": "## C. Web client",
    "wipe-": "## C. Web client",
    "mobile-": "## D. Mobile client",
    "multiuser-": "## E. Multi-user and channels",
    "source-": "## E. Multi-user and channels",
}

def section_for(fid: str) -> str:
    for prefix, header in SECTION_HEADERS.items():
        if fid.startswith(prefix):
            return header
    return "## Other"


def parse_backlog(text: str, fid: str) -> dict | None:
    # Standard 4-column row: | `id` | title | status | spec |
    row4 = re.compile(
        rf"^\|\s*`{re.escape(fid)}`\s*\|\s*(.+?)\s*\|\s*([✅🟡⬜])\s*\|\s*(.+?)\s*\|",
        re.MULTILINE,
    )
    m = row4.search(text)
    if m:
        return {"title": m.group(1).strip(), "status": m.group(2), "spec": m.group(3).strip()}

    # Aspect table 5-column: | `id` | title | aspect | status | spec |
    row5 = re.compile(
        rf"^\|\s*`{re.escape(fid)}`\s*\|\s*(.+?)\s*\|\s*.+?\s*\|\s*([✅🟡⬜])\s*\|\s*(.+?)\s*\|",
        re.MULTILINE,
    )
    m = row5.search(text)
    if m:
        return {"title": m.group(1).strip(), "status": m.group(2), "spec": m.group(3).strip()}

    # Cosmogram tier tables: | `id` | tier | status | catalog |
    row_cosmo = re.compile(
        rf"^\|\s*`{re.escape(fid)}`\s*\|\s*.+?\s*\|\s*([✅🟡⬜])\s*\|\s*(.+?)\s*\|",
        re.MULTILINE,
    )
    m = row_cosmo.search(text)
    if m:
        return {
            "title": fid.replace("-", " ").replace("cosmo ", "Cosmogram "),
            "status": m.group(1),
            "spec": f"`docs/narrative/cosmogram.md`, catalog `{m.group(2).strip()}`",
        }
    return None


backlog_text = backlog.read_text(encoding="utf-8")
meta = parse_backlog(backlog_text, feature_id)
if not meta:
    print(f"error: feature id `{feature_id}` not found in {backlog}", file=sys.stderr)
    sys.exit(1)

if meta["status"] == "✅" and f"`{feature_id}`" in completed.read_text(encoding="utf-8"):
    print(f"skip: `{feature_id}` already marked complete in backlog and listed in feature-completed.md")
    sys.exit(0)

github = f"#{issue}" if issue else "—"
notes = note or "Completed via spec→implement pipeline"
section = section_for(feature_id)
completed_text = completed.read_text(encoding="utf-8")

if f"`{feature_id}`" in completed_text:
    print(f"note: `{feature_id}` already in feature-completed.md; updating backlog only if needed")
else:
    # Recent completions table — insert after header row
    recent_row = f"| {date} | `{feature_id}` | {meta['title']} | {github} | {notes} |"
    marker = "| _—_ | _pipeline completions append here (newest first)_ | | | |"
    if marker in completed_text:
        completed_text = completed_text.replace(
            marker,
            f"{recent_row}\n| _—_ | _pipeline completions append here (newest first)_ | | | |",
            1,
        )
    else:
        completed_text = re.sub(
            r"(## Recent completions\n\n\| Date \| ID \| Feature \| GitHub \| Notes \|\n\|[-| ]+\|\n)",
            rf"\1{recent_row}\n",
            completed_text,
            count=1,
        )

    section_row = (
        f"| `{feature_id}` | {meta['title']} | {date} | {meta['spec']} | {notes} |"
    )

    if section == "## C–I. Other areas":
        placeholder = "_No pipeline completions yet._"
        if placeholder in completed_text:
            completed_text = completed_text.replace(
                placeholder,
                f"### {section}\n\n| ID | Feature | Completed | Spec | Notes |\n"
                f"|----|---------|-----------|------|-------|\n{section_row}",
                1,
            )
        else:
            completed_text += f"\n{section_row}\n"
    elif section in completed_text:
        # Append row before next --- or end of section table
        pattern = re.compile(
            re.escape(section) + r"\n\n\| ID \| Feature \| Completed \| Spec \| Notes \|\n\|[-| ]+\|\n"
            r"(.*?)(?=\n---|\n## |\Z)",
            re.DOTALL,
        )

        def add_row(m: re.Match) -> str:
            body = m.group(1).rstrip("\n")
            return (
                f"{section}\n\n| ID | Feature | Completed | Spec | Notes |\n|----|---------|-----------|------|-------|\n"
                f"{body}\n{section_row}"
            )

        completed_text, n = pattern.subn(add_row, completed_text, count=1)
        if n == 0:
            completed_text += f"\n\n{section}\n\n| ID | Feature | Completed | Spec | Notes |\n|----|---------|-----------|------|-------|\n{section_row}\n"
    else:
        completed_text = completed_text.rstrip() + (
            f"\n\n{section}\n\n| ID | Feature | Completed | Spec | Notes |\n"
            f"|----|---------|-----------|------|-------|\n{section_row}\n"
        )

# Update backlog status to ✅
new_backlog = re.sub(
    rf"(\|\s*`{re.escape(feature_id)}`\s*\|\s*.+?\s*\|\s*)[✅🟡⬜](\s*\|)",
    r"\1✅\2",
    backlog_text,
    count=1,
)
if new_backlog == backlog_text:
    print(f"warning: could not update status for `{feature_id}` in backlog", file=sys.stderr)
else:
    backlog_text = new_backlog

if dry_run:
    print(f"DRY RUN: would record `{feature_id}` ({meta['title']}) on {date}")
    print(f"  section: {section}")
    print(f"  github: {github}")
    print(f"  note: {notes}")
    sys.exit(0)

completed.write_text(completed_text, encoding="utf-8")
backlog.write_text(backlog_text, encoding="utf-8")
print(f"recorded: `{feature_id}` → docs/feature-completed.md ({date})")
print(f"updated: docs/feature-backlog.md status → ✅")
PY
