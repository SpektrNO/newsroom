# Handoff: Count, reveal, and cap AI tokens (rank + chat)

**Status:** spec  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `ai-token-metering` |
| Parent issue | #117 — https://github.com/SpektrNO/newsroom/issues/117 |
| Open tasks | `spec` (#118), `db` (#119), `api` (#120), `worker` (#121), `verify` (#122), `docs` (#123) |
| Backlog | `docs/feature-backlog.md` § B3 — Notes for `ai-token-metering` |

Task order: `spec` → `db` → `api` → `worker` → `verify` → `docs`  
(No web/mobile slugs — Settings reveal ships under `api`.)

## Intent

Meter AI tokens for rank + chat, show today’s usage in Settings, and enforce a shared daily hard cap (chat 429; rank degrades to keyword-only).

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | Every `AiProvider.complete`; Settings load; chat before generate |
| Surfaces | Settings, Advisor chat meta, worker rank |
| Copy | Settings: “AI tokens today”; soft warn when over soft limit |
| Acceptance | See criteria |

### Acceptance criteria

1. `AiCompleteResult.usage` with `promptTokens` / `completionTokens` / `totalTokens` (+ `estimated` when guessed).
2. Ollama maps `prompt_eval_count` / `eval_count`; else chars/4 estimator.
3. Daily per-user rollup table by purpose (`rank` \| `chat` \| `other`); record after successful completes.
4. `GET /api/ai-usage` (session) returns used/limit/soft + byPurpose for **today UTC**.
5. Settings shows used vs hard limit (+ soft warn); optional chat response `tokens`.
6. Env `AI_TOKEN_DAILY_LIMIT` (hard) and `AI_TOKEN_DAILY_SOFT_LIMIT` (default 80% of hard). Shared pool across purposes.
7. Chat over hard → `429` `{ "error": "token_budget_exceeded" }`; rank over hard → skip AI batches (keyword-only), still clear dirty.
8. Out of scope: dollar UI, streaming ticks, per-model prices, admin consoles.

## API / DB contract

| Field / Endpoint | Notes |
|------------------|-------|
| `ai_token_daily` | PK `(user_id, day, purpose)`; counters prompt/completion/total |
| `GET /api/ai-usage` | Session; today’s rollup + limits |
| `POST /api/chat` | Budget check → record `chat`; may return `tokens` |
| Worker rank | Record `rank` per batch; skip AI when hard exceeded |
| Env | `AI_TOKEN_DAILY_LIMIT` (default `200000`), `AI_TOKEN_DAILY_SOFT_LIMIT` |

## Touchpoints

- `packages/ai` — types, Ollama, estimate helper; rank/advisor preserve usage
- `packages/db` — schema + `recordAiTokenUsage` / `getAiTokenUsageForDay` / budget helpers
- `apps/web` — chat route, ai-usage route, Settings UI, api-client
- `apps/worker` — rank AI path metering + degrade

## Out of scope

- `rank-ai-budgets` (article/batch caps)
- Closing parent #117 (PR `Closes #117`)

---

## Implementation result

*(Developer agent fills this section.)*
