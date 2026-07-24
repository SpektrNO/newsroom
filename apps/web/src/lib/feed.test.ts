import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  parseFeedLimit,
  parseFeedSourceFilter,
} from "./feed.js";

describe("feed cursor", () => {
  it("round-trips opaque cursor", () => {
    const encoded = encodeFeedCursor({ finalRank: 0.75, articleId: "abc" });
    assert.deepEqual(decodeFeedCursor(encoded), {
      finalRank: 0.75,
      articleId: "abc",
    });
  });

  it("rejects bad cursor", () => {
    assert.equal(decodeFeedCursor("not-base64"), null);
  });
});

describe("feed query parsers", () => {
  it("clamps limit", () => {
    assert.equal(parseFeedLimit(null), 20);
    assert.equal(parseFeedLimit("100"), 50);
    assert.equal(parseFeedLimit("3"), 3);
  });

  it("validates source filter", () => {
    assert.equal(parseFeedSourceFilter("hackernews"), "hackernews");
    assert.equal(parseFeedSourceFilter("nope"), "invalid");
    assert.equal(parseFeedSourceFilter(null), null);
  });
});
