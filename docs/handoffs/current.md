# Handoff: AI caps, active-user priority, keyword-only fallback

**Status:** spec  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `rank-ai-budgets` |
| Parent issue | #125 — https://github.com/SpektrNO/newsroom/issues/125 |
| Open tasks | `spec` (#126), `db` (#127), `api` (#128), `worker` (#129), `verify` (#130), `docs` (#131) |
| Backlog | `docs/feature-backlog.md` § B2 — Notes for `rank-ai-budgets` |

Task order: `spec` → `db` → `api` → `worker` → `verify` → `docs`

## Intent

Cap how many articles get AI-scored per user (per run and per day), so ranking stays keyword-only beyond the budget instead of burning Ollama on huge shortlists.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | Worker `runRank` AI pass; optional Settings/ai-usage reveal |
| Surfaces | worker; Settings (article budget line); Rank latest uses same path |
| Copy | Settings: optional “Rank AI articles today” |
| Acceptance | See criteria |

### Acceptance criteria

1. Env caps: `RANK_AI_MAX_PER_RUN`, `RANK_AI_MAX_PER_DAY`, optional `RANK_AI_MAX_GLOBAL_PER_DAY` (`0` = unlimited).
2. Persist per-user daily AI article count (`rank_ai_daily`).
3. AI pass only scores `min(remainingDay, perRun, shortlist)` articles; remainder stay keyword-only (`combineFinalRank` null AI).
4. Respect existing dirty∩active enqueue + token hard cap (token check still wins).
5. Over article budget → skip further AI batches for that user (log); still clear dirty after keyword pass.
6. Reveal remaining/used on `GET /api/ai-usage` + Settings.
7. Out of scope: dollar pricing, changing activity window, `rank-score-retention`.

## API / DB contract

| Field / Endpoint | Notes |
|------------------|-------|
| `rank_ai_daily` | PK `(user_id, day)`; `articles_scored` int |
| Helpers | `resolveRankAiLimits`, `getRankAiArticlesForDay`, `recordRankAiArticles`, `remainingRankAiBudget` |
| `GET /api/ai-usage` | Add `rankAi: { used, dayLimit, runLimit, remaining, globalUsed?, globalLimit? }` |
| Worker | Slice shortlist before AI loop; record after successful AI apply |

## Touchpoints

- `packages/db` — schema + helpers
- `apps/worker/src/rank.ts` — budget gate
- `apps/web` — ai-usage + Settings
- `packages/api-client` — types
- `.env.example`, docs

## Out of scope

- Closing parent #125 (PR `Closes #125`)
- Token meter redesign (already shipped)

---

## Implementation result

*(Developer agent fills this section.)*
