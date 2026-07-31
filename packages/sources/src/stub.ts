import type {
  NormalizedArticle,
  SourceAdapter,
  SourceAdapterId,
} from "./types.js";

/** No-op stub — used for unsupported adapter ids until implemented. */
export class StubSourceAdapter implements SourceAdapter {
  constructor(readonly type: SourceAdapterId) {}

  async fetchRecent(): Promise<NormalizedArticle[]> {
    return [];
  }
}
