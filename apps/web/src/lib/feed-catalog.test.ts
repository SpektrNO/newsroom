import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEED_CATALOG,
  getFeedCatalog,
  listCatalogTopicTags,
} from "./feed-catalog.js";
import {
  isFeedAlreadyAdded,
  tryNormalizeRssUrl,
} from "./feed-catalog-match.js";

describe("getFeedCatalog", () => {
  it("returns versioned feeds with required fields", () => {
    const catalog = getFeedCatalog();
    assert.equal(catalog.version, 1);
    assert.ok(catalog.feeds.length >= 5);
    for (const feed of catalog.feeds) {
      assert.ok(feed.id);
      assert.ok(feed.label);
      assert.ok(feed.rssUrl.startsWith("http"));
      assert.ok(Array.isArray(feed.topicTags));
    }
  });
});

describe("listCatalogTopicTags", () => {
  it("dedupes and sorts tags", () => {
    const tags = listCatalogTopicTags(FEED_CATALOG);
    assert.ok(tags.includes("LLMs & agents"));
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

  it("ignores non-substack sources", () => {
    assert.equal(
      isFeedAlreadyAdded(
        [{ sourceType: "hackernews", config: {} }],
        "https://www.platformer.news/feed",
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
