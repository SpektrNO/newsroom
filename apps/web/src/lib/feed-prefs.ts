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
  /** Empty = all sources. */
  sources: FeedSourceFilter[];
  /** Empty = all topics. */
  topicIds: string[];
  topicsOpen: boolean;
};

export const DEFAULT_FEED_PREFS: StoredFeedPrefs = {
  view: "feed",
  sort: "score",
  order: "desc",
  sources: [],
  topicIds: [],
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

/** Drop topic ids that are no longer in the user's following list. */
export function pruneTopicIds(
  topicIds: string[],
  validIds: Iterable<string>,
): string[] {
  const valid = new Set(validIds);
  return topicIds.filter((id) => valid.has(id));
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
      topicIds: parseTopicIds(obj.topicIds),
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
