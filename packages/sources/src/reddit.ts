import type { NormalizedArticle, SourceAdapter } from "./types.js";
import { hashArticleContent } from "./hash.js";
import { normalizeCanonicalUrl } from "./url.js";
import { normalizeSubredditName } from "./reddit-subreddit.js";

export const REDDIT_FETCH_LIMIT = 50;
export const DEFAULT_REDDIT_USER_AGENT = "newsroom:v1 (by /u/newsroom_bot)";

export type RedditConfig = {
  subreddit: string;
};

export type RedditAdapterOptions = {
  fetch?: typeof fetch;
  limit?: number;
  userAgent?: string;
  clientId?: string;
  clientSecret?: string;
  /** Override OAuth token URL (tests). */
  tokenUrl?: string;
  /** Override listing base — oauth host or www (tests). */
  listingBaseUrl?: string;
};

type RedditListingChild = {
  kind?: string;
  data?: RedditPostData;
};

type RedditPostData = {
  id?: string;
  name?: string;
  title?: string;
  selftext?: string;
  url?: string;
  permalink?: string;
  author?: string;
  created_utc?: number;
  removed_by_category?: string | null;
  is_video?: boolean;
  is_gallery?: boolean;
  post_hint?: string;
  domain?: string;
};

type RedditListingResponse = {
  data?: {
    children?: RedditListingChild[];
  };
};

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

/**
 * Reddit subreddit new-listing via public JSON or application-only OAuth.
 * Operator credentials only — no end-user Reddit login.
 */
export class RedditAdapter implements SourceAdapter {
  readonly type = "reddit" as const;
  private readonly subreddit: string;
  private readonly fetchImpl: typeof fetch;
  private readonly limit: number;
  private readonly userAgent: string;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly tokenUrl: string;
  private readonly listingBaseUrl: string | undefined;

  constructor(config: RedditConfig, options: RedditAdapterOptions = {}) {
    if (!config.subreddit?.trim()) {
      throw new Error("invalid_config");
    }
    this.subreddit = normalizeSubredditName(config.subreddit);
    this.fetchImpl = options.fetch ?? fetch;
    const limit = options.limit ?? REDDIT_FETCH_LIMIT;
    this.limit = Math.min(100, Math.max(1, limit));
    this.userAgent = resolveUserAgent(options.userAgent);
    this.clientId =
      options.clientId?.trim() ||
      process.env.REDDIT_CLIENT_ID?.trim() ||
      undefined;
    this.clientSecret =
      options.clientSecret?.trim() ||
      process.env.REDDIT_CLIENT_SECRET?.trim() ||
      undefined;
    this.tokenUrl =
      options.tokenUrl?.trim() ||
      "https://www.reddit.com/api/v1/access_token";
    this.listingBaseUrl = options.listingBaseUrl?.replace(/\/+$/, "");
  }

  async fetchRecent(): Promise<NormalizedArticle[]> {
    const useOAuth = Boolean(this.clientId && this.clientSecret);
    const token = useOAuth ? await this.fetchAccessToken() : null;

    const base =
      this.listingBaseUrl ||
      (token
        ? "https://oauth.reddit.com"
        : "https://www.reddit.com");
    const path = token
      ? `/r/${this.subreddit}/new`
      : `/r/${this.subreddit}/new.json`;
    const url = new URL(`${base}${path}`);
    url.searchParams.set("limit", String(this.limit));
    url.searchParams.set("raw_json", "1");

    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": this.userAgent,
    };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const res = await this.fetchImpl(url.toString(), { headers });
    if (!res.ok) {
      throw new Error(`reddit_fetch_failed:${res.status}`);
    }

    const body = (await res.json()) as RedditListingResponse;
    const children = Array.isArray(body.data?.children)
      ? body.data!.children!
      : [];

    const articles: NormalizedArticle[] = [];
    for (const child of children) {
      const article = mapListingChild(child, this.subreddit);
      if (article) articles.push(article);
    }
    return articles;
  }

  private async fetchAccessToken(): Promise<string> {
    const id = this.clientId!;
    const secret = this.clientSecret!;
    const basic = basicAuthHeader(id, secret);
    const res = await this.fetchImpl(this.tokenUrl, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": this.userAgent,
        accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      throw new Error(`reddit_token_failed:${res.status}`);
    }
    const body = (await res.json()) as TokenResponse;
    const token = body.access_token?.trim();
    if (!token) {
      throw new Error("reddit_token_failed:missing_access_token");
    }
    return token;
  }
}

export function resolveUserAgent(override?: string): string {
  return (
    override?.trim() ||
    process.env.REDDIT_USER_AGENT?.trim() ||
    DEFAULT_REDDIT_USER_AGENT
  );
}

/** Exported for unit tests. */
export function mapListingChild(
  child: RedditListingChild,
  subreddit: string,
): NormalizedArticle | null {
  if (child.kind && child.kind !== "t3") return null;
  const data = child.data;
  if (!data) return null;

  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) return null;

  if (data.removed_by_category) return null;
  const authorRaw = typeof data.author === "string" ? data.author.trim() : "";
  if (
    authorRaw === "[deleted]" ||
    authorRaw === "[removed]" ||
    title === "[deleted]" ||
    title === "[removed]"
  ) {
    return null;
  }

  const selftext =
    typeof data.selftext === "string" ? data.selftext.trim() : "";
  if (
    selftext === "[deleted]" ||
    selftext === "[removed]"
  ) {
    return null;
  }

  // Pure media with no text haystack beyond a thin title is still rankable
  // via title; skip only when title missing (already handled).

  const permalink =
    typeof data.permalink === "string" ? data.permalink.trim() : "";
  if (!permalink) return null;

  let canonicalUrl: string;
  try {
    const absolute = permalink.startsWith("http")
      ? permalink
      : `https://www.reddit.com${permalink.startsWith("/") ? "" : "/"}${permalink}`;
    canonicalUrl = normalizeCanonicalUrl(absolute);
  } catch {
    return null;
  }

  const summary = buildSummary(selftext, data.url, data.domain);
  const author = authorRaw
    ? `u/${authorRaw} · r/${subreddit}`
    : `r/${subreddit}`;
  const publishedAt =
    typeof data.created_utc === "number" && Number.isFinite(data.created_utc)
      ? new Date(data.created_utc * 1000)
      : undefined;

  const externalId =
    (typeof data.name === "string" && data.name.trim()) ||
    (typeof data.id === "string" && data.id.trim()
      ? `t3_${data.id.trim()}`
      : undefined);

  const article: NormalizedArticle = {
    url: canonicalUrl,
    title,
    summary: summary || undefined,
    author,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime())
        ? publishedAt
        : undefined,
    externalId,
    raw: child,
  };
  article.contentHash = hashArticleContent(article);
  return article;
}

function buildSummary(
  selftext: string,
  linkUrl: string | undefined,
  domain: string | undefined,
): string {
  if (selftext) return selftext;
  if (
    typeof linkUrl === "string" &&
    linkUrl.trim() &&
    !isRedditHostedLink(linkUrl)
  ) {
    const domainHint =
      typeof domain === "string" && domain.trim() ? ` (${domain.trim()})` : "";
    return `${linkUrl.trim()}${domainHint}`;
  }
  return "";
}

function isRedditHostedLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return (
      host === "reddit.com" ||
      host.endsWith(".reddit.com") ||
      host === "redd.it" ||
      host === "i.redd.it" ||
      host === "v.redd.it"
    );
  } catch {
    return false;
  }
}

function basicAuthHeader(id: string, secret: string): string {
  const raw = `${id}:${secret}`;
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
