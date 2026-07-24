/**
 * Keyword shortlist scoring for hybrid ranking.
 *
 * Match: case-insensitive substring on `title` + `summary` (title only if summary null).
 * Score: min(1, sum over keyword hits of topic.weight * 0.25).
 */

export type KeywordTopic = {
  id?: string;
  name?: string;
  keywords: string[];
  weight: number;
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
    for (const raw of topic.keywords) {
      const kw = raw.trim().toLowerCase();
      if (!kw) continue;
      if (text.includes(kw)) {
        sum += weight * 0.25;
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

/** True if article text overlaps any of the topic's keywords. */
export function articleMatchesTopicKeywords(
  title: string,
  summary: string | null | undefined,
  keywords: string[],
): boolean {
  return scoreKeywordMatch(title, summary, [{ keywords, weight: 1 }]).hit;
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
