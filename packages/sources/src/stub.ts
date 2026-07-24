import type { NormalizedArticle, SourceAdapter, SourceType } from "./types.js";

/** No-op stub — used for unsupported types (e.g. bluesky) until implemented. */
export class StubSourceAdapter implements SourceAdapter {
  constructor(readonly type: SourceType) {}

  async fetchRecent(): Promise<NormalizedArticle[]> {
    return [];
  }
}
