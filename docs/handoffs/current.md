# Handoff: Per-user (or sharded) rank jobs; fair dequeue

**Status:** done  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** complete (lean)

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `rank-per-user-queue` |
| Parent issue | #109 — https://github.com/SpektrNO/newsroom/issues/109 |
| Open tasks | *(none)* |
| Closed tasks | `spec` (#110), `db` (#111), `api` (#112), `worker` (#113), `verify` (#114), `docs` (#115) |
| Backlog | `docs/feature-backlog.md` § B2 — Notes for `rank-per-user-queue` |

Task order: `spec` → `db` → `api` → `worker` → `verify` → `docs`

## Intent

Enqueue one rank job per dirty∩active user (single-flight per user) so ranking no longer serializes everyone behind one global job.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | Ingest marks users dirty; feed catch-up when dirty; CLI/worker drain |
| Surfaces | worker jobs queue, feed catch-up enqueue, ingest post-hook |
| Copy | None new (existing “Feed updating…” ok) |
| Acceptance | See criteria below |

### Acceptance criteria

1. Rank job `payload` includes `userId`; open job uniqueness is **per user** (pending/running), not global.
2. After ingest dirty fanout, enqueue one pending rank job per **dirty ∩ active** user (coalesce if already open for that user).
3. `GET /api/feed` catch-up calls `ensureNextRankJob` with the session `userId` only.
4. Worker claim remains fair (`scheduled_at` ASC + `FOR UPDATE SKIP LOCKED`); multiple users can have pending rank jobs.
5. `processRankJob` ranks that job’s `userId` only; clears dirty for that user on success (existing).
6. Keep dirty∩active eligibility from `rank-dirty-incremental`. Out of scope: AI caps (`rank-ai-budgets`), hosted AI swap.

## API / DB contract

| Field / Endpoint | Notes |
|------------------|-------|
| `jobs` | Unique partial index on `(payload->>'userId')` where `type=rank` and status in (`pending`,`running`) and userId present |
| `ensureNextRankJob(db, { userId, delayMs? })` | **Requires** `userId`; per-user single-flight |
| `enqueueRankJobsForEligibleUsers(db, { allDirty?, delayMs? })` | Lists dirty∩active (or all dirty) with topics; ensures one job each |
| Ingest success path | `markUsersDirty` then `enqueueRankJobsForEligibleUsers` (not a global rank job) |
| `POST /api/feed/rank` | Remains synchronous inline `runRank({ userId })` (unchanged product behavior) |

## Touchpoints

- `packages/db` — migration + schema index on `jobs`
- `apps/worker/src/rank.ts`, `ingest.ts`, `index.ts` — enqueue/claim/process
- `apps/web` — feed catch-up already passes `userId`; tighten types if needed
- Tests under `apps/worker`

## Out of scope

- AI token metering / article budgets
- Multiple worker processes beyond SKIP LOCKED fairness
- Changing Rank latest UX
- Closing parent #109 (PR `Closes #109`)

---

## Implementation result

### Delivered

- Migration `0004` + unique index `jobs_rank_open_user_uidx`
- `ensureNextRankJob` requires `userId`; `enqueueRankJobsForEligibleUsers` for dirty∩active fanout
- Ingest + one-shot CLI enqueue/drain per-user jobs; `processRankJob` fails without `userId`
- Tests: coalesce per user; missing payload fails

### Verification

- `pnpm --filter @newsroom/db typecheck`
- `pnpm --filter @newsroom/worker typecheck`
- `pnpm --filter @newsroom/web typecheck`
- `pnpm --filter @newsroom/worker test`

### Deviations

- No web/mobile task slugs; feed already passed `userId`.
- Poll loop still processes one claimed job per tick (fairness via queue depth, not parallel workers in-process).

### Follow-ups

- `ai-token-metering`, `rank-ai-budgets`, `rank-score-retention`
