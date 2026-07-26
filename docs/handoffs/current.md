# Handoff: Dirty users + preference invalidation + ingest fanout

**Status:** spec  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `rank-dirty-incremental` |
| Parent issue | #92 — https://github.com/SpektrNO/newsroom/issues/92 |
| Open tasks | `spec` (#93), `db` (#94), `api` (#95), `worker` (#96), `verify` (#97), `docs` (#98) |
| Backlog | `docs/feature-backlog.md` § B2 — Notes for `rank-dirty-incremental` |

Task order: `spec` → `db` → `api` → `worker` → `verify` → `docs`

## Intent

Rank only users who need it (preference/ingest dirty) and are active on the feed, so topic changes and new articles refresh scores without walking every user every time.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | Topic/source preference change; ingest upserts for a user’s subscriptions; feed read while dirty |
| Surfaces | worker rank/ingest, topic/source APIs, GET `/api/feed`, POST `/api/feed/rank` |
| Copy | Optional muted feed note when `needsRank` (e.g. “Feed updating…”) — keep calm |
| Acceptance | See criteria below |

### Acceptance criteria

1. `user.dirty_at` / `user.last_feed_at` exist (migration).
2. Topic create/patch/delete and source create/patch/delete mark session user dirty; topic preference changes invalidate `new`/`seen` scores (keep `saved`/`dismissed`).
3. Successful ingest marks **affected** subscription owners dirty (not every user).
4. Default `runRank` / worker rank processes **dirty ∩ active** (last feed activity within 30m); explicit `userId` (feed Rank latest / CLI) always ranks that user; `--all-dirty` ignores activity gate.
5. After a successful per-user rank pass, clear that user’s `dirty_at`.
6. `GET /api/feed` touches `last_feed_at`; if dirty, enqueue rank (single-flight) and return `needsRank: true`.
7. Tests cover dirty eligibility and preference invalidation; docs/backlog updated.

## API / DB contract

| Field / Endpoint | Type | Notes |
|------------------|------|-------|
| `user.dirty_at` | timestamptz null | Set when dirty; null when clean |
| `user.last_feed_at` | timestamptz null | Updated on authenticated feed GET |
| Helpers | `markUserDirty`, `markUsersDirty`, `clearUserDirty`, `touchFeedActivity`, `invalidatePreferenceScores` | `@newsroom/db` |
| `GET /api/feed` | + `needsRank?: boolean` | Dirty after touch |
| `POST /api/feed/rank` | unchanged sync | Clears dirty for that user on success |
| `pnpm worker:rank` | optional `--all-dirty` | Debug/ops |

## Touchpoints

- `packages/db` schema auth + migration + dirty helpers
- Topic/source API routes
- `apps/worker` ingest fanout + `rank.ts` eligibility
- Feed GET + api-client `FeedPage.needsRank`
- Light feed UI hint (optional)
- Tests + backlog/architecture/README as needed

## Out of scope

- Per-user job queue (`rank-per-user-queue`)
- AI article/token budgets
- Score TTL GC
- Hosted AI provider swap

---

## Implementation result

*(Developer agent fills this section.)*
