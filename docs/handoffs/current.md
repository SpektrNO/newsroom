# Handoff: Wipe current rankings

**Status:** implementing  
**Created:** 2026-07-27  
**Specifier agent:** lean (in-supervisor)  
**Developer agent:** in progress (lean)

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `wipe-rankings` |
| Parent issue | #143 — https://github.com/SpektrNO/newsroom/issues/143 |
| Open tasks | `api`, `web`, `verify`, `docs` |
| Closed / Phase-1 | `spec` (#144) |
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

*(Developer agent fills this section.)*

### Changes

- 

### Verification

- [ ] How tested
- [ ] What remains manual

### Deviations from spec

- None / list with rationale

### Follow-ups

- 
