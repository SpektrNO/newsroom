/** Browser-safe catalog/follow helpers (no Node / DB / sources imports). */

/** Body for one-click Follow from a catalog leaf (POST /api/topics). */
export type FollowTopicDefaults = {
  name: string;
  keywords: string[];
  weight: number;
  enabled: boolean;
};

/**
 * Split a catalog leaf label into starter keywords that can substring-match
 * article titles (e.g. "LLMs & agents" → ["LLMs", "agents"]).
 * Using the full label alone almost never hits real headlines.
 */
export function starterKeywordsFromLabel(label: string): string[] {
  const raw = label.trim();
  if (!raw) return [];

  const parts = raw
    .split(/[&/,|+]+|\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts.length > 0 ? parts : [raw]) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/**
 * Normative create payload when following a curated catalog leaf:
 * name = label, keywords = tokenized label parts, weight = 1, enabled = true.
 */
export function followDefaultsForLabel(label: string): FollowTopicDefaults {
  const name = label.trim();
  return {
    name,
    keywords: starterKeywordsFromLabel(name),
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
