import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEED_CATALOG,
  FEED_CATALOG_CATEGORIES,
  catalogEntryKind,
  getFeedCatalog,
  listCatalogTopicTags,
} from "./feed-catalog.js";
import {
  isCatalogEntryAlreadyAdded,
  isFeedAlreadyAdded,
  tryNormalizeRssUrl,
} from "./feed-catalog-match.js";

describe("getFeedCatalog", () => {
  it("returns versioned feeds with required fields per kind", () => {
    const catalog = getFeedCatalog();
    assert.equal(catalog.version, 4);
    assert.ok(catalog.feeds.length >= 5);
    for (const feed of catalog.feeds) {
      assert.ok(feed.id);
      assert.ok(feed.label);
      assert.ok(feed.category);
      assert.ok(
        FEED_CATALOG_CATEGORIES.some((c) => c.id === feed.category),
        `unknown category ${feed.category}`,
      );
      assert.ok(Array.isArray(feed.topicTags));
      const kind = catalogEntryKind(feed);
      if (kind === "reddit") {
        assert.ok(feed.subreddit);
      } else if (kind === "bluesky") {
        assert.ok(feed.handle);
      } else {
        assert.ok(feed.rssUrl?.startsWith("http"));
      }
    }
  });

  it("covers every suggested category", () => {
    for (const { id } of FEED_CATALOG_CATEGORIES) {
      assert.ok(
        FEED_CATALOG.some((f) => f.category === id),
        `missing category ${id}`,
      );
    }
  });

  it("includes curated subreddit entries", () => {
    const reddit = FEED_CATALOG.filter((f) => catalogEntryKind(f) === "reddit");
    assert.ok(reddit.length >= 5);
    assert.ok(reddit.some((f) => f.subreddit === "machinelearning"));
  });
});

describe("listCatalogTopicTags", () => {
  it("dedupes and sorts tags across domains", () => {
    const tags = listCatalogTopicTags(FEED_CATALOG);
    assert.ok(tags.includes("LLMs & agents"));
    assert.ok(tags.includes("Climate & energy"));
    assert.ok(tags.includes("Design & media"));
    assert.deepEqual(tags, [...tags].sort((a, b) => a.localeCompare(b)));
  });
});

describe("isFeedAlreadyAdded", () => {
  it("matches normalized RSS URLs", () => {
    const sources = [
      {
        adapter: "rss",
        config: { rssUrl: "https://www.platformer.news/feed/" },
      },
    ];
    assert.equal(
      isFeedAlreadyAdded(sources, "https://www.platformer.news/feed"),
      true,
    );
    assert.equal(
      isFeedAlreadyAdded(sources, "https://importai.substack.com/feed"),
      false,
    );
  });

  it("matches podcast RSS the same way", () => {
    const sources = [
      {
        adapter: "rss",
        config: { rssUrl: "https://www.platformer.news/feed/" },
      },
    ];
    assert.equal(
      isFeedAlreadyAdded(sources, "https://www.platformer.news/feed"),
      true,
    );
  });

  it("ignores non-RSS sources", () => {
    assert.equal(
      isFeedAlreadyAdded(
        [{ adapter: "hackernews", config: {} }],
        "https://www.platformer.news/feed",
      ),
      false,
    );
  });
});

describe("isCatalogEntryAlreadyAdded", () => {
  it("matches reddit subreddits case-insensitively", () => {
    const entry = FEED_CATALOG.find((f) => f.id === "reddit-programming")!;
    assert.equal(
      isCatalogEntryAlreadyAdded(
        [{ adapter: "reddit", config: { subreddit: "Programming" } }],
        entry,
      ),
      true,
    );
    assert.equal(
      isCatalogEntryAlreadyAdded(
        [{ adapter: "reddit", config: { subreddit: "rust" } }],
        entry,
      ),
      false,
    );
  });

  it("matches bluesky handles case-insensitively", () => {
    const entry = FEED_CATALOG.find((f) => f.id === "bsky-jay")!;
    assert.equal(
      isCatalogEntryAlreadyAdded(
        [{ adapter: "bluesky", config: { handle: "@Jay.Bsky.Social" } }],
        entry,
      ),
      true,
    );
    assert.equal(
      isCatalogEntryAlreadyAdded(
        [{ adapter: "bluesky", config: { handle: "bsky.app" } }],
        entry,
      ),
      false,
    );
  });

  it("matches podcast catalog rows via RSS", () => {
    const entry = FEED_CATALOG.find((f) => f.id === "podcast-changelog")!;
    assert.equal(
      isCatalogEntryAlreadyAdded(
        [
          {
            adapter: "rss",
            config: { rssUrl: entry.rssUrl! },
          },
        ],
        entry,
      ),
      true,
    );
  });
});

describe("tryNormalizeRssUrl", () => {
  it("returns null for invalid URLs", () => {
    assert.equal(tryNormalizeRssUrl("not-a-url"), null);
  });
});
