# ADR 007: Per-user AI credentials (BYOK)

## Context

Operator-hosted OpenAI/Google via `AI_PROVIDER` ships in `ai-cloud-providers`. Multi-user deploys may want each account to bring its own cloud API key without changing prompt contracts or metering.

## Decision

1. **Table** `user_ai_credentials` (1:1 with `user`): provider (`openai`|`google`), AES-256-GCM ciphertext, last-4 hint.
2. **Key** `AI_CREDENTIALS_KEY` — 64 hex characters (32 bytes). If unset, BYOK APIs return `503 byok_not_configured`; Settings explains operator-only AI.
3. **Resolution** — For rank/chat, load and decrypt the user’s row when present; otherwise `createAiProvider()` from env. Model tiers still use `resolveModelForTier(tier, byokProvider?)`.
4. **API** — `GET/PUT/DELETE /api/settings/ai-credentials`; never return plaintext after save.
5. **Boundary** — Browser never calls vendors; worker/BFF only. `/api/health` remains deploy-level.

## Alternatives considered

- Columns on Better Auth `user` — rejected; keep auth schema clean.
- Derive encryption from `BETTER_AUTH_SECRET` — deferred; explicit key makes rotation and “BYOK off” clearer.
- Ollama BYOK — out of scope (no user API key).

## Consequences

Operators must set the same `AI_CREDENTIALS_KEY` in root `.env` and `apps/web/.env.local`. Rotating the key invalidates stored ciphertexts (users re-enter keys). Token metering and article caps still apply.
