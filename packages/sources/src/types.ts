export type SourceType = "hackernews" | "substack" | "bluesky";

/** Canonical article shape produced by adapters. */
export type NormalizedArticle = {
  url: string;
  title: string;
  summary?: string;
  author?: string;
  publishedAt?: Date;
  raw?: unknown;
  contentHash?: string;
  /** Adapter-specific id (e.g. HN item id) for article_sources.external_id. */
  externalId?: string;
};

export interface SourceAdapter {
  readonly type: SourceType;
  fetchRecent(): Promise<NormalizedArticle[]>;
}
