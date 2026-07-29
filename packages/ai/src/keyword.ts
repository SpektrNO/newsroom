/**
 * Keyword shortlist scoring for hybrid ranking.
 *
 * Match: case-insensitive whole-word/phrase match on `title` + optional
 * `showTitle` + `summary` (word-boundary, not raw substring — "space" won't
 * fire inside "workspace"). Light English plural folding on single ASCII
 * tokens (regulation ↔ regulations); phrases and short tokens stay exact.
 * User keywords are sanitized before matching so junk input cannot blow up
 * regex construction or invent nonsense variants.
 * Score: min(1, sum of primary hits × weight × 0.25 + inherited hits × weight × 0.1).
 * Inherited (ancestor) keywords never hit a topic on their own — e.g. an
 * article mentioning "culture" shouldn't match the "Design & media" leaf
 * just because "Culture & Society" is its ancestor. They only add a weak
 * score boost once a primary (leaf) keyword has already matched.
 */

import { inheritedKeywordsForTopicName } from "./topic-keywords.js";

/** Primary keyword hits use weight × 0.25; inherited (ancestor) hits use this. */
export const INHERITED_KEYWORD_WEIGHT_FACTOR = 0.1;

/** Reject absurdly long user keywords (regex size / noise). */
export const MAX_KEYWORD_LENGTH = 64;

/** Match catalog tokenize floor — single-char tokens are too noisy. */
export const MIN_KEYWORD_LENGTH = 2;

/** Plural fold only for tokens at least this long (keeps "ai", "css", "go" exact). */
export const MIN_PLURAL_FOLD_LENGTH = 4;

/**
 * Mass nouns / invariants where stripping a trailing "s"/"ies" is wrong.
 * Only consulted when singularizing a user keyword.
 */
const DO_NOT_SINGULARIZE = new Set([
  "series",
  "species",
  "news",
  "physics",
  "mathematics",
  "economics",
  "politics",
  "ethics",
  "athletics",
  "means",
  "thanks",
  "clothes",
  "glasses",
  "scissors",
  "diabetes",
  "measles",
]);

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

function haystack(
  title: string,
  summary: string | null | undefined,
  showTitle?: string | null,
): string {
  const parts = [title];
  if (showTitle) parts.push(showTitle);
  if (summary) parts.push(summary);
  return parts.join("\n").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize and validate a user/catalog keyword before matching.
 * Returns null when the token is empty, too long, or contains characters we
 * refuse to compile into a word-boundary pattern (regex metacharacters,
 * punctuation spam, control chars, etc.).
 */
export function sanitizeKeyword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  let s = raw.normalize("NFKC").toLowerCase().trim();
  // Drop controls / zero-widths that trim won't remove.
  s = s.replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, "");
  s = s.replace(/\s+/g, " ");

  if (s.length < MIN_KEYWORD_LENGTH || s.length > MAX_KEYWORD_LENGTH) {
    return null;
  }

  // Letters / digits with optional interior space, hyphen, or apostrophe.
  // Rejects ".", "*", "(", "c++", emoji-only, etc.
  if (!/^[\p{L}\p{N}]+(?:[ '\-][\p{L}\p{N}]+)*$/u.test(s)) {
    return null;
  }

  return s;
}

/**
 * English plural/singular variants for a *sanitized* single ASCII token.
 * Phrases, hyphenated forms, digits, and short tokens return `[keyword]` only.
 */
export function englishPluralVariants(keyword: string): string[] {
  const out = new Set<string>([keyword]);
  if (keyword.length < MIN_PLURAL_FOLD_LENGTH) return [...out];
  // Only fold plain ASCII letter words — not "open source", "gpt-4", "cafés".
  if (!/^[a-z]+$/.test(keyword)) return [...out];

  // keyword → plausible plural forms in article text (skip if already plural-ish)
  if (!keyword.endsWith("s")) {
    if (
      keyword.endsWith("y") &&
      keyword.length > 2 &&
      !/[aeiou]y$/.test(keyword)
    ) {
      out.add(`${keyword.slice(0, -1)}ies`);
    } else if (/(?:s|x|z|ch|sh)$/.test(keyword)) {
      out.add(`${keyword}es`);
    } else {
      out.add(`${keyword}s`);
    }
  }

  // keyword is plural → singular form in article text
  if (!DO_NOT_SINGULARIZE.has(keyword)) {
    if (
      keyword.endsWith("ies") &&
      keyword.length > 4 &&
      /[^aeiou]ies$/.test(keyword)
    ) {
      out.add(`${keyword.slice(0, -3)}y`);
    } else if (/(?:s|x|z|ch|sh)es$/.test(keyword) && keyword.length > 4) {
      out.add(keyword.slice(0, -2));
    } else if (
      keyword.endsWith("s") &&
      !keyword.endsWith("ss") &&
      keyword.length >= 5
    ) {
      out.add(keyword.slice(0, -1));
    }
  }

  return [...out];
}

/**
 * Whole-word/phrase match (word-boundary), not raw substring — prevents
 * short keywords like "space" or "ai" from firing inside unrelated words
 * like "workspace" or "said". Applies light plural folding when safe.
 */
function matchesKeyword(text: string, keyword: string): boolean {
  for (const variant of englishPluralVariants(keyword)) {
    if (new RegExp(`\\b${escapeRegExp(variant)}\\b`).test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Score one article against enabled topics.
 * Disabled topics should be filtered out by the caller.
 */
export function scoreKeywordMatch(
  title: string,
  summary: string | null | undefined,
  topics: KeywordTopic[],
  showTitle?: string | null,
): KeywordMatchResult {
  const text = haystack(title, summary, showTitle);
  let sum = 0;
  const matchedTopicIds: string[] = [];
  const matchedKeywords: string[] = [];
  let maxMatchedWeight = 0;

  for (const topic of topics) {
    const weight = Number.isFinite(topic.weight) ? topic.weight : 1;
    let primaryHit = false;
    const primaryKeys = new Set<string>();
    for (const raw of topic.keywords) {
      const kw = sanitizeKeyword(raw);
      if (kw) primaryKeys.add(kw);
    }
    const topicMatchedKeywords: string[] = [];
    for (const kw of primaryKeys) {
      if (matchesKeyword(text, kw)) {
        sum += weight * 0.25;
        primaryHit = true;
        topicMatchedKeywords.push(kw);
      }
    }
    // Inherited (ancestor) keywords only add a weak boost once the topic's
    // own keywords have matched — they must never trigger a hit alone.
    if (primaryHit) {
      for (const raw of topic.inheritedKeywords ?? []) {
        const kw = sanitizeKeyword(raw);
        if (!kw || primaryKeys.has(kw)) continue;
        if (matchesKeyword(text, kw)) {
          sum += weight * INHERITED_KEYWORD_WEIGHT_FACTOR;
          topicMatchedKeywords.push(kw);
        }
      }
    }
    if (primaryHit) {
      maxMatchedWeight = Math.max(maxMatchedWeight, weight);
      if (topic.id) matchedTopicIds.push(topic.id);
      for (const kw of topicMatchedKeywords) {
        if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
      }
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
  showTitle?: string | null,
): boolean {
  return scoreKeywordMatch(
    title,
    summary,
    [{ keywords, inheritedKeywords, weight: 1 }],
    showTitle,
  ).hit;
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
