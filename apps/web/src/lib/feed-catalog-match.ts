import { normalizeCanonicalUrl } from "@newsroom/sources/url";
import {
  catalogEntryKind,
  type FeedCatalogEntry,
} from "./feed-catalog.js";

/** Normalize RSS URL for subscription matching; null if invalid. */
export function tryNormalizeRssUrl(url: string): string | null {
  try {
    return normalizeCanonicalUrl(url);
  } catch {
    return null;
  }
}

/**
 * True when the user already has an RSS subscription (feed or podcast)
 * for this catalog URL.
 */
export function isFeedAlreadyAdded(
  sources: ReadonlyArray<{
    sourceType: string;
    config: { rssUrl?: unknown; subreddit?: unknown };
  }>,
  rssUrl: string,
): boolean {
  const needle = tryNormalizeRssUrl(rssUrl);
  if (!needle) return false;
  for (const source of sources) {
    if (source.sourceType !== "substack" && source.sourceType !== "podcast") {
      continue;
    }
    const raw = source.config?.rssUrl;
    if (typeof raw !== "string") continue;
    const normalized = tryNormalizeRssUrl(raw);
    if (normalized && normalized === needle) return true;
  }
  return false;
}

function normalizeSubredditKey(raw: string): string {
  return raw
    .trim()
    .replace(/^\/?(r\/)/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** True when the catalog entry is already among the user's sources. */
export function isCatalogEntryAlreadyAdded(
  sources: ReadonlyArray<{
    sourceType: string;
    config: { rssUrl?: unknown; subreddit?: unknown };
  }>,
  entry: FeedCatalogEntry,
): boolean {
  if (catalogEntryKind(entry) === "reddit") {
    const sub = entry.subreddit?.trim();
    if (!sub) return false;
    const needle = normalizeSubredditKey(sub);
    for (const source of sources) {
      if (source.sourceType !== "reddit") continue;
      const raw = source.config?.subreddit;
      if (typeof raw !== "string") continue;
      if (normalizeSubredditKey(raw) === needle) return true;
    }
    return false;
  }
  const rssUrl = entry.rssUrl?.trim();
  if (!rssUrl) return false;
  return isFeedAlreadyAdded(sources, rssUrl);
}
