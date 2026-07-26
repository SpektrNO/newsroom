/** Browser-safe catalog/follow helpers (no Node / DB / sources imports). */

import {
  pathKeywordsForTopicName,
  tokenizeTopicLabel,
} from "@newsroom/ai/topic-keywords";

/** Body for one-click Follow from a catalog leaf (POST /api/topics). */
export type FollowTopicDefaults = {
  name: string;
  keywords: string[];
  weight: number;
  enabled: boolean;
};

/**
 * Locked chips in the Manage UI: leaf tokens plus ancestor path tokens
 * (Technology → AI & Machine Learning → …). Ancestors are scored weakly at
 * rank time even if not stored on the topic row.
 */
export function starterKeywordsFromLabel(label: string): string[] {
  return pathKeywordsForTopicName(label);
}

/** Leaf-only tokens stored as primary keywords on create. */
export function leafKeywordsFromLabel(label: string): string[] {
  return tokenizeTopicLabel(label);
}

/** Keywords not already covered by path-derived starters (case-insensitive). */
export function extraKeywordsBeyondStarters(
  keywords: readonly string[],
  label: string,
): string[] {
  const locked = new Set(
    starterKeywordsFromLabel(label).map((k) => k.toLowerCase()),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of keywords) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (locked.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Persist leaf starters + user extras. Ancestor path tokens are applied as
 * weak inherited keywords at rank/feed time via the catalog tree.
 */
export function mergeTopicKeywords(
  label: string,
  extras: readonly string[],
): string[] {
  const locked = leafKeywordsFromLabel(label);
  const seen = new Set(locked.map((k) => k.toLowerCase()));
  const out = [...locked];
  for (const raw of extras) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Normative create payload when following a curated catalog leaf:
 * name = label, keywords = leaf tokens, weight = 1, enabled = true.
 * Ancestor keywords are inherited weakly at rank/feed time.
 */
export function followDefaultsForLabel(label: string): FollowTopicDefaults {
  const name = label.trim();
  return {
    name,
    keywords: leafKeywordsFromLabel(name),
    weight: 1,
    enabled: true,
  };
}

/** Case-insensitive match of a catalog leaf label to a user topic name. */
export function isFollowingLabel(
  topics: ReadonlyArray<{ name: string }>,
  label: string,
): boolean {
  const needle = label.trim().toLowerCase();
  if (!needle) return false;
  return topics.some((t) => t.name.trim().toLowerCase() === needle);
}

/** Find the signed-in user's topic row for a catalog leaf label, if any. */
export function findTopicByLabel<T extends { name: string }>(
  topics: ReadonlyArray<T>,
  label: string,
): T | undefined {
  const needle = label.trim().toLowerCase();
  if (!needle) return undefined;
  return topics.find((t) => t.name.trim().toLowerCase() === needle);
}
