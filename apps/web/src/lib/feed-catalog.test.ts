import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEED_CATALOG,
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
    assert.equal(catalog.version, 2);
    assert.ok(catalog.feeds.length >= 5);
    for (const feed of catalog.feeds) {
      assert.ok(feed.id);
      assert.ok(feed.label);
      assert.ok(Array.isArray(feed.topicTags));
      if (catalogEntryKind(feed) === "reddit") {
        assert.ok(feed.subreddit);
      } else {
        assert.ok(feed.rssUrl?.startsWith("http"));
      }
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
        sourceType: "substack",
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
        sourceType: "podcast",
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
        [{ sourceType: "hackernews", config: {} }],
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
        [{ sourceType: "reddit", config: { subreddit: "Programming" } }],
        entry,
      ),
      true,
    );
    assert.equal(
      isCatalogEntryAlreadyAdded(
        [{ sourceType: "reddit", config: { subreddit: "rust" } }],
        entry,
      ),
      false,
    );
  });
});

describe("tryNormalizeRssUrl", () => {
  it("returns null for invalid URLs", () => {
    assert.equal(tryNormalizeRssUrl("not-a-url"), null);
  });
});
