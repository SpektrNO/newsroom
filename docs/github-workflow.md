# GitHub workflow

How issues, handoffs, and docs stay in sync for feature work in `SpektrNO/newsroom`.

**Related:** [feature-backlog.md](./feature-backlog.md) · [feature-completed.md](./feature-completed.md) · [handoffs/current.md](./handoffs/current.md) · [architecture.md](./architecture.md)

## Issue hierarchy

```
Section epic (type: Epic)
└── Feature issue (type: Feature)     title: [feature-id] …
    └── Task sub-issues (type: Task)  title: [feature-id/slug] …
```

Task slugs (in order): `audit` → `spec` → `db` → `api` → `worker` → `web` → `mobile` → `verify` → `docs`

Section-specific omissions (see `create-feature-issues.sh`):

| Section | Tasks after `spec`/`audit` |
|---------|----------------------------|
| foundation / infra | `db`, `api`, `verify`, `docs` |
| ingest / rank | `db`, `api`, `worker`, `verify`, `docs` |
| web | `api`, `web`, `verify`, `docs` |
| mobile | `api`, `mobile`, `verify`, `docs` |
| default | full stack |

**Workflow labels** (mutually exclusive): `status/todo` → `status/in-progress` → `status/done`  
Labels track progress; **closing** an issue is separate (see below).

## Prerequisites

```bash
# .env (see .env.example)
GITHUB_REPO=SpektrNO/newsroom
GH_TOKEN=...

# or
gh auth login

# Project Status sync (optional)
gh auth refresh -h github.com -s read:project,project
./scripts/github-project-discover.sh SpektrNO   # paste GITHUB_PROJECT_* into .env
```

## Scripts

| Script | Purpose |
|--------|---------|
| `create-feature-issues.sh` | Create section epics + feature issues + task sub-issues from `feature-backlog.md` |
| `load-feature-issue.sh` | Resolve a feature by issue #, id, or title; list open/closed sub-tasks |
| `github-issue-status.sh` | Set `status/todo`, `status/in-progress`, or `status/done` on issue(s); syncs Project **Status** when configured |
| `github-project-discover.sh` | List org/user Projects V2 and print `.env` lines for Status sync |
| `record-feature-complete.sh` | Mark feature ✅ in backlog; append to `feature-completed.md` |

`record-feature-complete.sh` updates **docs only** — it does not close GitHub issues.

### GitHub Project Status sync

Workflow labels and the board **Status** field stay aligned when agents call `github-issue-status.sh`:

| Script arg | Label | Project Status (default names) |
|------------|-------|--------------------------------|
| `todo` | `status/todo` | Todo |
| `in-progress` | `status/in-progress` | In Progress |
| `done` | `status/done` | Done |

Setup:

```bash
gh auth refresh -h github.com -s read:project,project
./scripts/github-project-discover.sh SpektrNO
# Paste GITHUB_PROJECT_OWNER / GITHUB_PROJECT_NUMBER into .env
```

If the issue is not on the board yet, the status script **adds** it, then sets Status. Missing env or scopes → **warning only**; labels still apply.

## During work

1. Load tracking: `./scripts/load-feature-issue.sh <feature-id>`
2. Start a task: `./scripts/github-issue-status.sh in-progress <task#> <parent#>`
3. Implement that task’s scope only.
4. Close the task when done:

```bash
gh issue close <task#> --repo SpektrNO/newsroom --comment "Done: <short reason>"
```

Repeat for each open sub-task in slug order.

## Feature branch + PR (agent pipeline)

Canonical branch: **`feature/<feature-id>`**. Spec and all implementation tasks commit on **that one branch** — do not create per-task branches.

Supervisor (Cursor) before Tasks:

1. Resolve parent feature via `./scripts/load-feature-issue.sh`
2. **If starting a new feature:** verify prior `docs/handoffs/current.md` is complete (Status `done`, backlog ✅, task sub-issues closed) → archive to `docs/handoffs/archive/YYYY-MM-DD-<id>.md`
3. Checkout or create `feature/<feature-id>` and link it on the parent issue (comment or `gh issue develop`)
4. After implement handoff Status `done` → ensure branch is pushed and `gh pr create` linking the parent issue

Workers **commit and push on the feature branch after each closed task**. Supervisor does not squash that history unless asked.

Agents follow `.cursor/skills/spec-and-implement/SKILL.md`: **full** mode Task-launches workers; **lean** (`/lean-implement` or `--lean`) does thin handoff + implement in the supervisor chat. Then open the PR.

## Feature done + PR open

```bash
FEATURE=scaffold-monorepo   # feature id
REPO=SpektrNO/newsroom
PR=123                       # your PR number

# 1) See what is still open
./scripts/load-feature-issue.sh "$FEATURE"

# 2) Close any remaining **task** sub-issues (not the parent feature)
gh issue close <task#> --repo "$REPO" --comment "Completed in PR #$PR"

# 3) Optional: mark parent feature label status/done — leave the issue **open**
./scripts/github-issue-status.sh done <parent-feature#>

# 4) Do **not** close the parent feature issue here.
#    PR body should include: Closes #<parent>

# 5) Record docs completion
./scripts/record-feature-complete.sh "$FEATURE" --issue <parent#> --note "PR #$PR"

# 6) Archive handoff
# mv docs/handoffs/current.md docs/handoffs/archive/YYYY-MM-DD-$FEATURE.md
```
