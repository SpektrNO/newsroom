# Decision: hybrid keyword + AI ranking formulas

**Date:** 2026-07-24  
**Feature:** `hybrid-rank-feed`

## Context

Feed ranking needs a deterministic keyword shortlist (no Ollama) plus a batch AI pass that must not crash on bad model output.

## Decisions

1. **Keyword match** — Case-insensitive substring on `title` + `summary` (title only if summary is null). No row written on clear miss.

2. **Keyword score** — `min(1, Σ over keyword hits of topic.weight × 0.25)` across enabled topics. Documented in `packages/ai` `scoreKeywordMatch`.

3. **Final rank** — `0.35 * keyword_score + 0.65 * (ai_score ?? keyword_score)`. Implemented as `combineFinalRank`.

4. **AI batching** — Default batch size **30**, env `RANK_BATCH_SIZE` clamped to **20–50**. Helper `rankArticleBatch` uses `AiProvider.complete` only (no DB/Next imports). Malformed items skipped; invalid near-dup ids ignored. Ollama generate timeout defaults to **5 minutes** (`OLLAMA_TIMEOUT_MS`); health probes stay short (~10s).

5. **Jobs** — Successful ingest marks affected users dirty, then enqueues **one pending `rank` job per dirty∩active user** (`payload.userId`; unique among open jobs). Worker claims earliest due `ingest` or `rank` (`SKIP LOCKED`). Feed catch-up enqueues for the session user only. One-shot: `pnpm worker:rank` drains per-user jobs / `NEWSROOM_WORKER_ONCE=rank`.

## Consequences

- CI uses mocked `AiProvider`; live Ollama remains optional (`pnpm ai:smoke`).
- Re-score upserts `(user_id, article_id)` without resetting `status`.
- Feed can be empty until the first rank pass completes.
