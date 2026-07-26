/**
 * Keyword shortlist scoring for hybrid ranking.
 *
 * Match: case-insensitive substring on `title` + `summary` (title only if summary null).
 * Score: min(1, sum of primary hits × weight × 0.25 + inherited hits × weight × 0.1).
 */

import { inheritedKeywordsForTopicName } from "./topic-keywords.js";

/** Primary keyword hits use weight × 0.25; inherited (ancestor) hits use this. */
export const INHERITED_KEYWORD_WEIGHT_FACTOR = 0.1;

export type KeywordTopic = {
  id?: string;
  name?: string;
  keywords: string[];
  weight: number;
  /**
   * Ancestor catalog tokens (e.g. Technology, AI, Machine, Learning).
   * Scored weaker than `keywords` so hierarchy broadens recall without
   * overpowering leaf-specific terms.
   */
  inheritedKeywords?: string[];
};

export type KeywordMatchResult = {
  /** Whether any enabled-topic keyword hit. */
  hit: boolean;
  /** Score in [0, 1]. */
  keywordScore: number;
  /** Topic ids that contributed at least one hit (when ids provided). */
  matchedTopicIds: string[];
  /** Max weight among topics that matched (for optional boosts). */
  maxMatchedWeight: number;
  /** Short human-readable summary of matched keywords. */
  reason: string | null;
};

function haystack(title: string, summary: string | null | undefined): string {
  const parts = [title];
  if (summary) parts.push(summary);
  return parts.join("\n").toLowerCase();
}

/**
 * Score one article against enabled topics.
 * Disabled topics should be filtered out by the caller.
 */
export function scoreKeywordMatch(
  title: string,
  summary: string | null | undefined,
  topics: KeywordTopic[],
): KeywordMatchResult {
  const text = haystack(title, summary);
  let sum = 0;
  const matchedTopicIds: string[] = [];
  const matchedKeywords: string[] = [];
  let maxMatchedWeight = 0;

  for (const topic of topics) {
    const weight = Number.isFinite(topic.weight) ? topic.weight : 1;
    let topicHit = false;
    const primaryKeys = new Set(
      topic.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
    );
    for (const raw of topic.keywords) {
      const kw = raw.trim().toLowerCase();
      if (!kw) continue;
      if (text.includes(kw)) {
        sum += weight * 0.25;
        topicHit = true;
        if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
      }
    }
    for (const raw of topic.inheritedKeywords ?? []) {
      const kw = raw.trim().toLowerCase();
      if (!kw || primaryKeys.has(kw)) continue;
      if (text.includes(kw)) {
        sum += weight * INHERITED_KEYWORD_WEIGHT_FACTOR;
        topicHit = true;
        if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
      }
    }
    if (topicHit) {
      maxMatchedWeight = Math.max(maxMatchedWeight, weight);
      if (topic.id) matchedTopicIds.push(topic.id);
    }
  }

  const keywordScore = Math.min(1, sum);
  const hit = keywordScore > 0;
  return {
    hit,
    keywordScore,
    matchedTopicIds,
    maxMatchedWeight,
    reason: hit
      ? `Matched keywords: ${matchedKeywords.slice(0, 8).join(", ")}`
      : null,
  };
}

/** True if article text overlaps any of the topic's keywords (or inherited). */
export function articleMatchesTopicKeywords(
  title: string,
  summary: string | null | undefined,
  keywords: string[],
  inheritedKeywords?: string[],
): boolean {
  return scoreKeywordMatch(title, summary, [
    { keywords, inheritedKeywords, weight: 1 },
  ]).hit;
}

/** Attach catalog ancestor keywords for ranking / feed filters. */
export function withInheritedCatalogKeywords(
  topic: KeywordTopic,
): KeywordTopic {
  if (!topic.name?.trim()) return topic;
  const inherited = inheritedKeywordsForTopicName(topic.name);
  if (inherited.length === 0) return topic;
  const existing = topic.inheritedKeywords ?? [];
  const seen = new Set(existing.map((k) => k.toLowerCase()));
  const merged = [...existing];
  for (const k of inherited) {
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(k);
  }
  return { ...topic, inheritedKeywords: merged };
}

/**
 * Combine keyword + AI into final_rank.
 * Formula: 0.35 * keyword_score + 0.65 * (ai_score ?? keyword_score)
 */
export function combineFinalRank(
  keywordScore: number,
  aiScore: number | null | undefined,
): number {
  const ai = aiScore ?? keywordScore;
  return 0.35 * keywordScore + 0.65 * ai;
}
