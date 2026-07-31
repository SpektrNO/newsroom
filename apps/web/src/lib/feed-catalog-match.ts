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

/** Strip @ and lowercase — enough to match stored Bluesky handles. */
function tryNormalizeBlueskyHandle(handle: string): string | null {
  const trimmed = handle.trim();
  if (!trimmed) return null;
  if (/^did:/i.test(trimmed)) return trimmed;
  const normalized = trimmed.replace(/^@+/, "").toLowerCase();
  return normalized || null;
}

type MatchableSource = {
  adapter: string;
  config: { rssUrl?: unknown; subreddit?: unknown; handle?: unknown };
};

/**
 * True when the user already has an RSS subscription
 * for this catalog URL.
 */
export function isFeedAlreadyAdded(
  sources: ReadonlyArray<MatchableSource>,
  rssUrl: string,
): boolean {
  const needle = tryNormalizeRssUrl(rssUrl);
  if (!needle) return false;
  for (const source of sources) {
    if (source.adapter !== "rss") continue;
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
  sources: ReadonlyArray<MatchableSource>,
  entry: FeedCatalogEntry,
): boolean {
  const kind = catalogEntryKind(entry);
  if (kind === "reddit") {
    const sub = entry.subreddit?.trim();
    if (!sub) return false;
    const needle = normalizeSubredditKey(sub);
    for (const source of sources) {
      if (source.adapter !== "reddit") continue;
      const raw = source.config?.subreddit;
      if (typeof raw !== "string") continue;
      if (normalizeSubredditKey(raw) === needle) return true;
    }
    return false;
  }
  if (kind === "bluesky") {
    const handle = entry.handle?.trim();
    if (!handle) return false;
    const needle = tryNormalizeBlueskyHandle(handle);
    if (!needle) return false;
    for (const source of sources) {
      if (source.adapter !== "bluesky") continue;
      const raw = source.config?.handle;
      if (typeof raw !== "string") continue;
      const normalized = tryNormalizeBlueskyHandle(raw);
      if (normalized && normalized === needle) return true;
    }
    return false;
  }
  const rssUrl = entry.rssUrl?.trim();
  if (!rssUrl) return false;
  return isFeedAlreadyAdded(sources, rssUrl);
}
