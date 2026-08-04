import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countMatchingFeedRows,
  decodeFeedCursor,
  encodeFeedCursor,
  escapeIlikePattern,
  feedCursorFromRow,
  feedMaxAgeCutoff,
  FEED_MAX_AGE_DAYS,
  matchesTopicIds,
  parseFeedLimit,
  parseFeedOrder,
  parseFeedSearchQuery,
  parseFeedSort,
  parseFeedSourceFilter,
  parseFeedSourceFilters,
  parseFeedSourceId,
  parseFeedStatusFilter,
  parseFeedTopicIds,
  parseFeedExcludeTopicIds,
  parseFeedSearchTokens,
  passesSearchFilter,
  passesSourceFilter,
  passesTopicSelection,
  splitFeedReason,
  feedSourceSubscriptionLabel,
  feedSourceTypeLabel,
  formatTopicMembership,
  tokenizeFeedSearch,
  formatEpisodeDuration,
} from "./feed.js";

describe("feed cursor", () => {
  it("round-trips opaque cursor", () => {
    const encoded = encodeFeedCursor({
      sort: "score",
      order: "desc",
      key: 0.75,
      articleId: "abc",
    });
    assert.deepEqual(decodeFeedCursor(encoded), {
      sort: "score",
      order: "desc",
      key: 0.75,
      articleId: "abc",
    });
  });

  it("accepts legacy score cursors as score/desc", () => {
    const legacy = Buffer.from(
      JSON.stringify({ finalRank: 0.5, articleId: "x" }),
      "utf8",
    ).toString("base64url");
    assert.deepEqual(decodeFeedCursor(legacy), {
      sort: "score",
      order: "desc",
      key: 0.5,
      articleId: "x",
    });
  });

  it("builds date cursors including null publish times", () => {
    assert.deepEqual(
      feedCursorFromRow(
        {
          articleId: "a1",
          finalRank: 0.1,
          publishedAt: new Date("2024-01-15T12:00:00.000Z"),
        },
        "date",
        "asc",
      ),
      {
        sort: "date",
        order: "asc",
        key: Date.parse("2024-01-15T12:00:00.000Z"),
        articleId: "a1",
      },
    );
    assert.deepEqual(
      feedCursorFromRow(
        { articleId: "a2", finalRank: 0.2, publishedAt: null },
        "date",
        "desc",
      ),
      { sort: "date", order: "desc", key: null, articleId: "a2" },
    );
  });

  it("rejects bad cursor", () => {
    assert.equal(decodeFeedCursor("not-base64"), null);
  });
});

describe("feed query params", () => {
  it("parses sort and order", () => {
    assert.equal(parseFeedSort(null), "score");
    assert.equal(parseFeedSort("date"), "date");
    assert.equal(parseFeedSort("nope"), "invalid");
    assert.equal(parseFeedOrder(null), "desc");
    assert.equal(parseFeedOrder("asc"), "asc");
    assert.equal(parseFeedOrder("up"), "invalid");
  });

  it("uses ARTICLE_TTL_DAYS as the feed age window", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    const seven = feedMaxAgeCutoff(now, {
      ARTICLE_TTL_DAYS: "7",
    } as unknown as NodeJS.ProcessEnv);
    assert.ok(seven);
    assert.equal(
      seven!.toISOString(),
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
    assert.equal(
      feedMaxAgeCutoff(now, {
        ARTICLE_TTL_DAYS: "0",
      } as unknown as NodeJS.ProcessEnv),
      null,
    );
    // Default when unset matches article retention default (90).
    assert.equal(FEED_MAX_AGE_DAYS, 90);
    const def = feedMaxAgeCutoff(now, {} as unknown as NodeJS.ProcessEnv);
    assert.ok(def);
    assert.equal(
      def!.toISOString(),
      new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });
});

describe("feed query parsers", () => {
  it("clamps limit", () => {
    assert.equal(parseFeedLimit(null), 20);
    assert.equal(parseFeedLimit("100"), 50);
    assert.equal(parseFeedLimit("3"), 3);
  });

  it("validates source filter", () => {
    assert.equal(parseFeedSourceFilter("community"), "community");
    assert.equal(parseFeedSourceFilter("podcast"), "podcast");
    assert.equal(parseFeedSourceFilter("social_media"), "social_media");
    assert.equal(parseFeedSourceFilter("website"), "website");
    assert.equal(parseFeedSourceFilter("nope"), "invalid");
    assert.equal(parseFeedSourceFilter(null), null);
  });

  it("parses multi source filters from source and sources params", () => {
    const url = new URL(
      "http://localhost/api/feed?source=community&source=podcast&sources=social_media,podcast",
    );
    assert.deepEqual(parseFeedSourceFilters(url), [
      "community",
      "podcast",
      "social_media",
    ]);
    assert.deepEqual(
      parseFeedSourceFilters(new URL("http://localhost/api/feed")),
      [],
    );
    assert.equal(
      parseFeedSourceFilters(
        new URL("http://localhost/api/feed?source=nope"),
      ),
      "invalid",
    );
  });

  it("validates sourceId as a UUID", () => {
    assert.equal(parseFeedSourceId(null), null);
    assert.equal(parseFeedSourceId(""), null);
    assert.equal(
      parseFeedSourceId("550e8400-e29b-41d4-a716-446655440000"),
      "550e8400-e29b-41d4-a716-446655440000",
    );
    assert.equal(parseFeedSourceId("not-a-uuid"), "invalid");
  });

  it("matches articles against multi source allow-list", () => {
    const types = new Set(["community", "social_media"]);
    assert.equal(passesSourceFilter(types, ["podcast"]), false);
    assert.equal(passesSourceFilter(types, ["community", "podcast"]), true);
    assert.equal(passesSourceFilter(undefined, ["community"]), false);
    assert.equal(passesSourceFilter(types, []), true);
  });

  it("formats episode duration", () => {
    assert.equal(formatEpisodeDuration(45), "45s");
    assert.equal(formatEpisodeDuration(90), "1 min");
    assert.equal(formatEpisodeDuration(3723), "1h 2m");
    assert.equal(formatEpisodeDuration(3600), "1h");
    assert.equal(formatEpisodeDuration(null), null);
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
    assert.deepEqual(
      parseFeedExcludeTopicIds(
        new URL("http://localhost/api/feed?excludeTopic=x&excludeTopics=y,x"),
      ),
      ["x", "y"],
    );
  });

  it("parses search query", () => {
    assert.equal(parseFeedSearchQuery(null), null);
    assert.equal(parseFeedSearchQuery("  "), null);
    assert.equal(parseFeedSearchQuery("  llm agents  "), "llm agents");
    assert.equal(parseFeedSearchQuery("x".repeat(201)), "invalid");
  });

  it("splits keyword + AI feed reasons", () => {
    assert.deepEqual(
      splitFeedReason(
        "Matched keywords: llm, agent. Benchmarks a new open-source LLM",
      ),
      {
        keywordsLine: "Matched keywords: llm, agent",
        detail: "Benchmarks a new open-source LLM",
      },
    );
    assert.deepEqual(splitFeedReason("Matched keywords: llm"), {
      keywordsLine: "Matched keywords: llm",
      detail: null,
    });
    assert.deepEqual(splitFeedReason("Just an AI line"), {
      keywordsLine: null,
      detail: "Just an AI line",
    });
  });

  it("formats topic membership for the feed UI", () => {
    const names = new Map([
      ["t1", "Breaking & politics"],
      ["t2", "AI & agents"],
    ]);
    assert.equal(
      formatTopicMembership({
        matchedTopicIds: ["t1", "t2"],
        topicNameById: names,
        hasAiScore: true,
      }),
      "Topics: Breaking & politics · AI & agents",
    );
    assert.equal(
      formatTopicMembership({
        matchedTopicIds: [],
        topicNameById: names,
        hasAiScore: true,
      }),
      "No topic confirmed",
    );
    assert.equal(
      formatTopicMembership({
        matchedTopicIds: [],
        topicNameById: names,
        hasAiScore: false,
      }),
      null,
    );
    assert.equal(
      formatTopicMembership({
        matchedTopicIds: null,
        topicNameById: names,
        hasAiScore: true,
      }),
      null,
    );
  });

  it("labels source categories and subscription identities", () => {
    assert.equal(feedSourceTypeLabel("website"), "Website");
    assert.equal(feedSourceTypeLabel("newsletter"), "Newsletter");
    assert.equal(feedSourceTypeLabel("podcast"), "Podcast");
    assert.equal(feedSourceTypeLabel("community"), "Community");
    assert.equal(feedSourceTypeLabel("social_media"), "Social");
    assert.equal(
      feedSourceSubscriptionLabel("rss", {
        rssUrl: "https://www.platformer.news/feed",
      }),
      "platformer.news",
    );
    assert.equal(
      feedSourceSubscriptionLabel("bluesky", { handle: "@Jay.Bsky.Social" }),
      "@Jay.Bsky.Social",
    );
    assert.equal(
      feedSourceSubscriptionLabel("reddit", { subreddit: "programming" }),
      "r/programming",
    );
    assert.equal(
      feedSourceSubscriptionLabel("hackernews", { mode: "new" }),
      "Hacker News",
    );
    assert.equal(
      feedSourceSubscriptionLabel("hackernews", { mode: "top" }),
      "Hacker News",
    );
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

  it("excludes tokens prefixed with -", () => {
    assert.equal(
      passesSearchFilter("Local LLM tools", "Postgres tips", null, "llm -postgres"),
      false,
    );
    assert.equal(
      passesSearchFilter("Local LLM tools", "Redis tips", null, "llm -postgres"),
      true,
    );
    assert.equal(
      passesSearchFilter("Spam about parking", null, null, "-parking"),
      false,
    );
    assert.equal(
      passesSearchFilter("Space telescope news", null, null, "-parking"),
      true,
    );
  });

  it("matches quoted phrases as a single contiguous substring", () => {
    assert.equal(
      passesSearchFilter(
        "Advances in artificial intelligence research",
        null,
        null,
        '"artificial intelligence"',
      ),
      true,
    );
    assert.equal(
      passesSearchFilter(
        "Artificial minds and intelligence tests",
        null,
        null,
        '"artificial intelligence"',
      ),
      false,
    );
    assert.equal(
      passesSearchFilter(
        "Notes on artificial intelligence hype",
        null,
        null,
        '-"artificial intelligence"',
      ),
      false,
    );
  });
});

describe("tokenizeFeedSearch / parseFeedSearchTokens / escapeIlikePattern", () => {
  it("splits and lowercases tokens", () => {
    assert.deepEqual(tokenizeFeedSearch("  LLM   Agents "), ["llm", "agents"]);
    assert.deepEqual(tokenizeFeedSearch("   "), []);
  });

  it("keeps double-quoted spans as one token", () => {
    assert.deepEqual(tokenizeFeedSearch('"Artificial Intelligence"'), [
      "artificial intelligence",
    ]);
    assert.deepEqual(
      tokenizeFeedSearch('llm "artificial intelligence" agent'),
      ["llm", "artificial intelligence", "agent"],
    );
    assert.deepEqual(tokenizeFeedSearch('"open  source'), ["open source"]);
  });

  it("parses include and exclude tokens", () => {
    assert.deepEqual(parseFeedSearchTokens("llm -postgres - "), {
      include: ["llm"],
      exclude: ["postgres"],
    });
    assert.deepEqual(parseFeedSearchTokens("-spam"), {
      include: [],
      exclude: ["spam"],
    });
    assert.deepEqual(
      parseFeedSearchTokens('llm -"artificial intelligence"'),
      {
        include: ["llm"],
        exclude: ["artificial intelligence"],
      },
    );
  });

  it("escapes ILIKE wildcards", () => {
    assert.equal(escapeIlikePattern("100%_done"), "100\\%\\_done");
  });
});

describe("matchesTopicIds", () => {
  it("matches when the stored set overlaps the selected topics", () => {
    assert.equal(matchesTopicIds(["t1", "t2"], ["t2"]), "match");
  });

  it("no-match when the stored set has no overlap", () => {
    assert.equal(matchesTopicIds(["t1"], ["t2"]), "no-match");
  });

  it("unknown for pre-migration rows (null matchedTopicIds)", () => {
    assert.equal(matchesTopicIds(null, ["t2"]), "unknown");
    assert.equal(matchesTopicIds(undefined, ["t2"]), "unknown");
  });
});

describe("passesTopicSelection", () => {
  it("excludes articles that match an excluded topic", () => {
    assert.equal(
      passesTopicSelection({
        matchedTopicIds: ["ai", "sports"],
        title: "Match",
        summary: null,
        includeIds: [],
        excludeIds: ["sports"],
        includeKeywords: [],
        excludeKeywords: [],
      }),
      false,
    );
  });

  it("keeps articles that only match includes when excludes miss", () => {
    assert.equal(
      passesTopicSelection({
        matchedTopicIds: ["ai"],
        title: "Match",
        summary: null,
        includeIds: ["ai"],
        excludeIds: ["sports"],
        includeKeywords: [],
        excludeKeywords: [],
      }),
      true,
    );
  });

  it("exclude-only mode keeps non-matching articles", () => {
    assert.equal(
      passesTopicSelection({
        matchedTopicIds: ["ai"],
        title: "Match",
        summary: null,
        includeIds: [],
        excludeIds: ["sports"],
        includeKeywords: [],
        excludeKeywords: [],
      }),
      true,
    );
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
        topicIds: null,
        topicKeywords: null,
        sourceFilter: null,
        searchQuery: null,
        sourceTypesByArticle: new Map(),
      }),
      3,
    );
  });

  it("falls back to keyword re-check for legacy rows with no matchedTopicIds", () => {
    const sources = new Map<string, Set<string>>([
      ["1", new Set(["community"])],
      ["2", new Set(["website"])],
      ["3", new Set(["community"])],
    ]);
    assert.equal(
      countMatchingFeedRows(rows, {
        topicIds: ["topic-llm"],
        topicKeywords: ["llm"],
        sourceFilter: ["community"],
        searchQuery: null,
        sourceTypesByArticle: sources,
      }),
      2,
    );
  });

  it("uses stored matchedTopicIds when present, ignoring keyword overlap", () => {
    const rowsWithMatches = [
      { ...rows[0]!, matchedTopicIds: ["topic-llm"] },
      // Keyword-matches "llm" too, but AI narrowed it to a different topic.
      { ...rows[2]!, matchedTopicIds: ["topic-postgres"] },
    ];
    assert.equal(
      countMatchingFeedRows(rowsWithMatches, {
        topicIds: ["topic-llm"],
        topicKeywords: ["llm"],
        sourceFilter: null,
        searchQuery: null,
        sourceTypesByArticle: new Map(),
      }),
      1,
    );
  });

  it("applies free-text search", () => {
    assert.equal(
      countMatchingFeedRows(rows, {
        topicIds: null,
        topicKeywords: null,
        sourceFilter: null,
        searchQuery: "ai topic",
        sourceTypesByArticle: new Map(),
      }),
      1,
    );
  });
});
