# Handoff: Wipe current rankings

**Status:** done  
**Created:** 2026-07-27  
**Specifier agent:** lean (in-supervisor)  
**Developer agent:** complete (lean)

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `wipe-rankings` |
| Parent issue | #143 — https://github.com/SpektrNO/newsroom/issues/143 |
| Open tasks | *(none)* |
| Closed / Phase-1 | `spec` (#144), `api` (#145), `web` (#146), `verify` (#147), `docs` (#148) |
| Backlog | `docs/feature-backlog.md` § C — Notes for `wipe-rankings` |

Task order: `spec` → `api` → `web` → `verify` → `docs`

## Intent

Signed-in users can wipe ranked feed scores while keeping Saved/Dismissed, then re-rank manually when ready.

## Decisions (locked)

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Keep statuses | **Saved + Dismissed** score rows stay | User request |
| Auto re-rank | **No** — wipe only; clear `dirtyAt` so feed catch-up does not enqueue | User request |
| Evaluations | Delete eval markers for articles with **no remaining** score | Rank latest can re-walk wiped articles |
| Surface | Feed toolbar beside **Rank latest** | Ops-adjacent; matches Rank latest |
| Confirm | `window.confirm` before wipe | Same pattern as delete topic / remove source |

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | Click **Wipe rankings** on the feed |
| Surfaces | web + API (`packages/db` helper under api task) |
| Copy | Button: `Wipe rankings` / busy: `Wiping…`. Confirm: `Clear ranked feed items? Saved and Dismissed stay. Rank latest when you want a fresh feed.` |
| Acceptance | After wipe, feed `new`/`seen` items gone; Saved/Dismissed remain; no automatic rank job from dirty catch-up; Rank latest still works |

## API / DB contract

| Field / Endpoint | Type | Notes |
|------------------|------|-------|
| `wipeUserRankings(db, userId)` | db helper | Deletes `new`/`seen` scores; orphan evaluations; `clearUserDirty` |
| `POST /api/feed/wipe-rankings` | session auth | `{ scoresDeleted, evaluationsDeleted }` |

## Touchpoints

- `packages/db` — `wipeUserRankings` (+ test)
- `apps/web` — route + feed button + api-client
- README / architecture brief note if needed

## Out of scope

- Wiping saved/dismissed
- Auto re-rank / enqueue after wipe
- Cancelling in-flight rank jobs
- Mobile

---

## Implementation result

### Changes

- `wipeUserRankings` in `packages/db` — drop `new`/`seen` scores, orphan evaluations, clear dirty
- `POST /api/feed/wipe-rankings` + `api-client.wipeFeedRankings()`
- Feed toolbar **Wipe rankings** with confirm

### Verification

- [x] `pnpm --filter @newsroom/db exec tsx --test --test-force-exit src/wipe-rankings.test.ts`
- [x] typecheck db / api-client / web
- [ ] Manual: Wipe rankings on feed → empty new feed; Saved intact; Rank latest rebuilds

### Deviations from spec

- None

### Follow-ups

- None
