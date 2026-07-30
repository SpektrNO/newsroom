# GitHub workflow

How issues and docs stay in sync for feature work in `SpektrNO/newsroom`.

**Related:** [feature-backlog.md](./feature-backlog.md) · [feature-completed.md](./feature-completed.md) · [architecture.md](./architecture.md) · [contributing.md](./contributing.md)

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

| Script arg | Label | Project Status (default names) |
|------------|-------|--------------------------------|
| `todo` | `status/todo` | Todo |
| `in-progress` | `status/in-progress` | In Progress |
| `done` | `status/done` | Done |

```bash
gh auth refresh -h github.com -s read:project,project
./scripts/github-project-discover.sh SpektrNO
# Paste GITHUB_PROJECT_OWNER / GITHUB_PROJECT_NUMBER into .env
```

If the issue is not on the board yet, the status script **adds** it, then sets Status. Missing env or scopes → **warning only**; labels still apply.

## During work

1. Branch: `feature/<feature-id>` (one branch per feature).
2. Load tracking: `./scripts/load-feature-issue.sh <feature-id>`
3. Start a task: `./scripts/github-issue-status.sh in-progress <task#> <parent#>`
4. Implement that task’s scope only; commit on the feature branch.
5. Close the **task** when done (`gh issue close <task#>`). Never close the parent feature until the PR merges with `Closes #<parent>`.

## Feature done + PR

```bash
FEATURE=scaffold-monorepo
REPO=SpektrNO/newsroom
PR=123

./scripts/load-feature-issue.sh "$FEATURE"
# Close any remaining task sub-issues (not the parent)
gh issue close <task#> --repo "$REPO" --comment "Completed in PR #$PR"

./scripts/record-feature-complete.sh "$FEATURE" --issue <parent#> --note "PR #$PR"
# PR body should include: Closes #<parent>
```
