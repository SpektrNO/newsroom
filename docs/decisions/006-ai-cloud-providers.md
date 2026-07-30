# ADR 006: Operator-hosted cloud AI providers

## Context

Rank and Advisor already go through `AiProvider`, but only `OllamaProvider` was wired. Hosted deploys need OpenAI- and Google-compatible backends without changing prompt contracts or token metering.

## Decision

1. **Env-selected factory** — `AI_PROVIDER=ollama|openai|google` (default `ollama`) via `createAiProvider()` in `packages/ai`. Worker rank and web BFF (`/api/chat`, Rank latest health probe, `/api/health`) all use the factory — never call vendors from the browser.
2. **Same `complete` / `health` contract** — Map vendor JSON modes; for rank arrays, OpenAI/Google use a wrapped `{ items: [...] }` schema (root must be object) and unwrap before returning text so `rankArticleBatch` stays unchanged.
3. **Token usage** — Propagate OpenAI `usage` and Google `usageMetadata` into `AiTokenUsage`; fall back to chars/4 estimate when omitted.
4. **Model tiers** — Keep `RANK_MODEL_FAST` / `RANK_MODEL_STANDARD` as overrides; provider-aware defaults when unset (`gpt-4o-mini`/`gpt-4o`, `gemini-2.0-flash`, or Ollama tags).
5. **Health** — `checks.ai` reflects the configured provider; `checks.ollama` remains a legacy alias of the same value; response includes `aiProvider`.
6. **BYOK deferred** — Per-user encrypted keys stay a follow-up (`security-harden` alignment).

## Alternatives considered

- Hardcode OpenAI in the worker only — rejected; Advisor and Rank latest would diverge.
- Per-user BYOK in v1 — deferred until operator-hosted path is proven.
- Anthropic in the same PR — out of scope; factory makes it a thin follow-on.

## Consequences

Operators can leave Ollama by setting env vars in root `.env` and `apps/web/.env.local`. Cloud keys make `ai-token-metering` and `rank-ai-budgets` more important. Compatible OpenAI proxies work via `OPENAI_BASE_URL`.
