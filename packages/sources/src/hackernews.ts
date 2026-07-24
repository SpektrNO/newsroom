import type { NormalizedArticle, SourceAdapter } from "./types.js";
import { normalizeCanonicalUrl } from "./url.js";
import { hashArticleContent } from "./hash.js";

/** Max items hydrated per fetchRecent call (Firebase list → item details). */
export const HN_FETCH_LIMIT = 100;

const HN_BASE = "https://hacker-news.firebaseio.com/v0";

export type HackerNewsConfig = {
  mode?: "top" | "new";
};

export type HackerNewsAdapterOptions = {
  fetch?: typeof fetch;
  /** Override default batch cap (tests). Still capped at HN_FETCH_LIMIT. */
  limit?: number;
};

type HnItem = {
  id: number;
  deleted?: boolean;
  type?: string;
  by?: string;
  time?: number;
  text?: string;
  dead?: boolean;
  url?: string;
  title?: string;
  score?: number;
};

/**
 * Hacker News via Firebase API:
 * - Candidate IDs from `/v0/topstories.json` or `/v0/newstories.json`
 * - Hydrate each via `/v0/item/{id}.json`
 * Algolia HN Search is not used (Firebase alone is enough for v1 determinism).
 */
export class HackerNewsAdapter implements SourceAdapter {
  readonly type = "hackernews" as const;
  private readonly mode: "top" | "new";
  private readonly fetchImpl: typeof fetch;
  private readonly limit: number;

  constructor(
    config: HackerNewsConfig = {},
    options: HackerNewsAdapterOptions = {},
  ) {
    this.mode = config.mode === "new" ? "new" : "top";
    this.fetchImpl = options.fetch ?? fetch;
    this.limit = Math.min(
      Math.max(1, options.limit ?? HN_FETCH_LIMIT),
      HN_FETCH_LIMIT,
    );
  }

  async fetchRecent(): Promise<NormalizedArticle[]> {
    const listPath =
      this.mode === "new" ? "newstories.json" : "topstories.json";
    const listRes = await this.fetchImpl(`${HN_BASE}/${listPath}`);
    if (!listRes.ok) {
      throw new Error(`hn_list_failed:${listRes.status}`);
    }

    const ids = (await listRes.json()) as unknown;
    if (!Array.isArray(ids)) {
      throw new Error("hn_list_invalid");
    }

    const batch = ids
      .filter((id): id is number => typeof id === "number")
      .slice(0, this.limit);

    const articles: NormalizedArticle[] = [];
    for (const id of batch) {
      const itemRes = await this.fetchImpl(`${HN_BASE}/item/${id}.json`);
      if (!itemRes.ok) continue;
      const item = (await itemRes.json()) as HnItem | null;
      if (!item || item.deleted || item.dead || item.type !== "story") continue;
      if (!item.title) continue;

      // Prefer external URL; fall back to HN discussion page for Ask/Show HN.
      const rawUrl =
        item.url?.trim() ||
        `https://news.ycombinator.com/item?id=${item.id}`;

      let url: string;
      try {
        url = normalizeCanonicalUrl(rawUrl);
      } catch {
        continue;
      }

      const article: NormalizedArticle = {
        url,
        title: item.title,
        summary: item.text,
        author: item.by,
        publishedAt:
          typeof item.time === "number" ? new Date(item.time * 1000) : undefined,
        raw: item,
        externalId: String(item.id),
      };
      article.contentHash = hashArticleContent(article);
      articles.push(article);
    }

    return articles;
  }
}
