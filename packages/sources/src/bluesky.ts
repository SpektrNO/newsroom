import type { NormalizedArticle, SourceAdapter } from "./types.js";
import { hashArticleContent } from "./hash.js";
import { normalizeBlueskyHandle } from "./bluesky-handle.js";

export const DEFAULT_BLUESKY_APPVIEW_URL = "https://public.api.bsky.app";
export const BLUESKY_FETCH_LIMIT = 50;
export const BLUESKY_TITLE_MAX = 120;

const REASON_REPOST = "app.bsky.feed.defs#reasonRepost";

export type BlueskyConfig = {
  handle: string;
  did?: string;
};

export type BlueskyAdapterOptions = {
  fetch?: typeof fetch;
  /** Override AppView base (no trailing slash). Defaults to env or public AppView. */
  appViewUrl?: string;
  limit?: number;
};

type FeedViewPost = {
  post?: {
    uri?: string;
    author?: {
      did?: string;
      handle?: string;
      displayName?: string;
    };
    record?: {
      text?: string;
      createdAt?: string;
    };
  };
  reason?: {
    $type?: string;
  };
};

type AuthorFeedResponse = {
  feed?: FeedViewPost[];
  cursor?: string;
};

/**
 * Bluesky author feed via public AppView (unauthenticated).
 * Original + quote posts; skips pure reposts and empty text.
 */
export class BlueskyAdapter implements SourceAdapter {
  readonly type = "bluesky" as const;
  private readonly handle: string;
  private readonly did: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly appViewUrl: string;
  private readonly limit: number;

  constructor(config: BlueskyConfig, options: BlueskyAdapterOptions = {}) {
    if (!config.handle?.trim()) {
      throw new Error("invalid_config");
    }
    this.handle = normalizeBlueskyHandle(config.handle);
    this.did =
      typeof config.did === "string" && config.did.trim()
        ? config.did.trim()
        : undefined;
    this.fetchImpl = options.fetch ?? fetch;
    this.appViewUrl = resolveAppViewUrl(options.appViewUrl);
    const limit = options.limit ?? BLUESKY_FETCH_LIMIT;
    this.limit = Math.min(100, Math.max(1, limit));
  }

  async fetchRecent(): Promise<NormalizedArticle[]> {
    const actor = this.did ?? this.handle;
    const url = new URL(`${this.appViewUrl}/xrpc/app.bsky.feed.getAuthorFeed`);
    url.searchParams.set("actor", actor);
    url.searchParams.set("limit", String(this.limit));
    url.searchParams.set("filter", "posts_no_replies");

    const res = await this.fetchImpl(url.toString(), {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`bluesky_fetch_failed:${res.status}`);
    }

    const body = (await res.json()) as AuthorFeedResponse;
    const feed = Array.isArray(body.feed) ? body.feed : [];

    const articles: NormalizedArticle[] = [];
    for (const item of feed) {
      const article = mapFeedItem(item, this.handle);
      if (article) articles.push(article);
    }
    return articles;
  }
}

export function resolveAppViewUrl(override?: string): string {
  const raw =
    override?.trim() ||
    process.env.BLUESKY_APPVIEW_URL?.trim() ||
    DEFAULT_BLUESKY_APPVIEW_URL;
  return raw.replace(/\/+$/, "");
}

/** Exported for unit tests. */
export function mapFeedItem(
  item: FeedViewPost,
  fallbackHandle: string,
): NormalizedArticle | null {
  if (item.reason?.$type === REASON_REPOST) {
    return null;
  }

  const post = item.post;
  if (!post?.uri) return null;

  const text = post.record?.text?.trim() ?? "";
  if (!text) return null;

  const parsed = parseAtPostUri(post.uri);
  if (!parsed) return null;

  const profile =
    post.author?.handle?.trim() ||
    fallbackHandle ||
    post.author?.did ||
    parsed.did;
  const canonicalUrl = `https://bsky.app/profile/${profile}/post/${parsed.rkey}`;

  const title = titleFromPostText(text);
  const author =
    post.author?.displayName?.trim() ||
    post.author?.handle?.trim() ||
    fallbackHandle ||
    undefined;

  const publishedAt = post.record?.createdAt
    ? new Date(post.record.createdAt)
    : undefined;

  const article: NormalizedArticle = {
    url: canonicalUrl,
    title,
    summary: text,
    author,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime())
        ? publishedAt
        : undefined,
    externalId: post.uri,
    raw: item,
  };
  article.contentHash = hashArticleContent(article);
  return article;
}

export function titleFromPostText(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() || text;
  if (firstLine.length <= BLUESKY_TITLE_MAX) return firstLine;
  return `${firstLine.slice(0, BLUESKY_TITLE_MAX - 1)}…`;
}

export function parseAtPostUri(
  uri: string,
): { did: string; rkey: string } | null {
  // at://{did}/app.bsky.feed.post/{rkey}
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)$/.exec(uri);
  if (!m?.[1] || !m[2]) return null;
  return { did: m[1], rkey: m[2] };
}
