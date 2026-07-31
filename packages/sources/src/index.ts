export type {
  SourceCategory,
  SourceAdapterId,
  SourceType,
  NormalizedArticle,
  SourceAdapter,
} from "./types.js";
export { StubSourceAdapter } from "./stub.js";
export { normalizeCanonicalUrl } from "./url.js";
export { normalizeBlueskyHandle } from "./bluesky-handle.js";
export {
  isCommunityRssHost,
  defaultRssCategory,
} from "./community-host.js";
export { hashArticleContent } from "./hash.js";
export {
  HackerNewsAdapter,
  HN_FETCH_LIMIT,
  type HackerNewsConfig,
  type HackerNewsAdapterOptions,
} from "./hackernews.js";
export {
  RssAdapter,
  SubstackAdapter,
  type RssConfig,
  type RssAdapterOptions,
  type SubstackConfig,
  type SubstackAdapterOptions,
} from "./substack.js";
export {
  PodcastAdapter,
  type PodcastConfig,
  type PodcastAdapterOptions,
} from "./podcast.js";
export {
  BlueskyAdapter,
  DEFAULT_BLUESKY_APPVIEW_URL,
  BLUESKY_FETCH_LIMIT,
  type BlueskyConfig,
  type BlueskyAdapterOptions,
} from "./bluesky.js";
export { normalizeSubredditName } from "./reddit-subreddit.js";
export {
  RedditAdapter,
  REDDIT_FETCH_LIMIT,
  DEFAULT_REDDIT_USER_AGENT,
  type RedditConfig,
  type RedditAdapterOptions,
} from "./reddit.js";
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
