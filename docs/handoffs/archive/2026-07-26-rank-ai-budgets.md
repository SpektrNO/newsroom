# Handoff: AI caps, active-user priority, keyword-only fallback

**Status:** done  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** complete (lean)

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `rank-ai-budgets` |
| Parent issue | #125 — https://github.com/SpektrNO/newsroom/issues/125 |
| Open tasks | *(none)* |
| Closed tasks | `spec` (#126), `db` (#127), `api` (#128), `worker` (#129), `verify` (#130), `docs` (#131) |
| Backlog | `docs/feature-backlog.md` § B2 — Notes for `rank-ai-budgets` |

## Intent

Cap how many articles get AI-scored per user (per run and per day), so ranking stays keyword-only beyond the budget instead of burning Ollama on huge shortlists.

## Implementation result

### Delivered

- `rank_ai_daily` + `remainingRankAiBudget` / `recordRankAiArticles`
- Env: `RANK_AI_MAX_PER_RUN` (60), `RANK_AI_MAX_PER_DAY` (200), `RANK_AI_MAX_GLOBAL_PER_DAY` (0=unlimited)
- Worker slices shortlist before AI; records scored count; token hard cap still applies
- `GET /api/ai-usage.rankAi` + Settings line

### Verification

- `pnpm --filter @newsroom/db` typecheck/build + `rank-ai.test.ts`
- `pnpm --filter @newsroom/worker` typecheck + test
- `pnpm --filter @newsroom/web` typecheck
- `pnpm --filter @newsroom/api-client` typecheck

### Deviations

- Active-user priority already enforced by dirty∩active enqueue from prior features.

### Follow-ups

- `rank-score-retention`
