# Decision: hybrid keyword + AI ranking formulas

**Date:** 2026-07-24  
**Feature:** `hybrid-rank-feed`

## Context

Feed ranking needs a deterministic keyword shortlist (no Ollama) plus a batch AI pass that must not crash on bad model output.

## Decisions

1. **Keyword match** — Case-insensitive **whole-word/phrase** match (word-boundary, not raw substring) on `title` + `summary` (title only if summary is null). No row written on clear miss. Word-boundary matching avoids false positives like `"space"` firing inside `"workspace"` — fixed 2026-07-28 after a mis-ranked article surfaced the bug. **Light English plural folding** on single ASCII letter tokens ≥4 chars (`regulation` ↔ `regulations`, `policy` ↔ `policies`); short tokens (`ai`, `css`), phrases, and hyphenated forms stay exact. Keywords are **sanitized** before matching (length 2–64; letters/digits with optional interior space/hyphen/apostrophe only) so junk user input cannot compile into hostile patterns — rejected tokens are skipped. **Inherited (ancestor) keywords never hit a topic on their own** — e.g. an article merely mentioning "culture" must not match the "Design & media" leaf just because "Culture & Society" is its catalog ancestor; a topic's own keyword must match first, then inherited keywords only add the weaker score boost (see decision 2 below) — fixed 2026-07-28 for the same reason.

2. **Keyword score** — `min(1, Σ over keyword hits of topic.weight × 0.25)` across enabled topics. Documented in `packages/ai` `scoreKeywordMatch`.

3. **Final rank** — `0.35 * keyword_score + 0.65 * (ai_score ?? keyword_score)`. Implemented as `combineFinalRank`. **`aiScore` is topic relevance, not general newsworthiness** — when the model returns an explicit empty `confirmedTopicIds` (rejected every keyword candidate), `parseRankedItem` forces `aiScore = 0` so false keyword hits cannot float to the top of the unfiltered feed with a 0.99 “interesting article” score. Omitting the field still falls back to keeping candidates + the model’s score (ADR 004). Fixed 2026-08-04.

4. **AI batching** — Default batch size **30**, env `RANK_BATCH_SIZE` clamped to **20–50**. Helper `rankArticleBatch` uses `AiProvider.complete` only (no DB/Next imports). Malformed items skipped; invalid near-dup ids ignored. Ollama generate timeout defaults to **5 minutes** (`OLLAMA_TIMEOUT_MS`); health probes stay short (~10s).

5. **Jobs** — Successful ingest marks affected users dirty, then enqueues **one pending `rank` job per dirty∩active user** (`payload.userId`; unique among open jobs). Worker claims earliest due `ingest` or `rank` (`SKIP LOCKED`). Feed catch-up enqueues for the session user only. One-shot: `pnpm worker:rank` drains per-user jobs / `NEWSROOM_WORKER_ONCE=rank`.

6. **Topic membership** — keyword match decides which topics an article *candidates* for (shortlist gate, unchanged); the AI then confirms which of those candidates it's genuinely about. The feed's `topic=` filter reads that AI-narrowed set rather than re-deriving membership from raw keywords. See `004-ai-confirmed-topic-membership.md`.

7. **Reason quality** — the small local model sometimes returns a `reason` that just restates the prompt's own instructions instead of describing the article (e.g. "Candidate topics fully match confirmed topic ids…", "superficial word overlap, not a genuine match" copied verbatim). `parseRankedItem` (`packages/ai/src/rank.ts`) detects these boilerplate phrases and falls back to the keyword-match reason (`"Matched keywords: …"`, already computed by `scoreKeywordMatch`) instead of showing the model's meta text; the generic `"Relevant to your topics."` string is now a last-resort default only when no keyword reason exists either. Fixed 2026-07-28 — the underlying classification (`confirmedTopicIds`) is unaffected; this only improves the displayed explanation.

8. **Topic confirmation was silently a no-op** — `ollamaJsonFormat("rank-array")` (`packages/ai/src/ollama.ts`) builds the JSON Schema Ollama uses for grammar-constrained decoding, and it never declared `confirmedTopicIds` as a property. The model reliably echoed every keyword-matched candidate straight into `confirmedTopicIds` regardless of prompt wording — e.g. an HN post about code-review comments ("...Why Your Comments Matter") kept "Space & matter" confirmed purely because the word "matter" is one of that topic's own keywords. No amount of prompt-only instruction fixed it (verified live against `llama3.1:8b`) because the field sat outside the schema the decoder actually enforces. Fix: add `confirmedTopicIds: {type: array, items: string}` to the schema as a **required** property, plus a stronger prompt section that (a) calls out common English keywords that are usually idiomatic/unrelated ("matter", "world", "space", "open", "source"), (b) asks the model to self-check that `confirmedTopicIds` agrees with the `reason` it just wrote, and (c) gives one worked false-positive example matching this exact bug report. Verified live (3 repeated runs): the reported false positive is now rejected every time; genuine matches (e.g. an actual open-source LLM article, a genuine "new state of matter" physics article) are still confirmed most but not all runs — recall dipped slightly in exchange for the precision fix, an acceptable tradeoff for a ~8B local model doing subjective judgment. Fixed 2026-07-29; regression test in `packages/ai/src/ollama.test.ts`.

## Consequences

- CI uses mocked `AiProvider`; live Ollama remains optional (`pnpm ai:smoke`).
- Re-score upserts `(user_id, article_id)` without resetting `status`.
- Feed can be empty until the first rank pass completes.
