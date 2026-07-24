#!/usr/bin/env bash
# Discover GitHub Projects V2 for the configured owner and print .env lines
# for Status sync (used by github-issue-status.sh).
#
# Usage:
#   ./scripts/github-project-discover.sh
#   ./scripts/github-project-discover.sh SpektrNO
#   ./scripts/github-project-discover.sh SpektrNO 1
#
# Requires: gh auth with scopes read:project (and project to write later).
#   gh auth refresh -h github.com -s read:project,project

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/gh-env.sh
source "$ROOT/scripts/lib/gh-env.sh"
# shellcheck source=lib/gh-project.sh
source "$ROOT/scripts/lib/gh-project.sh"

load_gh_env "$ROOT"

if ! gh_ready "$ROOT"; then
  echo "error: gh not authenticated. Set GH_TOKEN in .env or run: gh auth login" >&2
  exit 1
fi

OWNER="${1:-${GITHUB_PROJECT_OWNER:-SpektrNO}}"
PICK_NUMBER="${2:-}"

list_projects_json() {
  local owner="$1"
  local query result err
  query='
    query($owner: String!) {
      organization(login: $owner) {
        projectsV2(first: 20) {
          nodes { id number title url }
        }
      }
    }'
  err="$(mktemp)"
  if result="$(gh api graphql -f query="$query" -F owner="$owner" 2>"$err")"; then
    local nodes
    nodes="$(echo "$result" | jq -c '.data.organization.projectsV2.nodes // []')"
    if [[ "$nodes" != "[]" && "$nodes" != "null" ]]; then
      rm -f "$err"
      echo "$result" | jq -c '.data.organization.projectsV2.nodes[]'
      return 0
    fi
  else
    if grep -qi 'INSUFFICIENT_SCOPES\|read:project' "$err" 2>/dev/null; then
      cat "$err" >&2
      rm -f "$err"
      echo "hint: run: gh auth refresh -h github.com -s read:project,project" >&2
      return 1
    fi
  fi
  rm -f "$err"

  query='
    query($owner: String!) {
      user(login: $owner) {
        projectsV2(first: 20) {
          nodes { id number title url }
        }
      }
    }'
  err="$(mktemp)"
  if ! result="$(gh api graphql -f query="$query" -F owner="$owner" 2>"$err")"; then
    cat "$err" >&2
    rm -f "$err"
    echo "error: cannot list projects for $owner" >&2
    echo "hint: run: gh auth refresh -h github.com -s read:project,project" >&2
    return 1
  fi
  rm -f "$err"
  echo "$result" | jq -c '.data.user.projectsV2.nodes[]?'
}

echo "Projects for owner: $OWNER"
echo "----------------------------"
if ! mapfile -t PROJECT_LINES < <(list_projects_json "$OWNER"); then
  exit 1
fi
if [[ ${#PROJECT_LINES[@]} -eq 0 ]]; then
  echo "(none found)"
  exit 1
fi

for line in "${PROJECT_LINES[@]}"; do
  echo "$line" | jq -r '"#\(.number)  \(.title)  \(.url)"'
done

if [[ -z "$PICK_NUMBER" ]]; then
  if [[ ${#PROJECT_LINES[@]} -eq 1 ]]; then
    PICK_NUMBER="$(echo "${PROJECT_LINES[0]}" | jq -r .number)"
    echo
    echo "Using sole project #$PICK_NUMBER"
  else
    echo
    echo "Re-run with a project number, e.g.:"
    echo "  $0 $OWNER <number>"
    exit 0
  fi
fi

FIELD_NAME="${GITHUB_PROJECT_STATUS_FIELD:-Status}"
export GITHUB_PROJECT_OWNER="$OWNER"
export GITHUB_PROJECT_NUMBER="$PICK_NUMBER"
export GITHUB_PROJECT_STATUS_FIELD="$FIELD_NAME"

# Clear cache so resolve uses this pick
_GH_PROJECT_ID=""
_GH_PROJECT_STATUS_FIELD_ID=""
_GH_PROJECT_STATUS_OPTIONS=""

if ! gh_project_resolve; then
  exit 1
fi

echo
echo "Status field options:"
echo "$_GH_PROJECT_STATUS_OPTIONS" | while IFS='|' read -r name id; do
  [[ -z "$name" ]] && continue
  echo "  - $name  ($id)"
done

echo
echo "Add to .env:"
echo "GITHUB_PROJECT_OWNER=$OWNER"
echo "GITHUB_PROJECT_NUMBER=$PICK_NUMBER"
echo "# Optional if your board uses different option names:"
echo "# GITHUB_PROJECT_STATUS_FIELD=Status"
echo "# GITHUB_PROJECT_STATUS_TODO=Todo"
echo "# GITHUB_PROJECT_STATUS_IN_PROGRESS=In Progress"
echo "# GITHUB_PROJECT_STATUS_DONE=Done"
echo
echo "Scopes required to write Status: read:project, project"
echo "  gh auth refresh -h github.com -s read:project,project"
