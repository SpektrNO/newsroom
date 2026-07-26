export type {
  SourceType,
  NormalizedArticle,
  SourceAdapter,
} from "./types.js";
export { StubSourceAdapter } from "./stub.js";
export { normalizeCanonicalUrl } from "./url.js";
export { hashArticleContent } from "./hash.js";
export {
  HackerNewsAdapter,
  HN_FETCH_LIMIT,
  type HackerNewsConfig,
  type HackerNewsAdapterOptions,
} from "./hackernews.js";
export {
  SubstackAdapter,
  type SubstackConfig,
  type SubstackAdapterOptions,
} from "./substack.js";
export {
  PodcastAdapter,
  type PodcastConfig,
  type PodcastAdapterOptions,
} from "./podcast.js";
export {
  fetchAndParseRss,
  parseDurationSeconds,
  enclosureUrlFromItem,
} from "./rss.js";
export {
  createSourceAdapter,
  type AdapterConfig,
  type CreateAdapterOptions,
} from "./create-adapter.js";
