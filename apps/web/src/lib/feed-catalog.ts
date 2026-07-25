/**
 * Curated RSS / newsletter feed catalog (v1).
 * Browser-safe — no Node-only imports.
 */

export type FeedCatalogEntry = {
  id: string;
  label: string;
  rssUrl: string;
  blurb: string;
  /** Optional topic-tree leaf labels for display / filter. */
  topicTags: string[];
};

export type FeedCatalogResponse = {
  version: number;
  feeds: FeedCatalogEntry[];
};

export const FEED_CATALOG_VERSION = 1;

/**
 * Editorial starter set — public RSS endpoints commonly used for tech newsletters.
 * Users can still paste arbitrary URLs via Add feed.
 */
export const FEED_CATALOG: readonly FeedCatalogEntry[] = [
  {
    id: "platformer",
    label: "Platformer",
    rssUrl: "https://www.platformer.news/feed",
    blurb: "Casey Newton on platforms, policy, and the information business.",
    topicTags: ["AI & infra", "Security & privacy"],
  },
  {
    id: "import-ai",
    label: "Import AI",
    rssUrl: "https://importai.substack.com/feed",
    blurb: "Jack Clark’s weekly AI research and industry roundup.",
    topicTags: ["AI & infra", "LLMs & agents"],
  },
  {
    id: "latent-space",
    label: "Latent Space",
    rssUrl: "https://www.latent.space/feed",
    blurb: "AI engineers — agents, evals, and production LLM systems.",
    topicTags: ["LLMs & agents", "AI & infra"],
  },
  {
    id: "pragmatic-engineer",
    label: "The Pragmatic Engineer",
    rssUrl: "https://newsletter.pragmaticengineer.com/feed",
    blurb: "Gergely Orosz on software engineering careers and big tech.",
    topicTags: ["Developer tools", "Cloud & devops"],
  },
  {
    id: "simonwillison",
    label: "Simon Willison’s Weblog",
    rssUrl: "https://simonwillison.net/atom/everything/",
    blurb: "Datasette, LLMs, and practical software notes.",
    topicTags: ["LLMs & agents", "Developer tools", "Databases & storage"],
  },
  {
    id: "bytes",
    label: "Bytes",
    rssUrl: "https://bytes.dev/feed",
    blurb: "JavaScript / web engineering newsletter.",
    topicTags: ["Languages & runtimes", "Developer tools"],
  },
  {
    id: "tldr",
    label: "TLDR",
    rssUrl: "https://tldr.tech/rss",
    blurb: "Daily tech headlines in a short digest.",
    topicTags: ["AI & infra", "Cloud & devops"],
  },
  {
    id: "ben-evans",
    label: "Benedict Evans",
    rssUrl: "https://www.ben-evans.com/benedictevans?format=rss",
    blurb: "Essays on tech strategy and markets.",
    topicTags: ["AI & infra"],
  },
  {
    id: "gary-marcus",
    label: "Gary Marcus",
    rssUrl: "https://garymarcus.substack.com/feed",
    blurb: "Critical takes on AI hype and cognition.",
    topicTags: ["LLMs & agents", "Evals & safety"],
  },
  {
    id: "stratechery",
    label: "Stratechery",
    rssUrl: "https://stratechery.com/feed/",
    blurb: "Ben Thompson on strategy and the internet (RSS may be partial).",
    topicTags: ["AI & infra"],
  },
];

export function getFeedCatalog(): FeedCatalogResponse {
  return {
    version: FEED_CATALOG_VERSION,
    feeds: [...FEED_CATALOG],
  };
}

/** Collect unique topic tags present in the catalog (sorted). */
export function listCatalogTopicTags(
  feeds: ReadonlyArray<FeedCatalogEntry> = FEED_CATALOG,
): string[] {
  const set = new Set<string>();
  for (const feed of feeds) {
    for (const tag of feed.topicTags) {
      const t = tag.trim();
      if (t) set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
