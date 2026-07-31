import type {
  SourceAdapter,
  SourceAdapterId,
  SourceCategory,
} from "./types.js";
import { StubSourceAdapter } from "./stub.js";
import { HackerNewsAdapter, type HackerNewsConfig } from "./hackernews.js";
import { RssAdapter, type RssConfig } from "./substack.js";
import { PodcastAdapter, type PodcastConfig } from "./podcast.js";
import { BlueskyAdapter, type BlueskyConfig } from "./bluesky.js";
import { RedditAdapter, type RedditConfig } from "./reddit.js";

export type AdapterConfig = HackerNewsConfig &
  Partial<RssConfig> &
  Partial<PodcastConfig> &
  Partial<BlueskyConfig> &
  Partial<RedditConfig> & {
    [key: string]: unknown;
  };

export type CreateAdapterOptions = {
  fetch?: typeof fetch;
  hnLimit?: number;
  /** When adapter is rss, podcast category selects enclosure-aware parsing. */
  category?: SourceCategory;
};

export function createSourceAdapter(
  adapter: SourceAdapterId,
  config: AdapterConfig = {},
  options: CreateAdapterOptions = {},
): SourceAdapter {
  switch (adapter) {
    case "hackernews":
      return new HackerNewsAdapter(
        { mode: config.mode === "new" ? "new" : "top" },
        { fetch: options.fetch, limit: options.hnLimit },
      );
    case "rss": {
      const rssUrl = typeof config.rssUrl === "string" ? config.rssUrl : "";
      if (options.category === "podcast") {
        return new PodcastAdapter({ rssUrl }, { fetch: options.fetch });
      }
      return new RssAdapter({ rssUrl }, { fetch: options.fetch });
    }
    case "bluesky": {
      const handle = typeof config.handle === "string" ? config.handle : "";
      const did = typeof config.did === "string" ? config.did : undefined;
      return new BlueskyAdapter({ handle, did }, { fetch: options.fetch });
    }
    case "reddit": {
      const subreddit =
        typeof config.subreddit === "string" ? config.subreddit : "";
      return new RedditAdapter({ subreddit }, { fetch: options.fetch });
    }
    default:
      return new StubSourceAdapter(adapter);
  }
}
