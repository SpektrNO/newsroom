/**
 * Hosts treated as community platforms (Substack, dev.to, …).
 * Used to default RSS category when the client does not send one.
 */
const COMMUNITY_RSS_HOST_SUFFIXES = [
  "substack.com",
  "dev.to",
] as const;

export function isCommunityRssHost(rssUrl: string): boolean {
  try {
    const host = new URL(rssUrl).hostname.toLowerCase().replace(/^www\./, "");
    return COMMUNITY_RSS_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

/** Default category for an RSS URL when category is omitted. */
export function defaultRssCategory(
  rssUrl: string,
): "community" | "website" {
  return isCommunityRssHost(rssUrl) ? "community" : "website";
}
