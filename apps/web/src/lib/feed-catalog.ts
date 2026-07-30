/**
 * Curated RSS / newsletter feed catalog (v1).
 * Browser-safe — no Node-only imports.
 *
 * Intentionally a small starter set — not every topic-tree leaf. Users paste
 * arbitrary RSS via Add a source for everything else.
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
 * Editorial starter set — public RSS endpoints spanning tech, science,
 * security, and culture leaves from the topic tree.
 */
export const FEED_CATALOG: readonly FeedCatalogEntry[] = [
  {
    id: "platformer",
    label: "Platformer",
    rssUrl: "https://www.platformer.news/feed",
    blurb: "Casey Newton on platforms, policy, and the information business.",
    topicTags: ["AI & infra", "Security & privacy", "Policy & rules"],
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
    topicTags: ["LLMs & agents", "AI & infra", "Evals & safety"],
  },
  {
    id: "pragmatic-engineer",
    label: "The Pragmatic Engineer",
    rssUrl: "https://newsletter.pragmaticengineer.com/feed",
    blurb: "Gergely Orosz on software engineering careers and big tech.",
    topicTags: ["Developer tools", "Cloud & devops", "Work & leadership"],
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
    topicTags: ["AI & infra", "Funding & markets"],
  },
  {
    id: "gary-marcus",
    label: "Gary Marcus",
    rssUrl: "https://garymarcus.substack.com/feed",
    blurb: "Critical takes on AI hype and cognition.",
    topicTags: ["LLMs & agents", "Evals & safety", "Neuroscience & mind"],
  },
  {
    id: "stratechery",
    label: "Stratechery",
    rssUrl: "https://stratechery.com/feed/",
    blurb: "Ben Thompson on strategy and the internet (RSS may be partial).",
    topicTags: ["AI & infra", "Funding & markets", "Product & growth"],
  },
  {
    id: "schneier",
    label: "Schneier on Security",
    rssUrl: "https://www.schneier.com/feed/atom/",
    blurb: "Bruce Schneier on security, privacy, and trust.",
    topicTags: ["Security & privacy", "Policy & rules"],
  },
  {
    id: "krebs",
    label: "Krebs on Security",
    rssUrl: "https://krebsonsecurity.com/feed/",
    blurb: "Investigative reporting on breaches and cybercrime.",
    topicTags: ["Security & privacy"],
  },
  {
    id: "lwn",
    label: "LWN.net",
    rssUrl: "https://lwn.net/headlines/rss",
    blurb: "Linux and free-software news for developers.",
    topicTags: ["Open source", "Languages & runtimes", "Cloud & devops"],
  },
  {
    id: "carbon-brief",
    label: "Carbon Brief",
    rssUrl: "https://www.carbonbrief.org/feed",
    blurb: "Clear climate science and energy policy explainers.",
    topicTags: ["Climate & energy", "Policy & rules"],
  },
  {
    id: "nasa-breaking",
    label: "NASA Breaking News",
    rssUrl: "https://www.nasa.gov/rss/dyn/breaking_news.rss",
    blurb: "Official NASA headlines — spaceflight and exploration.",
    topicTags: ["Space & matter"],
  },
  {
    id: "aeon",
    label: "Aeon",
    rssUrl: "https://aeon.co/feed.rss",
    blurb: "Long-form ideas on philosophy, science, and culture.",
    topicTags: ["Philosophy & ideas", "Neuroscience & mind"],
  },
  {
    id: "works-in-progress",
    label: "Works in Progress",
    rssUrl: "https://worksinprogress.co/feed/",
    blurb: "Deep essays on science, technology, and human progress.",
    topicTags: ["Biology & health", "Physics & mathematics", "Climate & energy"],
  },
  {
    id: "not-boring",
    label: "Not Boring",
    rssUrl: "https://www.notboring.co/feed",
    blurb: "Packy McCormick on startups, markets, and technology.",
    topicTags: ["Funding & markets", "Product & growth"],
  },
  {
    id: "sidebar",
    label: "Sidebar",
    rssUrl: "https://sidebar.io/feed.xml",
    blurb: "Daily design links for the web.",
    topicTags: ["Design & media"],
  },
  {
    id: "marginal-revolution",
    label: "Marginal Revolution",
    rssUrl: "https://marginalrevolution.com/feed",
    blurb: "Tyler Cowen and Alex Tabarrok on economics and ideas.",
    topicTags: ["Funding & markets", "Philosophy & ideas", "History & archives"],
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
