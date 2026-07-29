import type { SourceAdapter, SourceType } from "./types.js";
import { StubSourceAdapter } from "./stub.js";
import { HackerNewsAdapter, type HackerNewsConfig } from "./hackernews.js";
import { SubstackAdapter, type SubstackConfig } from "./substack.js";
import { PodcastAdapter, type PodcastConfig } from "./podcast.js";
import { BlueskyAdapter, type BlueskyConfig } from "./bluesky.js";

export type AdapterConfig = HackerNewsConfig &
  Partial<SubstackConfig> &
  Partial<PodcastConfig> &
  Partial<BlueskyConfig> & {
    [key: string]: unknown;
  };

export type CreateAdapterOptions = {
  fetch?: typeof fetch;
  hnLimit?: number;
};

export function createSourceAdapter(
  sourceType: SourceType,
  config: AdapterConfig = {},
  options: CreateAdapterOptions = {},
): SourceAdapter {
  switch (sourceType) {
    case "hackernews":
      return new HackerNewsAdapter(
        { mode: config.mode === "new" ? "new" : "top" },
        { fetch: options.fetch, limit: options.hnLimit },
      );
    case "substack": {
      const rssUrl = typeof config.rssUrl === "string" ? config.rssUrl : "";
      return new SubstackAdapter({ rssUrl }, { fetch: options.fetch });
    }
    case "podcast": {
      const rssUrl = typeof config.rssUrl === "string" ? config.rssUrl : "";
      return new PodcastAdapter({ rssUrl }, { fetch: options.fetch });
    }
    case "bluesky": {
      const handle = typeof config.handle === "string" ? config.handle : "";
      const did = typeof config.did === "string" ? config.did : undefined;
      return new BlueskyAdapter({ handle, did }, { fetch: options.fetch });
    }
    default:
      return new StubSourceAdapter(sourceType);
  }
}
