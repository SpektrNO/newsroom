import { normalizeCanonicalUrl } from "@newsroom/sources";

/** Normalize RSS URL for subscription matching; null if invalid. */
export function tryNormalizeRssUrl(url: string): string | null {
  try {
    return normalizeCanonicalUrl(url);
  } catch {
    return null;
  }
}

/**
 * True when the user already has a substack subscription for this catalog RSS URL.
 */
export function isFeedAlreadyAdded(
  sources: ReadonlyArray<{
    sourceType: string;
    config: { rssUrl?: unknown };
  }>,
  rssUrl: string,
): boolean {
  const needle = tryNormalizeRssUrl(rssUrl);
  if (!needle) return false;
  for (const source of sources) {
    if (source.sourceType !== "substack") continue;
    const raw = source.config?.rssUrl;
    if (typeof raw !== "string") continue;
    const normalized = tryNormalizeRssUrl(raw);
    if (normalized && normalized === needle) return true;
  }
  return false;
}
