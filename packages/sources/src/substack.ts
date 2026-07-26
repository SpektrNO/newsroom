import type { NormalizedArticle, SourceAdapter } from "./types.js";
import { normalizeCanonicalUrl } from "./url.js";
import { hashArticleContent } from "./hash.js";
import { fetchAndParseRss } from "./rss.js";

export type SubstackConfig = {
  rssUrl: string;
};

export type SubstackAdapterOptions = {
  fetch?: typeof fetch;
};

/**
 * Substack (and compatible) RSS/Atom feeds.
 * Does not scrape paywalled full bodies — title/summary/link only.
 */
export class SubstackAdapter implements SourceAdapter {
  readonly type = "substack" as const;
  private readonly rssUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SubstackConfig, options: SubstackAdapterOptions = {}) {
    if (!config.rssUrl?.trim()) {
      throw new Error("invalid_config");
    }
    this.rssUrl = normalizeCanonicalUrl(config.rssUrl);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async fetchRecent(): Promise<NormalizedArticle[]> {
    const feed = await fetchAndParseRss(this.rssUrl, {
      fetch: this.fetchImpl,
      fetchErrorPrefix: "substack_fetch_failed",
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
