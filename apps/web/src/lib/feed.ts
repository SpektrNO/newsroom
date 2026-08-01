import { articleMatchesTopicKeywords, inheritedKeywordsForTopicName } from "@newsroom/ai";
import type { UserArticleScoreStatus } from "@newsroom/db";

export type FeedSourceJson = {
  category: string;
  adapter?: string;
  externalId: string | null;
  /** Short subscription identity (host, handle, HN mode, …). */
  label: string | null;
};

export type FeedItemJson = {
  articleId: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  author: string | null;
  publishedAt: string | null;
  showTitle: string | null;
  durationSeconds: number | null;
  enclosureUrl: string | null;
  sources: FeedSourceJson[];
  keywordScore: number;
  aiScore: number | null;
  finalRank: number;
  reason: string | null;
  nearDuplicateOfArticleId: string | null;
  status: UserArticleScoreStatus;
  scoredAt: string;
};

export type FeedSort = "score" | "date";
export type FeedOrder = "asc" | "desc";

export {
  FEED_MAX_AGE_DAYS,
  feedMaxAgeCutoff,
  resolveFeedMaxAgeDays,
} from "@newsroom/db/feed-window";

export type FeedCursor = {
  sort: FeedSort;
  order: FeedOrder;
  /**
   * Sort key: `finalRank` for score, `publishedAt` epoch ms for date
   * (`null` when date-sorting an article with no publish time).
   */
  key: number | null;
  articleId: string;
};

export function parseFeedSort(raw: string | null): FeedSort | "invalid" {
  if (raw === null || raw === "" || raw === "score") return "score";
  if (raw === "date") return "date";
  return "invalid";
}

export function parseFeedOrder(raw: string | null): FeedOrder | "invalid" {
  if (raw === null || raw === "" || raw === "desc") return "desc";
  if (raw === "asc") return "asc";
  return "invalid";
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeFeedCursor(raw: string): FeedCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed.articleId !== "string" || !parsed.articleId) return null;

    // Legacy cursors: { finalRank, articleId } → score/desc.
    if (
      typeof parsed.finalRank === "number" &&
      Number.isFinite(parsed.finalRank) &&
      parsed.sort === undefined &&
      parsed.order === undefined &&
      parsed.key === undefined
    ) {
      return {
        sort: "score",
        order: "desc",
        key: parsed.finalRank,
        articleId: parsed.articleId,
      };
    }

    const sort = parseFeedSort(
      typeof parsed.sort === "string" ? parsed.sort : null,
    );
    const order = parseFeedOrder(
      typeof parsed.order === "string" ? parsed.order : null,
    );
    if (sort === "invalid" || order === "invalid") return null;

    const key = parsed.key;
    if (key !== null && (typeof key !== "number" || !Number.isFinite(key))) {
      return null;
    }
    if (sort === "score" && key === null) return null;

    return { sort, order, key, articleId: parsed.articleId };
  } catch {
    return null;
  }
}

/** Build the next-page cursor from a feed row under the active sort. */
export function feedCursorFromRow(
  row: {
    articleId: string;
    finalRank: number;
    publishedAt: Date | string | null;
  },
  sort: FeedSort,
  order: FeedOrder,
): FeedCursor {
  let key: number | null;
  if (sort === "score") {
    key = row.finalRank;
  } else if (row.publishedAt == null) {
    key = null;
  } else {
    const d =
      row.publishedAt instanceof Date
        ? row.publishedAt
        : new Date(row.publishedAt);
    key = Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  return { sort, order, key, articleId: row.articleId };
}

export function parseFeedLimit(raw: string | null): number {
  if (raw === null || raw === "") return 20;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(50, Math.floor(n));
}

export const FEED_SOURCE_TYPES = [
  "website",
  "community",
  "newsletter",
  "podcast",
  "social_media",
] as const;

export type FeedSourceType = (typeof FEED_SOURCE_TYPES)[number];

export function parseFeedSourceFilter(
  raw: string | null,
): FeedSourceType | null | "invalid" {
  if (raw === null || raw === "") return null;
  if ((FEED_SOURCE_TYPES as readonly string[]).includes(raw)) {
    return raw as FeedSourceType;
  }
  return "invalid";
}

/**
 * Collect source categories from repeatable `source` and/or comma-separated `sources`.
 * Empty = no source filter (all categories). Article matches if it has any selected category.
 */
export function parseFeedSourceFilters(
  url: URL,
): FeedSourceType[] | "invalid" {
  const fromRepeat = url.searchParams.getAll("source").flatMap((raw) =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const fromCsv = (url.searchParams.get("sources") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: FeedSourceType[] = [];
  for (const raw of [...fromRepeat, ...fromCsv]) {
    if (seen.has(raw)) continue;
    const parsed = parseFeedSourceFilter(raw);
    if (parsed === null) continue;
    if (parsed === "invalid") return "invalid";
    seen.add(raw);
    out.push(parsed);
  }
  return out;
}

const SOURCE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Single subscription id from `sourceId` (UUID). Empty = all subscriptions. */
export function parseFeedSourceId(
  raw: string | null,
): string | null | "invalid" {
  if (raw === null || raw === "") return null;
  const id = raw.trim();
  if (!SOURCE_ID_RE.test(id)) return "invalid";
  return id;
}

/** True when the article has at least one of the allowed source categories. */
export function passesSourceFilter(
  articleCategories: Set<string> | undefined,
  allowed: readonly string[],
): boolean {
  if (allowed.length === 0) return true;
  if (!articleCategories || articleCategories.size === 0) return false;
  for (const category of allowed) {
    if (articleCategories.has(category)) return true;
  }
  return false;
}

/** When omitted, feed shows `new`/`seen` only. When set, only that status. */
export function parseFeedStatusFilter(
  raw: string | null,
): UserArticleScoreStatus | null | "invalid" {
  if (raw === null || raw === "") return null;
  if (
    raw === "new" ||
    raw === "seen" ||
    raw === "saved" ||
    raw === "dismissed"
  ) {
    return raw;
  }
  return "invalid";
}

export type FeedRowInput = {
  articleId: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  author: string | null;
  publishedAt: Date | null;
  showTitle?: string | null;
  durationSeconds?: number | null;
  enclosureUrl?: string | null;
  keywordScore: number;
  aiScore: number | null;
  finalRank: number;
  reason: string | null;
  nearDuplicateOfArticleId: string | null;
  status: string;
  scoredAt: Date;
  sources: FeedSourceJson[];
};

export function toFeedItemJson(row: FeedRowInput): FeedItemJson {
  return {
    articleId: row.articleId,
    title: row.title,
    summary: row.summary,
    canonicalUrl: row.canonicalUrl,
    author: row.author,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    showTitle: row.showTitle ?? null,
    durationSeconds: row.durationSeconds ?? null,
    enclosureUrl: row.enclosureUrl ?? null,
    sources: row.sources,
    keywordScore: row.keywordScore,
    aiScore: row.aiScore,
    finalRank: row.finalRank,
    reason: row.reason,
    nearDuplicateOfArticleId: row.nearDuplicateOfArticleId,
    status: row.status as UserArticleScoreStatus,
    scoredAt: row.scoredAt.toISOString(),
  };
}

/** Human label for a source category (Podcast / Website / …). */
export function feedSourceTypeLabel(category: string): string {
  if (category === "podcast") return "Podcast";
  if (category === "website") return "Website";
  if (category === "newsletter") return "Newsletter";
  if (category === "social_media") return "Social";
  if (category === "community") return "Community";
  return category;
}

/** Compact identity for a subscription (hostname, @handle, Top/New). */
export function feedSourceSubscriptionLabel(
  adapter: string,
  config: {
    rssUrl?: unknown;
    handle?: unknown;
    mode?: unknown;
    subreddit?: unknown;
  } | null | undefined,
): string | null {
  if (adapter === "hackernews") {
    return "Hacker News";
  }
  if (adapter === "bluesky") {
    if (typeof config?.handle !== "string" || !config.handle.trim()) return null;
    const handle = config.handle.trim().replace(/^@/, "");
    return handle ? `@${handle}` : null;
  }
  if (adapter === "reddit") {
    if (typeof config?.subreddit !== "string" || !config.subreddit.trim()) {
      return null;
    }
    const sub = config.subreddit.trim().replace(/^\/?(r\/)/i, "");
    return sub ? `r/${sub}` : null;
  }
  if (typeof config?.rssUrl === "string" && config.rssUrl.trim()) {
    try {
      const host = new URL(config.rssUrl).hostname.replace(/^www\./, "");
      return host || config.rssUrl.trim();
    } catch {
      return config.rssUrl.trim();
    }
  }
  return null;
}

/** Display title for a subscription in filters / lists. */
export function sourceSubscriptionTitle(source: {
  adapter: string;
  category: string;
  config: {
    rssUrl?: unknown;
    handle?: unknown;
    mode?: unknown;
    subreddit?: unknown;
  } | null | undefined;
}): string {
  return (
    feedSourceSubscriptionLabel(source.adapter, source.config) ??
    feedSourceTypeLabel(source.category)
  );
}

/**
 * Split a stored feed reason into the keyword line and optional AI detail.
 * Reasons are written as "Matched keywords: a, b. <ai line>" after AI ranking.
 */
export function splitFeedReason(reason: string): {
  keywordsLine: string | null;
  detail: string | null;
} {
  const trimmed = reason.trim();
  if (!trimmed) return { keywordsLine: null, detail: null };
  const prefix = "Matched keywords:";
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return { keywordsLine: null, detail: trimmed };
  }
  const afterPrefix = trimmed.slice(prefix.length).trimStart();
  const sep = afterPrefix.indexOf(". ");
  if (sep === -1) {
    return { keywordsLine: trimmed.replace(/[.]+$/, ""), detail: null };
  }
  const keywords = afterPrefix.slice(0, sep).trim();
  const detail = afterPrefix.slice(sep + 2).trim();
  return {
    keywordsLine: `${prefix} ${keywords}`,
    detail: detail || null,
  };
}

/** Human-readable episode duration for feed cards. */
export function formatEpisodeDuration(
  durationSeconds: number | null | undefined,
): string | null {
  if (
    durationSeconds === null ||
    durationSeconds === undefined ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  ) {
    return null;
  }
  const total = Math.floor(durationSeconds);
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (hours === 0) return `${mins} min`;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Collect topic ids from `topic` (repeatable) and/or `topics` (comma-separated). */
export function parseFeedTopicIds(url: URL): string[] | "invalid" {
  return parseTopicIdParams(url, "topic", "topics");
}

/** Collect excluded topic ids from `excludeTopic` / `excludeTopics`. */
export function parseFeedExcludeTopicIds(url: URL): string[] | "invalid" {
  return parseTopicIdParams(url, "excludeTopic", "excludeTopics");
}

function parseTopicIdParams(
  url: URL,
  repeatKey: string,
  csvKey: string,
): string[] | "invalid" {
  const fromRepeat = url.searchParams.getAll(repeatKey).flatMap((raw) =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const fromCsv = (url.searchParams.get(csvKey) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...fromRepeat, ...fromCsv]) {
    if (seen.has(id)) continue;
    // Basic sanity: topic ids are non-empty tokens without whitespace.
    if (/\s/.test(id) || id.length > 128) return "invalid";
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Re-check keyword overlap for topic= filter (legacy rows only — see matchesTopicIds). */
export function passesTopicFilter(
  title: string,
  summary: string | null,
  topicKeywords: string[],
  inheritedKeywords?: string[],
  showTitle?: string | null,
): boolean {
  return articleMatchesTopicKeywords(
    title,
    summary,
    topicKeywords,
    inheritedKeywords,
    showTitle,
  );
}

/**
 * Topic-filter verdict from the stored, AI-narrowed `matchedTopicIds` set.
 * `"unknown"` means the row predates this column (NULL) — caller should fall
 * back to `passesTopicFilter` for that row only.
 */
export function matchesTopicIds(
  rowMatchedTopicIds: string[] | null | undefined,
  selectedTopicIds: string[],
): "match" | "no-match" | "unknown" {
  if (rowMatchedTopicIds === null || rowMatchedTopicIds === undefined) {
    return "unknown";
  }
  return rowMatchedTopicIds.some((id) => selectedTopicIds.includes(id))
    ? "match"
    : "no-match";
}

/**
 * Include (OR) ∩ exclude (NOT any). Empty includes = no include filter;
 * empty excludes = no exclude filter.
 */
export function passesTopicSelection(opts: {
  matchedTopicIds: string[] | null | undefined;
  title: string;
  summary: string | null;
  showTitle?: string | null;
  includeIds: readonly string[];
  excludeIds: readonly string[];
  includeKeywords: readonly string[];
  includeInheritedKeywords?: readonly string[];
  excludeKeywords: readonly string[];
  excludeInheritedKeywords?: readonly string[];
}): boolean {
  if (opts.excludeIds.length > 0) {
    const excluded = matchesTopicIds(opts.matchedTopicIds, [...opts.excludeIds]);
    if (excluded === "match") return false;
    if (
      excluded === "unknown" &&
      passesTopicFilter(
        opts.title,
        opts.summary,
        [...opts.excludeKeywords],
        opts.excludeInheritedKeywords
          ? [...opts.excludeInheritedKeywords]
          : undefined,
        opts.showTitle,
      )
    ) {
      return false;
    }
  }

  if (opts.includeIds.length === 0) return true;

  const included = matchesTopicIds(opts.matchedTopicIds, [...opts.includeIds]);
  if (included === "no-match") return false;
  if (
    included === "unknown" &&
    !passesTopicFilter(
      opts.title,
      opts.summary,
      [...opts.includeKeywords],
      opts.includeInheritedKeywords
        ? [...opts.includeInheritedKeywords]
        : undefined,
      opts.showTitle,
    )
  ) {
    return false;
  }
  return true;
}

const MAX_FEED_SEARCH_LEN = 200;

/** Free-text `q` param: trim; empty → null; overlong → invalid. */
export function parseFeedSearchQuery(
  raw: string | null,
): string | null | "invalid" {
  if (raw === null || raw === "") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_FEED_SEARCH_LEN) return "invalid";
  return trimmed;
}

/**
 * Case-insensitive find-in-feed: every whitespace token must appear in
 * title, summary, or reason (AND).
 */
export function passesSearchFilter(
  title: string,
  summary: string | null,
  reason: string | null,
  query: string,
): boolean {
  const hay = `${title}\n${summary ?? ""}\n${reason ?? ""}`.toLowerCase();
  const tokens = tokenizeFeedSearch(query);
  if (tokens.length === 0) return true;
  return tokens.every((t) => hay.includes(t));
}

/** Whitespace tokens for `q` (lowercased). */
export function tokenizeFeedSearch(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Escape `%` / `_` for SQL ILIKE patterns. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Count rows that pass optional topic / source / search filters. */
export function countMatchingFeedRows(
  rows: Array<{
    articleId: string;
    title: string;
    summary: string | null;
    reason?: string | null;
    showTitle?: string | null;
    matchedTopicIds?: string[] | null;
  }>,
  opts: {
    topicIds: string[] | null;
    excludeTopicIds?: string[] | null;
    topicKeywords: string[] | null;
    topicInheritedKeywords?: string[] | null;
    excludeTopicKeywords?: string[] | null;
    excludeTopicInheritedKeywords?: string[] | null;
    /** Non-empty = include articles that have any of these source categories. */
    sourceFilter: string[] | null;
    searchQuery: string | null;
    sourceTypesByArticle: Map<string, Set<string>>;
  },
): number {
  const includeIds = opts.topicIds ?? [];
  const excludeIds = opts.excludeTopicIds ?? [];
  let n = 0;
  for (const row of rows) {
    if (includeIds.length > 0 || excludeIds.length > 0) {
      if (
        !passesTopicSelection({
          matchedTopicIds: row.matchedTopicIds,
          title: row.title,
          summary: row.summary,
          showTitle: row.showTitle,
          includeIds,
          excludeIds,
          includeKeywords: opts.topicKeywords ?? [],
          includeInheritedKeywords: opts.topicInheritedKeywords ?? undefined,
          excludeKeywords: opts.excludeTopicKeywords ?? [],
          excludeInheritedKeywords:
            opts.excludeTopicInheritedKeywords ?? undefined,
        })
      ) {
        continue;
      }
    }
    if (opts.sourceFilter !== null && opts.sourceFilter.length > 0) {
      const categories = opts.sourceTypesByArticle.get(row.articleId);
      if (!passesSourceFilter(categories, opts.sourceFilter)) continue;
    }
    if (
      opts.searchQuery !== null &&
      !passesSearchFilter(
        row.title,
        row.summary,
        row.reason ?? null,
        opts.searchQuery,
      )
    ) {
      continue;
    }
    n += 1;
  }
  return n;
}
