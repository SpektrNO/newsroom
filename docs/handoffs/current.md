# Handoff: Count, reveal, and cap AI tokens (rank + chat)

**Status:** done  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** complete (lean)

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `ai-token-metering` |
| Parent issue | #117 — https://github.com/SpektrNO/newsroom/issues/117 |
| Open tasks | *(none)* |
| Closed tasks | `spec` (#118), `db` (#119), `api` (#120), `worker` (#121), `verify` (#122), `docs` (#123) |
| Backlog | `docs/feature-backlog.md` § B3 — Notes for `ai-token-metering` |

Task order: `spec` → `db` → `api` → `worker` → `verify` → `docs`

## Intent

Meter AI tokens for rank + chat, show today’s usage in Settings, and enforce a shared daily hard cap (chat 429; rank degrades to keyword-only).

## Implementation result

### Delivered

- `AiCompleteResult.usage` + Ollama counts / chars/4 estimate; rank/advisor preserve usage
- `ai_token_daily` migration + record/get/budget helpers
- `GET /api/ai-usage`; chat budget + record; Settings “AI tokens today”
- Worker records rank usage; skips AI batches when hard exceeded

### Verification

- `pnpm --filter @newsroom/db typecheck` + `ai-usage.test.ts`
- `pnpm --filter @newsroom/ai typecheck` + test
- `pnpm --filter @newsroom/db build` && `pnpm --filter @newsroom/ai build`
- `pnpm --filter @newsroom/worker typecheck` + test
- `pnpm --filter @newsroom/web typecheck`

### Deviations

- No separate web task slug; Settings reveal shipped under `api`.
- Chat response includes optional `tokens` + `aiUsage` summary (not only Settings).

### Follow-ups

- `rank-ai-budgets` (article/batch caps on top of token meter)
- Advisor composer footer for soft-warn (optional)
