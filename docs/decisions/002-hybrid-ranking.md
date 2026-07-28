# Decision: hybrid keyword + AI ranking formulas

**Date:** 2026-07-24  
**Feature:** `hybrid-rank-feed`

## Context

Feed ranking needs a deterministic keyword shortlist (no Ollama) plus a batch AI pass that must not crash on bad model output.

## Decisions

1. **Keyword match** — Case-insensitive **whole-word/phrase** match (word-boundary, not raw substring) on `title` + `summary` (title only if summary is null). No row written on clear miss. Word-boundary matching avoids false positives like `"space"` firing inside `"workspace"` — fixed 2026-07-28 after a mis-ranked article surfaced the bug. **Inherited (ancestor) keywords never hit a topic on their own** — e.g. an article merely mentioning "culture" must not match the "Design & media" leaf just because "Culture & Society" is its catalog ancestor; a topic's own keyword must match first, then inherited keywords only add the weaker score boost (see decision 2 below) — fixed 2026-07-28 for the same reason.

2. **Keyword score** — `min(1, Σ over keyword hits of topic.weight × 0.25)` across enabled topics. Documented in `packages/ai` `scoreKeywordMatch`.

3. **Final rank** — `0.35 * keyword_score + 0.65 * (ai_score ?? keyword_score)`. Implemented as `combineFinalRank`.

4. **AI batching** — Default batch size **30**, env `RANK_BATCH_SIZE` clamped to **20–50**. Helper `rankArticleBatch` uses `AiProvider.complete` only (no DB/Next imports). Malformed items skipped; invalid near-dup ids ignored. Ollama generate timeout defaults to **5 minutes** (`OLLAMA_TIMEOUT_MS`); health probes stay short (~10s).

5. **Jobs** — Successful ingest marks affected users dirty, then enqueues **one pending `rank` job per dirty∩active user** (`payload.userId`; unique among open jobs). Worker claims earliest due `ingest` or `rank` (`SKIP LOCKED`). Feed catch-up enqueues for the session user only. One-shot: `pnpm worker:rank` drains per-user jobs / `NEWSROOM_WORKER_ONCE=rank`.

6. **Topic membership** — keyword match decides which topics an article *candidates* for (shortlist gate, unchanged); the AI then confirms which of those candidates it's genuinely about. The feed's `topic=` filter reads that AI-narrowed set rather than re-deriving membership from raw keywords. See `004-ai-confirmed-topic-membership.md`.

## Consequences

- CI uses mocked `AiProvider`; live Ollama remains optional (`pnpm ai:smoke`).
- Re-score upserts `(user_id, article_id)` without resetting `status`.
- Feed can be empty until the first rank pass completes.
