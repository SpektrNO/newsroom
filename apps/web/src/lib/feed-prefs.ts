import type { SourceCategoryV1 } from "@newsroom/api-client";

export const FEED_PREFS_KEY = "newsroom.feed.prefs";

export type FeedViewFilter = "feed" | "saved" | "dismissed";
export type FeedSortField = "score" | "date";
export type FeedSortOrder = "asc" | "desc";
export type FeedSourceFilter = SourceCategoryV1;

const VIEWS = ["feed", "saved", "dismissed"] as const;
const SORTS = ["score", "date"] as const;
const ORDERS = ["asc", "desc"] as const;
const SOURCES = [
  "website",
  "community",
  "newsletter",
  "podcast",
  "social_media",
] as const;

export type StoredFeedPrefs = {
  view: FeedViewFilter;
  sort: FeedSortField;
  order: FeedSortOrder;
  /** Empty = all source types. */
  sources: FeedSourceFilter[];
  /** Specific subscription id, or null = all sources. */
  sourceId: string | null;
  /** Empty = no include filter (all topics, modulo excludes). */
  topicIds: string[];
  /** Empty = no exclude filter. */
  excludedTopicIds: string[];
  topicsOpen: boolean;
};

export const DEFAULT_FEED_PREFS: StoredFeedPrefs = {
  view: "feed",
  sort: "score",
  order: "desc",
  sources: [],
  sourceId: null,
  topicIds: [],
  excludedTopicIds: [],
  topicsOpen: true,
};

function parseView(value: unknown): FeedViewFilter {
  if (typeof value === "string" && (VIEWS as readonly string[]).includes(value)) {
    return value as FeedViewFilter;
  }
  return DEFAULT_FEED_PREFS.view;
}

function parseSort(value: unknown): FeedSortField {
  if (typeof value === "string" && (SORTS as readonly string[]).includes(value)) {
    return value as FeedSortField;
  }
  return DEFAULT_FEED_PREFS.sort;
}

function parseOrder(value: unknown): FeedSortOrder {
  if (typeof value === "string" && (ORDERS as readonly string[]).includes(value)) {
    return value as FeedSortOrder;
  }
  return DEFAULT_FEED_PREFS.order;
}

function parseSources(value: unknown): FeedSourceFilter[] {
  if (!Array.isArray(value)) return [];
  const out: FeedSourceFilter[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (
      typeof item === "string" &&
      (SOURCES as readonly string[]).includes(item) &&
      !seen.has(item)
    ) {
      seen.add(item);
      out.push(item as FeedSourceFilter);
    }
  }
  return out;
}

function parseTopicIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && item.trim() && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function parseSourceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

/** Drop topic ids that are no longer in the user's following list. */
export function pruneTopicIds(
  topicIds: string[],
  validIds: Iterable<string>,
): string[] {
  const valid = new Set(validIds);
  return topicIds.filter((id) => valid.has(id));
}

/** Keep sourceId only when it still exists in the user's subscriptions. */
export function pruneSourceId(
  sourceId: string | null,
  validIds: Iterable<string>,
): string | null {
  if (!sourceId) return null;
  const valid = new Set(validIds);
  return valid.has(sourceId) ? sourceId : null;
}

export function readStoredFeedPrefs(): StoredFeedPrefs {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_FEED_PREFS };
  }
  try {
    // Migrate legacy topics-open flag if prefs blob missing.
    const raw = localStorage.getItem(FEED_PREFS_KEY);
    if (!raw) {
      const legacyOpen = localStorage.getItem("newsroom.feed.topicsOpen");
      return {
        ...DEFAULT_FEED_PREFS,
        topicsOpen: legacyOpen === "0" ? false : true,
      };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_FEED_PREFS };
    }
    const obj = parsed as Record<string, unknown>;
    return {
      view: parseView(obj.view),
      sort: parseSort(obj.sort),
      order: parseOrder(obj.order),
      sources: parseSources(obj.sources),
      sourceId: parseSourceId(obj.sourceId),
      topicIds: parseTopicIds(obj.topicIds),
      excludedTopicIds: parseTopicIds(obj.excludedTopicIds),
      topicsOpen:
        typeof obj.topicsOpen === "boolean"
          ? obj.topicsOpen
          : DEFAULT_FEED_PREFS.topicsOpen,
    };
  } catch {
    return { ...DEFAULT_FEED_PREFS };
  }
}

export function writeStoredFeedPrefs(prefs: StoredFeedPrefs): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(FEED_PREFS_KEY, JSON.stringify(prefs));
    localStorage.removeItem("newsroom.feed.topicsOpen");
  } catch {
    /* quota / private mode */
  }
}
