import { topicPathLabels } from "./topic-tree.js";

/**
 * Split a catalog label into starter keywords that can substring-match
 * article titles (e.g. "LLMs & agents" → ["LLMs", "agents"]).
 */
export function tokenizeTopicLabel(label: string): string[] {
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

function pushUnique(out: string[], seen: Set<string>, tokens: string[]) {
  for (const t of tokens) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
}

/**
 * Locked starters for a leaf: tokens from the leaf label plus every ancestor
 * on the catalog path (Technology → AI & Machine Learning → …).
 */
export function pathKeywordsForTopicName(name: string): string[] {
  const path = topicPathLabels(name);
  const labels = path ?? (name.trim() ? [name.trim()] : []);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    pushUnique(out, seen, tokenizeTopicLabel(label));
  }
  return out;
}

/**
 * Ancestor-only tokens (excludes the leaf label). Used as weak inherited
 * keywords at rank time so existing leaf keywords stay primary.
 */
export function inheritedKeywordsForTopicName(name: string): string[] {
  const path = topicPathLabels(name);
  if (!path || path.length < 2) return [];
  const leafTokens = new Set(
    tokenizeTopicLabel(path[path.length - 1]!).map((t) => t.toLowerCase()),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of path.slice(0, -1)) {
    for (const token of tokenizeTopicLabel(label)) {
      const key = token.toLowerCase();
      if (leafTokens.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(token);
    }
  }
  return out;
}
