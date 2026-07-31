import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FEED_PREFS,
  pruneTopicIds,
  readStoredFeedPrefs,
  writeStoredFeedPrefs,
} from "./feed-prefs.js";

describe("feed-prefs", () => {
  it("returns defaults when localStorage is empty", () => {
    const store = new Map<string, string>();
    const g = globalThis as typeof globalThis & { localStorage?: Storage };
    const prev = g.localStorage;
    g.localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
    try {
      assert.deepEqual(readStoredFeedPrefs(), DEFAULT_FEED_PREFS);
      writeStoredFeedPrefs({
        view: "saved",
        sort: "date",
        order: "asc",
        sources: ["podcast", "community", "podcast"],
        topicIds: ["a", "b", "a"],
        topicsOpen: false,
      });
      assert.deepEqual(readStoredFeedPrefs(), {
        view: "saved",
        sort: "date",
        order: "asc",
        sources: ["podcast", "community"],
        topicIds: ["a", "b"],
        topicsOpen: false,
      });
    } finally {
      g.localStorage = prev;
    }
  });

  it("prunes topic ids not in the valid set", () => {
    assert.deepEqual(pruneTopicIds(["a", "gone", "b"], ["a", "b"]), [
      "a",
      "b",
    ]);
  });

  it("rejects invalid view/sort/source values", () => {
    const store = new Map<string, string>();
    const g = globalThis as typeof globalThis & { localStorage?: Storage };
    const prev = g.localStorage;
    g.localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
    try {
      store.set(
        "newsroom.feed.prefs",
        JSON.stringify({
          view: "nope",
          sort: "rank",
          order: "sideways",
          sources: ["twitter", "social_media", "bluesky"],
          topicIds: [1, "ok"],
          topicsOpen: "yes",
        }),
      );
      assert.deepEqual(readStoredFeedPrefs(), {
        view: "feed",
        sort: "score",
        order: "desc",
        sources: ["social_media"],
        topicIds: ["ok"],
        topicsOpen: true,
      });
    } finally {
      g.localStorage = prev;
    }
  });
});
