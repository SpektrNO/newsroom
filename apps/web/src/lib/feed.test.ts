import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countMatchingFeedRows,
  decodeFeedCursor,
  encodeFeedCursor,
  escapeIlikePattern,
  parseFeedLimit,
  parseFeedSearchQuery,
  parseFeedSourceFilter,
  parseFeedStatusFilter,
  parseFeedTopicIds,
  passesSearchFilter,
  tokenizeFeedSearch,
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

  it("validates status filter", () => {
    assert.equal(parseFeedStatusFilter(null), null);
    assert.equal(parseFeedStatusFilter(""), null);
    assert.equal(parseFeedStatusFilter("saved"), "saved");
    assert.equal(parseFeedStatusFilter("seen"), "seen");
    assert.equal(parseFeedStatusFilter("new"), "new");
    assert.equal(parseFeedStatusFilter("dismissed"), "dismissed");
    assert.equal(parseFeedStatusFilter("archived"), "invalid");
  });

  it("parses multi topic ids from topic and topics params", () => {
    const url = new URL("http://localhost/api/feed?topic=a&topic=b&topics=c,b");
    assert.deepEqual(parseFeedTopicIds(url), ["a", "b", "c"]);
    assert.deepEqual(parseFeedTopicIds(new URL("http://localhost/api/feed")), []);
    assert.equal(
      parseFeedTopicIds(new URL("http://localhost/api/feed?topic=bad%20id")),
      "invalid",
    );
  });

  it("parses search query", () => {
    assert.equal(parseFeedSearchQuery(null), null);
    assert.equal(parseFeedSearchQuery("  "), null);
    assert.equal(parseFeedSearchQuery("  llm agents  "), "llm agents");
    assert.equal(parseFeedSearchQuery("x".repeat(201)), "invalid");
  });
});

describe("passesSearchFilter", () => {
  it("requires all tokens (AND) across title, summary, reason", () => {
    assert.equal(
      passesSearchFilter("Local LLM tools", "Postgres tips", null, "llm postgres"),
      true,
    );
    assert.equal(
      passesSearchFilter("Local LLM tools", null, "discusses agents", "llm agents"),
      true,
    );
    assert.equal(
      passesSearchFilter("Local LLM tools", null, null, "llm postgres"),
      false,
    );
  });
});

describe("tokenizeFeedSearch / escapeIlikePattern", () => {
  it("splits and lowercases tokens", () => {
    assert.deepEqual(tokenizeFeedSearch("  LLM   Agents "), ["llm", "agents"]);
    assert.deepEqual(tokenizeFeedSearch("   "), []);
  });

  it("escapes ILIKE wildcards", () => {
    assert.equal(escapeIlikePattern("100%_done"), "100\\%\\_done");
  });
});

describe("countMatchingFeedRows", () => {
  const rows = [
    {
      articleId: "1",
      title: "LLM tools",
      summary: null,
      reason: "Matches AI topic",
    },
    { articleId: "2", title: "Postgres tips", summary: null, reason: null },
    {
      articleId: "3",
      title: "LLM + Postgres",
      summary: null,
      reason: null,
    },
  ];

  it("counts all when no filters", () => {
    assert.equal(
      countMatchingFeedRows(rows, {
        topicKeywords: null,
        sourceFilter: null,
        searchQuery: null,
        sourceTypesByArticle: new Map(),
      }),
      3,
    );
  });

  it("applies topic keywords and source type", () => {
    const sources = new Map<string, Set<string>>([
      ["1", new Set(["hackernews"])],
      ["2", new Set(["substack"])],
      ["3", new Set(["hackernews"])],
    ]);
    assert.equal(
      countMatchingFeedRows(rows, {
        topicKeywords: ["llm"],
        sourceFilter: "hackernews",
        searchQuery: null,
        sourceTypesByArticle: sources,
      }),
      2,
    );
  });

  it("applies free-text search", () => {
    assert.equal(
      countMatchingFeedRows(rows, {
        topicKeywords: null,
        sourceFilter: null,
        searchQuery: "ai topic",
        sourceTypesByArticle: new Map(),
      }),
      1,
    );
  });
});
