# Decision: AI-confirmed topic membership for the feed's topic filter

**Date:** 2026-07-28
**Feature:** `ai-confirmed-topic-membership`

## Context

The feed's `topic=` filter decided membership purely from a live keyword re-check (`passesTopicFilter`) run fresh on every request, independent of whatever the AI had scored the article. Keyword match is intentionally loose (whole-word, not phrase-aware — see `002-hybrid-ranking.md`), so a topic auto-seeded with a single common word (e.g. "Space & matter" → keyword `"space"`) would surface any article containing that word as a standalone token, regardless of actual subject (e.g. "no space left for parking", "the ruling gives them space to maneuver"). The AI's overall relevance score was never consulted for this, because `user_article_scores` stored one score/reason per article across *all* the user's topics combined — there was no per-topic signal to check against.

## Decisions

1. **Keyword match stays the shortlist gate** — unchanged. It decides whether an article is even sent to the AI at all. This change does not touch that economics.
2. **New column `user_article_scores.matched_topic_ids`** (`jsonb`, nullable array of `topics.id`) — the current best-known set of topics an article belongs to for a user. Set optimistically to the keyword-matched set (`scoreKeywordMatch(...).matchedTopicIds`) when a row is first scored.
3. **AI narrows, never adds** — when an article reaches the AI batch pass, each article's JSON payload includes `candidateTopics` (its own keyword-matched topic ids, as short refs `t0, t1, …` — same rationale as the existing `r0, r1…` article refs: small local models mangle UUIDs). The model returns `confirmedTopicIds`: the subset of its own candidates it's genuinely about. This replaces `matchedTopicIds` on that row. The AI is never asked to consider topics that didn't already keyword-match — that's a separate, larger feature (semantic-only matching) and out of scope here.
4. **Robustness fallback** — if the model's response omits `confirmedTopicIds` entirely (small local models sometimes drop optional fields), the full keyword-matched candidate set is kept rather than silently unfollowing the article from all its topics. Hallucinated ids outside an article's own candidate set are filtered out. If the model returns an **explicit empty** `confirmedTopicIds`, `aiScore` is forced to `0` (see ADR 002) — confirmation and score must agree.
5. **Feed filter uses the stored set** — `topic=` now checks `matched_topic_ids` for overlap with the selected topic ids (`matchesTopicIds` in `apps/web/src/lib/feed.ts`) instead of re-deriving membership from raw keywords on every request.
6. **Legacy rows fall back to the old live keyword check** — rows scored before this shipped have `matched_topic_ids = NULL`. The feed filter treats `NULL` as `"unknown"` and falls back to `passesTopicFilter` for that row only. No backfill script; rows self-heal on their next natural rank pass (topic edits, dirty passes, or a manual "Wipe rankings" + "Rank latest").

## Alternatives considered

- **Full per-topic AI classification against *all* user topics** (not just keyword-matched candidates) — rejected. The reported problem is false positives (keyword noise), not missed matches; classifying against every topic for every article is a bigger prompt/cost/scope increase for a problem that doesn't need it.
- **Threshold on overall `aiScore`** — rejected as a primary fix. A high overall score from a genuine match on topic A would still let a spurious keyword hit on topic B through, since the score isn't per-topic.

## Consequences

- `packages/ai/src/rank.ts`: `RankTopicInput.id`, `RankArticleInput.candidateTopicIds`, `RankedItem.confirmedTopicIds` are new; prompt and parsing updated accordingly.
- `apps/worker/src/rank.ts`: keyword pass persists `matchedTopicIds`; AI pass overwrites it with the confirmed subset; untouched (keeps keyword-only set) when the AI batch is skipped or fails.
- Feed topic-filter counts (`loadFeedCounts`) and item filtering both read the stored set, with the same legacy-NULL fallback.
- No migration backfill — acceptable at personal-scale usage; existing "Wipe rankings" button already gives an explicit way to force immediate repopulation.
