import type { NormalizedArticle, SourceAdapter } from "./types.js";
import { normalizeCanonicalUrl } from "./url.js";
import { hashArticleContent } from "./hash.js";
import { fetchAndParseRss } from "./rss.js";

export type RssConfig = {
  rssUrl: string;
};

export type RssAdapterOptions = {
  fetch?: typeof fetch;
};

/** @deprecated Use RssConfig */
export type SubstackConfig = RssConfig;
/** @deprecated Use RssAdapterOptions */
export type SubstackAdapterOptions = RssAdapterOptions;

/**
 * Generic article RSS/Atom feeds (websites, community platforms, digests).
 * Does not scrape paywalled full bodies — title/summary/link only.
 */
export class RssAdapter implements SourceAdapter {
  readonly type = "rss" as const;
  private readonly rssUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: RssConfig, options: RssAdapterOptions = {}) {
    if (!config.rssUrl?.trim()) {
      throw new Error("invalid_config");
    }
    this.rssUrl = normalizeCanonicalUrl(config.rssUrl);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async fetchRecent(): Promise<NormalizedArticle[]> {
    const feed = await fetchAndParseRss(this.rssUrl, {
      fetch: this.fetchImpl,
      fetchErrorPrefix: "rss_fetch_failed",
    });
    const articles: NormalizedArticle[] = [];

    for (const item of feed.items) {
      const link = item.link?.trim() || item.guid?.trim();
      const title = item.title?.trim();
      if (!link || !title) continue;

      let url: string;
      try {
        url = normalizeCanonicalUrl(link);
      } catch {
        continue;
      }

      const publishedAt = item.isoDate
        ? new Date(item.isoDate)
        : item.pubDate
          ? new Date(item.pubDate)
          : undefined;

      const article: NormalizedArticle = {
        url,
        title,
        summary: item.contentSnippet ?? item.summary ?? item.content,
        author: item.creator ?? item.author,
        publishedAt:
          publishedAt && !Number.isNaN(publishedAt.getTime())
            ? publishedAt
            : undefined,
        raw: item,
        externalId: typeof item.guid === "string" ? item.guid : undefined,
      };
      article.contentHash = hashArticleContent(article);
      articles.push(article);
    }

    return articles;
  }
}

/** @deprecated Use RssAdapter */
export const SubstackAdapter = RssAdapter;
