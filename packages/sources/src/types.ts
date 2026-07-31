/** Product / UX category (feed filters, Sources tabs). */
export type SourceCategory =
  | "podcast"
  | "website"
  | "social_media"
  | "community";

/** Ingest adapter identity (createSourceAdapter switch). */
export type SourceAdapterId =
  | "hackernews"
  | "rss"
  | "bluesky"
  | "reddit";

/** @deprecated Use SourceAdapterId — kept during transition in a few call sites. */
export type SourceType = SourceAdapterId;

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
  /** Podcast show / channel title when known. */
  showTitle?: string;
  /** Episode duration in seconds when known. */
  durationSeconds?: number;
  /** Audio (or media) enclosure URL when present. */
  enclosureUrl?: string;
};

export interface SourceAdapter {
  readonly type: SourceAdapterId;
  fetchRecent(): Promise<NormalizedArticle[]>;
}
