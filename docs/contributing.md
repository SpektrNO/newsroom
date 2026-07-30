# Contributing

## Product docs (public)

| Doc | Purpose |
|-----|---------|
| [architecture.md](./architecture.md) | System design, data model, APIs |
| [feature-backlog.md](./feature-backlog.md) | Feature index |
| [feature-completed.md](./feature-completed.md) | Shipped registry |
| [ops-local.md](./ops-local.md) | Local runbook |
| [decisions/](./decisions/) | ADRs for non-obvious choices |
| [github-workflow.md](./github-workflow.md) | Issue / PR conventions and helper scripts |

## Engineering norms

Tracked Cursor rules under `.cursor/rules/` encode durable standards (simplicity, surgical diffs, keeping `docs/` and `README` honest). They are intentional product hygiene — not a full agent playbook.

## Optional local agent workflow

Maintainers may use a private Cursor pipeline (agent prompts, skills, and `docs/handoffs/`) for feature delivery. Those paths are **gitignored** so clones stay focused on the application. Restore them from your own machine history or internal docs if you need them; they are not required to build or run Newsroom.
