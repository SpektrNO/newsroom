# Handoff: Dirty users + preference invalidation + ingest fanout

**Status:** done  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** complete (lean)

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `rank-dirty-incremental` |
| Parent issue | #92 — https://github.com/SpektrNO/newsroom/issues/92 |
| Open tasks | *(none)* |
| Closed tasks | `spec` (#93), `db` (#94), `api` (#95), `worker` (#96), `verify` (#97), `docs` (#98) |
| Backlog | `docs/feature-backlog.md` § B2 — Notes for `rank-dirty-incremental` |

Task order: `spec` → `db` → `api` → `worker` → `verify` → `docs`

## Intent

Rank only users who need it (preference/ingest dirty) and are active on the feed, so topic changes and new articles refresh scores without walking every user every time.

## User-facing spec

Curated dirty ∩ active ranking with preference invalidation and feed catch-up.

### Acceptance criteria

1. `user.dirty_at` / `user.last_feed_at` exist (migration).
2. Topic create/patch/delete and source create/patch/delete mark session user dirty; topic preference changes invalidate `new`/`seen` scores (keep `saved`/`dismissed`).
3. Successful ingest marks **affected** subscription owners dirty (not every user).
4. Default `runRank` / worker rank processes **dirty ∩ active** (last feed activity within 30m); explicit `userId` (feed Rank latest / CLI) always ranks that user; `--all-dirty` ignores activity gate.
5. After a successful per-user rank pass, clear that user’s `dirty_at`.
6. `GET /api/feed` touches `last_feed_at`; if dirty, enqueue rank (single-flight) and return `needsRank: true`.
7. Tests cover dirty eligibility and preference invalidation; docs/backlog updated.

## Implementation result

### Delivered

- Migration `0003` + helpers in `packages/db/src/rank-dirty.ts`
- Topic/source APIs mark dirty; topics invalidate new/seen scores
- Feed GET: activity touch, catch-up enqueue, `needsRank` + muted “Feed updating…”
- Worker: dirty∩active eligibility, ingest `affectedUserIds` fanout, `clearUserDirty`, `--all-dirty`
- Tests: idle skip / allDirty / invalidatePreferenceScores; mock uses short id `r0`

### Verification

- `pnpm --filter @newsroom/db typecheck`
- `pnpm --filter @newsroom/worker typecheck`
- `pnpm --filter @newsroom/web typecheck`
- `pnpm --filter @newsroom/worker test`

### Deviations

- No separate web task slug; light feed hint shipped with API.
- Global single-flight rank jobs unchanged (`rank-per-user-queue` follow-up).

### Follow-ups

- `rank-per-user-queue`, `ai-token-metering`, `rank-ai-budgets`
