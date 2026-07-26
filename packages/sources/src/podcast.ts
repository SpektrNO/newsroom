import type { NormalizedArticle, SourceAdapter } from "./types.js";
import { normalizeCanonicalUrl } from "./url.js";
import { hashArticleContent } from "./hash.js";
import {
  enclosureUrlFromItem,
  fetchAndParseRss,
  parseDurationSeconds,
  type RssFeedItem,
} from "./rss.js";

export type PodcastConfig = {
  rssUrl: string;
};

export type PodcastAdapterOptions = {
  fetch?: typeof fetch;
};

/**
 * Podcast RSS/Atom feeds.
 * Maps episodes to NormalizedArticle with optional show/duration/enclosure.
 * Does not scrape episode page HTML.
 */
export class PodcastAdapter implements SourceAdapter {
  readonly type = "podcast" as const;
  private readonly rssUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PodcastConfig, options: PodcastAdapterOptions = {}) {
    if (!config.rssUrl?.trim()) {
      throw new Error("invalid_config");
    }
    this.rssUrl = normalizeCanonicalUrl(config.rssUrl);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async fetchRecent(): Promise<NormalizedArticle[]> {
    const feed = await fetchAndParseRss(this.rssUrl, {
      fetch: this.fetchImpl,
      fetchErrorPrefix: "podcast_fetch_failed",
    });

    const showTitle =
      feed.title?.trim() || feed.itunesAuthor?.trim() || undefined;

    const articles: NormalizedArticle[] = [];

    for (const item of feed.items) {
      const article = mapEpisode(item, showTitle);
      if (!article) continue;
      articles.push(article);
    }

    return articles;
  }
}

function mapEpisode(
  item: RssFeedItem,
  feedShowTitle: string | undefined,
): NormalizedArticle | null {
  const title = item.title?.trim();
  if (!title) return null;

  const enclosureUrl = enclosureUrlFromItem(item);
  const link = item.link?.trim();

  let url: string | undefined;
  if (link) {
    try {
      url = normalizeCanonicalUrl(link);
    } catch {
      url = undefined;
    }
  }
  if (!url && enclosureUrl) {
    url = enclosureUrl;
  }
  if (!url) return null;

  const publishedAt = item.isoDate
    ? new Date(item.isoDate)
    : item.pubDate
      ? new Date(item.pubDate)
      : undefined;

  const showTitle =
    feedShowTitle ||
    item.itunesAuthor?.trim() ||
    undefined;

  const durationSeconds = parseDurationSeconds(item.itunesDuration);

  const article: NormalizedArticle = {
    url,
    title,
    summary: item.contentSnippet ?? item.summary ?? item.content,
    author: item.creator ?? item.author ?? item.itunesAuthor,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime())
        ? publishedAt
        : undefined,
    raw: item,
    externalId: typeof item.guid === "string" ? item.guid : undefined,
    showTitle,
    durationSeconds,
    enclosureUrl,
  };

  article.contentHash = hashArticleContent(article);
  return article;
}
