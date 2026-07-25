import { articleMatchesTopicKeywords } from "@newsroom/ai";
import type { UserArticleScoreStatus } from "@newsroom/db";

export type FeedSourceJson = {
  sourceType: string;
  externalId: string | null;
};

export type FeedItemJson = {
  articleId: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  author: string | null;
  publishedAt: string | null;
  sources: FeedSourceJson[];
  keywordScore: number;
  aiScore: number | null;
  finalRank: number;
  reason: string | null;
  nearDuplicateOfArticleId: string | null;
  status: UserArticleScoreStatus;
  scoredAt: string;
};

export type FeedCursor = {
  finalRank: number;
  articleId: string;
};

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeFeedCursor(raw: string): FeedCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (
      typeof parsed.finalRank !== "number" ||
      !Number.isFinite(parsed.finalRank) ||
      typeof parsed.articleId !== "string" ||
      !parsed.articleId
    ) {
      return null;
    }
    return { finalRank: parsed.finalRank, articleId: parsed.articleId };
  } catch {
    return null;
  }
}

export function parseFeedLimit(raw: string | null): number {
  if (raw === null || raw === "") return 20;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(50, Math.floor(n));
}

export function parseFeedSourceFilter(
  raw: string | null,
): "hackernews" | "substack" | null | "invalid" {
  if (raw === null || raw === "") return null;
  if (raw === "hackernews" || raw === "substack") return raw;
  return "invalid";
}

/** When omitted, feed excludes dismissed. When set, only that status. */
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

/** Collect topic ids from `topic` (repeatable) and/or `topics` (comma-separated). */
export function parseFeedTopicIds(url: URL): string[] | "invalid" {
  const fromRepeat = url.searchParams.getAll("topic").flatMap((raw) =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const fromCsv = (url.searchParams.get("topics") ?? "")
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

/** Re-check keyword overlap for topic= filter (no stored match set). */
export function passesTopicFilter(
  title: string,
  summary: string | null,
  topicKeywords: string[],
): boolean {
  return articleMatchesTopicKeywords(title, summary, topicKeywords);
}
