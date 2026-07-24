# Feature Completed

Shipped features registry. Complements [feature-backlog.md](./feature-backlog.md).

```bash
./scripts/record-feature-complete.sh <feature-id> [--issue N] [--note "..."]
```

---

## Recent completions

| Date | ID | Feature | GitHub | Notes |
|------|-----|---------|--------|-------|
| 2026-07-24 | `scaffold-monorepo` | Turborepo apps/packages, Compose, auth, health | #6 | auth + health monorepo scaffold |
| 2026-07-24 | `ingest-hn-substack` | HN + Substack adapters, article upsert | #12 | Completed via spec→implement pipeline |
| 2026-07-24 | `hybrid-rank-feed` | Keyword shortlist, Ollama rank, feed API | #19 | topics/feed APIs + worker rank; no UI polish |
| _—_ | _pipeline completions append here (newest first)_ | | | |

## A. Foundation

| ID | Feature | Completed | Spec | Notes |
|----|---------|-----------|------|-------|
| `scaffold-monorepo` | Turborepo apps/packages, Compose, auth, health | 2026-07-24 | `docs/architecture.md` | auth + health monorepo scaffold |

## B. Ingest and ranking

| ID | Feature | Completed | Spec | Notes |
|----|---------|-----------|------|-------|
| `ingest-hn-substack` | HN + Substack adapters, article upsert | 2026-07-24 | `docs/architecture.md` | Completed via spec→implement pipeline |
| `hybrid-rank-feed` | Keyword shortlist, Ollama rank, feed API | 2026-07-24 | `docs/architecture.md` | topics/feed APIs + worker rank; no UI polish |