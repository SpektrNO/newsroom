# Decision: user-selectable rank model tier

**Date:** 2026-07-29
**Feature:** `user-selectable-rank-model`

## Context

Ranking's AI pass always used a single, process-global `OllamaProvider` (constructed once per `runRank` call from the `OLLAMA_MODEL` env var), applied identically to every user in that run. There was no way for a user to trade off speed/cost against quality (e.g. skip AI entirely for a fully keyword-driven feed, or opt into a stronger, slower model for better topic judgment), short of an operator changing the env var for everyone.

## Decisions

1. **Three tiers, persisted per user** — `user.rank_model_tier`: `none` | `fast` | `standard`. Default `fast`, matching today's out-of-the-box behavior. This is an account setting (Settings page), not a per-request override — a user's choice should stick across "Rank latest" runs and background passes alike, and a per-run toggle wasn't asked for.
2. **`none` fully bypasses AI, not just defers it** — no `OllamaProvider` is constructed, no health check is attempted, and no AI token/article budget is consumed. This differs from the existing budget-exhaustion path (`RANK_AI_MAX_PER_RUN`/day), which also leaves articles keyword-only but is an involuntary cap; `none` is an explicit, always-on user choice. Both paths report through the same `aiSkipped` counter for consistent usage reporting.
3. **`fast` and `standard` map to independently configurable models** — `RANK_MODEL_FAST` (default: `OLLAMA_MODEL`, i.e. `llama3.2` — preserves today's default so existing installs are unaffected) and `RANK_MODEL_STANDARD` (default `llama3.1:8b`, pulled per `docs/ops-local.md#model-options`). Both tiers still consume the existing `RANK_AI_MAX_PER_RUN`/`RANK_AI_MAX_PER_DAY`/token budgets identically — only the model name differs, not the accounting.
4. **Tier resolution moved inside `runRank`'s per-user loop** — previously the single provider was built once, before iterating users. Now each user's tier is looked up from the DB inside the loop and a fresh `OllamaProvider` (or none) is built per user. This one change is what makes the tier apply uniformly across all three call sites that reach `runRank` (the interactive `POST /api/feed/rank` route, the per-user queue job, and the background poller's inline fallback) without touching each of them individually.
5. **`options.provider` (test injection) still gates on tier** — a test-injected provider is only ever invoked when the resolved tier isn't `none`; tier is always looked up regardless of whether a provider override is passed. Existing AI-path tests are unaffected because the DB column defaults to `fast`.
6. **Changing the tier marks preferences dirty** — same as editing a topic (`markUserPreferenceDirty`), so the next rank pass (interactive or background) picks up the new tier. It does not force an immediate synchronous re-rank.

## Alternatives considered

- **Per-request override (e.g. a query param on `POST /api/feed/rank`)** — rejected; the user asked for a persisted setting, and a per-run toggle would need its own UI affordance on the Feed page in addition to Settings.
- **Single "cheap" vs "expensive" env var swap operators control** — rejected; doesn't let individual users opt out of AI or choose quality/speed for themselves, which was the actual ask.
- **Passing a pre-built provider into `runRank` from the interactive route (as before)** — rejected in favor of resolving tier/model inside `runRank` uniformly for every call site; the route now only pre-builds a provider transiently for its own health-check pre-flight (a deliberate, cheap double-construction — see `apps/web/src/app/api/feed/rank/route.ts`).

## Consequences

- `packages/db/src/schema/auth.ts`: new `user.rank_model_tier` column (`text`, default `'fast'`, not null); `packages/db/src/rank-model-tier.ts` adds `getUserRankModelTier`/`setUserRankModelTier`.
- `packages/ai/src/ollama.ts`: new `resolveModelForTier(tier)` helper.
- `apps/worker/src/rank.ts`: per-user tier lookup gates the entire AI-pass block; `none` tier increments `aiSkipped` for the full shortlist and logs `rank_model_tier_none` instead of calling Ollama.
- `apps/web/src/app/api/feed/rank/route.ts`: pre-flight health check only runs when tier isn't `none`; `runRank` is called without an explicit provider so it resolves the tier itself.
- New `GET/PATCH /api/settings/rank-model` route + Settings UI select (Standard / Fast / None).
- No change to the AI token/day budget system itself — `fast`/`standard` both still consume it identically.
