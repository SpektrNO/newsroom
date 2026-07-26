# Handoff: TTL / prune `user_article_scores`; keep saved

**Status:** spec  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `rank-score-retention` |
| Parent issue | #133 — https://github.com/SpektrNO/newsroom/issues/133 |
| Open tasks | `spec` (#134), `db` (#135), `api` (#136), `worker` (#137), `verify` (#138), `docs` (#139) |
| Backlog | `docs/feature-backlog.md` § B2 — Notes for `rank-score-retention` |

Task order: `spec` → `db` → `api` → `worker` → `verify` → `docs`

## Intent

Prune growing `user_article_scores` so feeds stay lean: drop stale `new`/`seen`/`dismissed` rows while always keeping `saved`.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | After successful per-user rank; optional CLI prune |
| Surfaces | worker (+ Rank latest path); no new UI |
| Copy | None |
| Acceptance | See criteria |

### Acceptance criteria

1. **Keep** all `saved` rows always.
2. Delete `dismissed` older than TTL (`RANK_SCORE_TTL_DAYS`, default **30**).
3. For `new`/`seen`: delete rows older than TTL **or** outside top-N by `final_rank` (desc) per user (`RANK_SCORE_KEEP_TOP_N`, default **500**). A row is kept only if it is within TTL **and** within top-N (saved exempt).
4. `pruneUserArticleScores(db, userId?)` in `packages/db`; when `userId` omitted, prune all users with scores.
5. Worker calls prune after successful `processRankJob` / inline `runRank` for that user; CLI `pnpm worker:prune-scores` (and `NEWSROOM_WORKER_ONCE=prune-scores`).
6. `POST /api/feed/rank` prunes the session user after a successful rank.
7. Feed API behavior unchanged for remaining rows. Out of scope: archive tables, UI for retention settings.

## API / DB contract

| Item | Notes |
|------|-------|
| No migration | Deletes only |
| Env | `RANK_SCORE_TTL_DAYS` (30), `RANK_SCORE_KEEP_TOP_N` (500); `0` TTL or top-N = skip that dimension |
| Helpers | `resolveRankScoreRetention`, `pruneUserArticleScores` |

## Touchpoints

- `packages/db` — prune helpers + tests
- `apps/worker` — post-rank prune + CLI
- `apps/web` — `POST /api/feed/rank` prune after success
- README / architecture / `.env.example`

## Out of scope

- Closing parent #133 (PR `Closes #133`)
- Changing feed pagination filters

---

## Implementation result

*(Developer agent fills this section.)*
