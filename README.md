# Newsroom

Focused news for topics you care about — Hacker News, Substack, and more — with a simple web UI and Expo mobile apps.

Personal-first; multi-user-ready data model and APIs.

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/architecture.md](docs/architecture.md) | System design, data model, APIs |
| [docs/feature-backlog.md](docs/feature-backlog.md) | Feature segmentation index |
| [docs/feature-completed.md](docs/feature-completed.md) | Shipped registry |
| [docs/github-workflow.md](docs/github-workflow.md) | Issues, handoffs, scripts |

## Spec → implement pipeline

1. **Specifier** (`.cursor/agents/specifier.md`) → `docs/handoffs/current.md`
2. **Developer** (`.cursor/agents/developer-implementer.md`) → implements + records

```text
/spec-and-implement <feature-id> — full
/spec-only <feature-id>
/lean-implement <feature-id>
/implement-handoff
```

See [docs/github-workflow.md](docs/github-workflow.md).

```bash
./scripts/load-feature-issue.sh <feature-id>
./scripts/github-issue-status.sh in-progress <task#> <parent#>
./scripts/create-feature-issues.sh --dry-run
./scripts/record-feature-complete.sh <feature-id>
```

## Status

Process scaffolding is in place. Application monorepo (`scaffold-monorepo`) is next.
