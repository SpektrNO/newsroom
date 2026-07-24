import Parser from "rss-parser";
import type { NormalizedArticle, SourceAdapter } from "./types.js";
import { normalizeCanonicalUrl } from "./url.js";
import { hashArticleContent } from "./hash.js";

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
  private readonly parser: Parser;

  constructor(config: SubstackConfig, options: SubstackAdapterOptions = {}) {
    if (!config.rssUrl?.trim()) {
      throw new Error("invalid_config");
    }
    this.rssUrl = normalizeCanonicalUrl(config.rssUrl);
    this.fetchImpl = options.fetch ?? fetch;
    this.parser = new Parser({
      timeout: 15_000,
    });
  }

  async fetchRecent(): Promise<NormalizedArticle[]> {
    const res = await this.fetchImpl(this.rssUrl, {
      headers: {
        accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) {
      throw new Error(`substack_fetch_failed:${res.status}`);
    }

    const xml = await res.text();
    const feed = await this.parser.parseString(xml);
    const articles: NormalizedArticle[] = [];

    for (const item of feed.items ?? []) {
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
