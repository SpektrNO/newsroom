# Handoff: TTL / prune `user_article_scores`; keep saved

**Status:** done  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** complete (lean)

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `rank-score-retention` |
| Parent issue | #133 — https://github.com/SpektrNO/newsroom/issues/133 |
| Open tasks | *(none)* |
| Closed tasks | `spec` (#134), `db` (#135), `api` (#136), `worker` (#137), `verify` (#138), `docs` (#139) |
| Backlog | `docs/feature-backlog.md` § B2 — Notes for `rank-score-retention` |

## Intent

Prune growing `user_article_scores` so feeds stay lean: drop stale `new`/`seen`/`dismissed` rows while always keeping `saved`.

## Implementation result

### Delivered

- `pruneUserArticleScores` / `resolveRankScoreRetention` (`RANK_SCORE_TTL_DAYS=30`, `RANK_SCORE_KEEP_TOP_N=500`)
- Keep `saved`; TTL on `dismissed`; `new`/`seen` deleted if past TTL **or** outside top-N
- Post-rank prune in `runRank`; CLI `pnpm worker:prune-scores`
- Rank latest inherits prune via `runRank`

### Verification

- `pnpm --filter @newsroom/db` typecheck/build + `score-retention.test.ts`
- `pnpm --filter @newsroom/worker` typecheck + test
- `pnpm --filter @newsroom/web` typecheck

### Deviations

- No schema migration (deletes only).
- Global prune CLI does not report per-user counts (`users: 0` when no `userId`).

### Follow-ups

- B2 ranking scale complete; next product paths: `source-podcast`, `mobile-feed-topics`, `multiuser-harden`
