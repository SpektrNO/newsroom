import type { SourceAdapter, SourceType } from "./types.js";
import { StubSourceAdapter } from "./stub.js";
import { HackerNewsAdapter, type HackerNewsConfig } from "./hackernews.js";
import { SubstackAdapter, type SubstackConfig } from "./substack.js";
import { PodcastAdapter, type PodcastConfig } from "./podcast.js";

export type AdapterConfig = HackerNewsConfig &
  Partial<SubstackConfig> &
  Partial<PodcastConfig> & {
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
    case "bluesky":
      return new StubSourceAdapter("bluesky");
    default:
      return new StubSourceAdapter(sourceType);
  }
}
