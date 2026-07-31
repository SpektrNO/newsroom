/**
 * Curated source catalog (websites, newsletters, communities, podcasts, social).
 * Browser-safe — no Node-only imports.
 *
 * Intentionally a small starter set — not every topic-tree leaf. Users paste
 * arbitrary RSS / handles / subreddit names via Add a source for everything else.
 *
 * Catalog `category` is a Suggested-tab shelf id (may differ from persisted
 * subscription category — e.g. newsletters map to community or website on add).
 */

export type FeedCatalogCategory =
  | "websites"
  | "communities"
  | "newsletters"
  | "podcasts"
  | "social_media";

/** Ingest shape used when adding from the catalog. */
export type FeedCatalogKind = "feed" | "reddit" | "podcast" | "bluesky";

export type FeedCatalogEntry = {
  id: string;
  label: string;
  blurb: string;
  category: FeedCatalogCategory;
  /** Optional topic-tree leaf labels for display / filter. */
  topicTags: string[];
  /** Defaults to `feed` when omitted (legacy RSS rows). */
  kind?: FeedCatalogKind;
  /** Newsletter / blog / podcast RSS — required for feed & podcast. */
  rssUrl?: string;
  /** Subreddit without r/ — required when kind is `reddit`. */
  subreddit?: string;
  /** Bluesky handle — required when kind is `bluesky`. */
  handle?: string;
};

export type FeedCatalogResponse = {
  version: number;
  feeds: FeedCatalogEntry[];
};

export const FEED_CATALOG_VERSION = 4;

export const FEED_CATALOG_CATEGORIES: readonly {
  id: FeedCatalogCategory;
  label: string;
}[] = [
  { id: "websites", label: "Websites" },
  { id: "communities", label: "Communities" },
  { id: "newsletters", label: "Newsletters" },
  { id: "podcasts", label: "Podcasts" },
  { id: "social_media", label: "Social" },
];

/**
 * Editorial starter set — public RSS, subreddits, podcasts, and Bluesky
 * spanning tech, science, security, and culture leaves from the topic tree.
 */
export const FEED_CATALOG: readonly FeedCatalogEntry[] = [
  // --- Newsletters ---
  {
    id: "platformer",
    category: "newsletters",
    label: "Platformer",
    rssUrl: "https://www.platformer.news/feed",
    blurb: "Casey Newton on platforms, policy, and the information business.",
    topicTags: ["AI & infra", "Security & privacy", "Policy & rules"],
  },
  {
    id: "import-ai",
    category: "newsletters",
    label: "Import AI",
    rssUrl: "https://importai.substack.com/feed",
    blurb: "Jack Clark’s weekly AI research and industry roundup.",
    topicTags: ["AI & infra", "LLMs & agents"],
  },
  {
    id: "latent-space",
    category: "newsletters",
    label: "Latent Space",
    rssUrl: "https://www.latent.space/feed",
    blurb: "AI engineers — agents, evals, and production LLM systems.",
    topicTags: ["LLMs & agents", "AI & infra", "Evals & safety"],
  },
  {
    id: "pragmatic-engineer",
    category: "newsletters",
    label: "The Pragmatic Engineer",
    rssUrl: "https://newsletter.pragmaticengineer.com/feed",
    blurb: "Gergely Orosz on software engineering careers and big tech.",
    topicTags: ["Developer tools", "Cloud & devops", "Work & leadership"],
  },
  {
    id: "bytes",
    category: "newsletters",
    label: "Bytes",
    rssUrl: "https://bytes.dev/feed",
    blurb: "JavaScript / web engineering newsletter.",
    topicTags: ["Languages & runtimes", "Developer tools"],
  },
  {
    id: "tldr",
    category: "newsletters",
    label: "TLDR",
    rssUrl: "https://tldr.tech/rss",
    blurb: "Daily tech headlines in a short digest.",
    topicTags: ["AI & infra", "Cloud & devops"],
  },
  {
    id: "gary-marcus",
    category: "newsletters",
    label: "Gary Marcus",
    rssUrl: "https://garymarcus.substack.com/feed",
    blurb: "Critical takes on AI hype and cognition.",
    topicTags: ["LLMs & agents", "Evals & safety", "Neuroscience & mind"],
  },
  {
    id: "not-boring",
    category: "newsletters",
    label: "Not Boring",
    rssUrl: "https://www.notboring.co/feed",
    blurb: "Packy McCormick on startups, markets, and technology.",
    topicTags: ["Funding & markets", "Product & growth"],
  },
  {
    id: "dense-discovery",
    category: "newsletters",
    label: "Dense Discovery",
    rssUrl: "https://www.densediscovery.com/feed",
    blurb: "Weekly design, tech, and culture links.",
    topicTags: ["Design & media", "Philosophy & ideas"],
  },
  {
    id: "sidebar",
    category: "newsletters",
    label: "Sidebar",
    rssUrl: "https://sidebar.io/feed.xml",
    blurb: "Daily design links for the web.",
    topicTags: ["Design & media"],
  },
  // --- Websites ---
  {
    id: "simonwillison",
    category: "websites",
    label: "Simon Willison’s Weblog",
    rssUrl: "https://simonwillison.net/atom/everything/",
    blurb: "Datasette, LLMs, and practical software notes.",
    topicTags: ["LLMs & agents", "Developer tools", "Databases & storage"],
  },
  {
    id: "ben-evans",
    category: "websites",
    label: "Benedict Evans",
    rssUrl: "https://www.ben-evans.com/benedictevans?format=rss",
    blurb: "Essays on tech strategy and markets.",
    topicTags: ["AI & infra", "Funding & markets"],
  },
  {
    id: "stratechery",
    category: "websites",
    label: "Stratechery",
    rssUrl: "https://stratechery.com/feed/",
    blurb: "Ben Thompson on strategy and the internet (RSS may be partial).",
    topicTags: ["AI & infra", "Funding & markets", "Product & growth"],
  },
  {
    id: "schneier",
    category: "websites",
    label: "Schneier on Security",
    rssUrl: "https://www.schneier.com/feed/atom/",
    blurb: "Bruce Schneier on security, privacy, and trust.",
    topicTags: ["Security & privacy", "Policy & rules"],
  },
  {
    id: "krebs",
    category: "websites",
    label: "Krebs on Security",
    rssUrl: "https://krebsonsecurity.com/feed/",
    blurb: "Investigative reporting on breaches and cybercrime.",
    topicTags: ["Security & privacy"],
  },
  {
    id: "lwn",
    category: "websites",
    label: "LWN.net",
    rssUrl: "https://lwn.net/headlines/rss",
    blurb: "Linux and free-software news for developers.",
    topicTags: ["Open source", "Languages & runtimes", "Cloud & devops"],
  },
  {
    id: "carbon-brief",
    category: "websites",
    label: "Carbon Brief",
    rssUrl: "https://www.carbonbrief.org/feed",
    blurb: "Clear climate science and energy policy explainers.",
    topicTags: ["Climate & energy", "Policy & rules"],
  },
  {
    id: "nasa-breaking",
    category: "websites",
    label: "NASA Breaking News",
    rssUrl: "https://www.nasa.gov/rss/dyn/breaking_news.rss",
    blurb: "Official NASA headlines — spaceflight and exploration.",
    topicTags: ["Space & matter"],
  },
  {
    id: "aeon",
    category: "websites",
    label: "Aeon",
    rssUrl: "https://aeon.co/feed.rss",
    blurb: "Long-form ideas on philosophy, science, and culture.",
    topicTags: ["Philosophy & ideas", "Neuroscience & mind"],
  },
  {
    id: "works-in-progress",
    category: "websites",
    label: "Works in Progress",
    rssUrl: "https://worksinprogress.co/feed/",
    blurb: "Deep essays on science, technology, and human progress.",
    topicTags: ["Biology & health", "Physics & mathematics", "Climate & energy"],
  },
  {
    id: "marginal-revolution",
    category: "websites",
    label: "Marginal Revolution",
    rssUrl: "https://marginalrevolution.com/feed",
    blurb: "Tyler Cowen and Alex Tabarrok on economics and ideas.",
    topicTags: ["Funding & markets", "Philosophy & ideas", "History & archives"],
  },
  {
    id: "semianalysis",
    category: "websites",
    label: "SemiAnalysis",
    rssUrl: "https://www.semianalysis.com/feed",
    blurb: "Chips, AI infra, and semiconductor industry analysis.",
    topicTags: ["Hardware & chips", "AI & infra"],
  },
  // --- Communities (Reddit) ---
  {
    id: "reddit-machinelearning",
    category: "communities",
    kind: "reddit",
    label: "r/MachineLearning",
    subreddit: "machinelearning",
    blurb: "Research papers, models, and ML engineering discussion.",
    topicTags: ["LLMs & agents", "MLOps & data", "AI & infra"],
  },
  {
    id: "reddit-localllama",
    category: "communities",
    kind: "reddit",
    label: "r/LocalLLaMA",
    subreddit: "localllama",
    blurb: "Running and fine-tuning open LLMs locally.",
    topicTags: ["LLMs & agents", "Open source", "Hardware & chips"],
  },
  {
    id: "reddit-programming",
    category: "communities",
    kind: "reddit",
    label: "r/programming",
    subreddit: "programming",
    blurb: "Broad software engineering news and discussion.",
    topicTags: ["Developer tools", "Languages & runtimes", "Open source"],
  },
  {
    id: "reddit-rust",
    category: "communities",
    kind: "reddit",
    label: "r/rust",
    subreddit: "rust",
    blurb: "Rust language news, crates, and community Q&A.",
    topicTags: ["Languages & runtimes", "Open source"],
  },
  {
    id: "reddit-netsec",
    category: "communities",
    kind: "reddit",
    label: "r/netsec",
    subreddit: "netsec",
    blurb: "Network security research and vulnerability write-ups.",
    topicTags: ["Security & privacy"],
  },
  {
    id: "reddit-spacex",
    category: "communities",
    kind: "reddit",
    label: "r/space",
    subreddit: "space",
    blurb: "Spaceflight, astronomy, and exploration news.",
    topicTags: ["Space & matter"],
  },
  {
    id: "reddit-climate",
    category: "communities",
    kind: "reddit",
    label: "r/climate",
    subreddit: "climate",
    blurb: "Climate science and energy transition discussion.",
    topicTags: ["Climate & energy", "Policy & rules"],
  },
  {
    id: "reddit-webdev",
    category: "communities",
    kind: "reddit",
    label: "r/webdev",
    subreddit: "webdev",
    blurb: "Frontend/backend web development links and advice.",
    topicTags: ["Developer tools", "Languages & runtimes", "Design & media"],
  },
  // --- Podcasts ---
  {
    id: "podcast-atp",
    category: "podcasts",
    kind: "podcast",
    label: "Accidental Tech Podcast",
    rssUrl: "https://atp.fm/episodes?format=rss",
    blurb: "Marco, Casey, and John on Apple, tech, and the web.",
    topicTags: ["Developer tools", "Product & growth"],
  },
  {
    id: "podcast-changelog",
    category: "podcasts",
    kind: "podcast",
    label: "The Changelog",
    rssUrl: "https://changelog.com/podcast/feed",
    blurb: "Conversations with the hackers, leaders, and innovators of software.",
    topicTags: ["Open source", "Developer tools", "Languages & runtimes"],
  },
  {
    id: "podcast-darknet",
    category: "podcasts",
    kind: "podcast",
    label: "Darknet Diaries",
    rssUrl: "https://feeds.megaphone.fm/darknetdiaries",
    blurb: "True stories from the dark side of the Internet.",
    topicTags: ["Security & privacy"],
  },
  {
    id: "podcast-acquired",
    category: "podcasts",
    kind: "podcast",
    label: "Acquired",
    rssUrl: "https://feeds.transistor.fm/acquired",
    blurb: "Company histories and tech industry deep dives.",
    topicTags: ["Funding & markets", "Product & growth"],
  },
  {
    id: "podcast-latent-space",
    category: "podcasts",
    kind: "podcast",
    label: "Latent Space Podcast",
    rssUrl: "https://api.substack.com/feed/podcast/10845.rss",
    blurb: "AI engineers talking agents, evals, and production LLM systems.",
    topicTags: ["LLMs & agents", "AI & infra", "Evals & safety"],
  },
  // --- Social (Bluesky) ---
  {
    id: "bsky-jay",
    category: "social_media",
    kind: "bluesky",
    label: "Jay Graber",
    handle: "jay.bsky.social",
    blurb: "CEO of Bluesky — protocol and product updates.",
    topicTags: ["AI & infra", "Policy & rules"],
  },
  {
    id: "bsky-simonwillison",
    category: "social_media",
    kind: "bluesky",
    label: "Simon Willison",
    handle: "simonwillison.net",
    blurb: "Datasette, LLMs, and practical software notes on Bluesky.",
    topicTags: ["LLMs & agents", "Developer tools"],
  },
  {
    id: "bsky-bsky",
    category: "social_media",
    kind: "bluesky",
    label: "Bluesky",
    handle: "bsky.app",
    blurb: "Official Bluesky account.",
    topicTags: ["Product & growth", "Policy & rules"],
  },
  {
    id: "bsky-pfrazee",
    category: "social_media",
    kind: "bluesky",
    label: "Paul Frazee",
    handle: "pfrazee.com",
    blurb: "AT Protocol and Bluesky client engineering.",
    topicTags: ["Developer tools", "Open source"],
  },
];

export function catalogEntryKind(entry: FeedCatalogEntry): FeedCatalogKind {
  if (entry.kind === "reddit") return "reddit";
  if (entry.kind === "podcast") return "podcast";
  if (entry.kind === "bluesky") return "bluesky";
  return "feed";
}

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
