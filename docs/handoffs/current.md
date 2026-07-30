# Handoff: ai-cloud-providers

**Status:** spec  
**Created:** 2026-07-30  
**Specifier agent:** lean thin handoff  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `ai-cloud-providers` |
| Parent issue | #175 — https://github.com/SpektrNO/newsroom/issues/175 |
| Open tasks | `spec` (#176), `db` (#177), `api` (#178), `worker` (#179), `verify` (#180), `docs` (#181) |
| Closed | — |
| Backlog | `docs/feature-backlog.md` § B4 — `ai-cloud-providers` |

Task order: `spec` → `db` (N/A) → `api` → `worker` → `verify` → `docs`

## Intent

Operators can set `AI_PROVIDER=ollama|openai|google` and use OpenAI or Google Gemini for rank + Advisor without changing prompt contracts; default remains Ollama.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Scope v1 | Operator-hosted only (env). BYOK deferred |
| Interface | Keep `complete` / `health`; propagate real token usage |
| Factory | `createAiProvider({ model? })` in `packages/ai` |
| Models | Reuse `RANK_MODEL_FAST` / `RANK_MODEL_STANDARD`; provider-aware defaults |
| JSON | Map `json` modes per vendor; unwrap wrapped rank arrays if needed |
| Health | `checks.ai` = configured provider; keep `checks.ollama` as alias (= `ai`) for clients |
| DB | No migration (BYOK later) |

## Acceptance

1. `AI_PROVIDER=openai` / `google` constructs working providers; unset → Ollama.
2. Worker rank + web chat/Rank latest use factory (no hardcoded Ollama-only path).
3. Unit tests mock HTTP: JSON complete, usage mapping, health ok/fail for both cloud providers.
4. Env + ops docs updated; backlog ✅.

## Out of scope

BYOK, Anthropic, streaming, Vertex enterprise auth, dollar billing UI, browser→vendor calls.

---

## Implementation result

*(Developer fills.)*
