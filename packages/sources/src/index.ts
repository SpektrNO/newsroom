export type SourceType = "hackernews" | "substack" | "bluesky";

/** Canonical article shape produced by adapters (ingest features fill this in). */
export type NormalizedArticle = {
  url: string;
  title: string;
  summary?: string;
  author?: string;
  publishedAt?: Date;
  raw?: unknown;
  contentHash?: string;
};

export interface SourceAdapter {
  readonly type: SourceType;
  fetchRecent(): Promise<NormalizedArticle[]>;
}

/** No-op stub — live HN/Substack/Bluesky adapters land in later features. */
export class StubSourceAdapter implements SourceAdapter {
  constructor(readonly type: SourceType) {}

  async fetchRecent(): Promise<NormalizedArticle[]> {
    return [];
  }
}
