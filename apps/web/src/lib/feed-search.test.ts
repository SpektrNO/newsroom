import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLangSearchQuery,
  isFeedLikeUrl,
  mapLangSearchResults,
  parseFeedSearchBody,
  searchFeedsViaLangSearch,
} from "./feed-search.js";

describe("buildLangSearchQuery", () => {
  it("appends RSS OR Atom feed", () => {
    assert.equal(buildLangSearchQuery("nrk.no"), "nrk.no RSS OR Atom feed");
  });

  it("trims and collapses whitespace", () => {
    assert.equal(
      buildLangSearchQuery("  nrk  no  "),
      "nrk no RSS OR Atom feed",
    );
  });

  it("rejects empty", () => {
    assert.equal(buildLangSearchQuery("   "), null);
  });

  it("does not double the hint when already present", () => {
    assert.equal(
      buildLangSearchQuery("nrk.no RSS Atom feed"),
      "nrk.no RSS Atom feed",
    );
  });
});

describe("isFeedLikeUrl", () => {
  it("accepts common feed paths", () => {
    assert.equal(isFeedLikeUrl("https://nrk.no/rss"), true);
    assert.equal(isFeedLikeUrl("https://example.com/feed/atom"), true);
    assert.equal(isFeedLikeUrl("https://blog.example/feeds/all"), true);
    assert.equal(isFeedLikeUrl("https://x.com/index.xml"), true);
    assert.equal(isFeedLikeUrl("https://x.com/?format=rss"), true);
  });

  it("rejects non-feed pages", () => {
    assert.equal(isFeedLikeUrl("https://nrk.no/"), false);
    assert.equal(isFeedLikeUrl("https://nrk.no/nyheter"), false);
    assert.equal(isFeedLikeUrl("not-a-url"), false);
  });
});

describe("parseFeedSearchBody", () => {
  it("builds query from body", () => {
    assert.deepEqual(parseFeedSearchBody({ query: "nrk.no" }), {
      ok: true,
      query: "nrk.no RSS OR Atom feed",
    });
  });

  it("rejects missing query", () => {
    assert.deepEqual(parseFeedSearchBody({}), {
      ok: false,
      error: "invalid_query",
    });
  });
});

describe("mapLangSearchResults", () => {
  it("filters feed-like URLs and dedupes", () => {
    const hits = mapLangSearchResults({
      code: 200,
      data: {
        webPages: {
          value: [
            {
              name: "NRK RSS",
              url: "https://www.nrk.no/rss",
              snippet: "feed",
            },
            {
              name: "Home",
              url: "https://www.nrk.no/",
              snippet: "site",
            },
            {
              name: "Dup",
              url: "https://www.nrk.no/rss/",
              snippet: "again",
            },
          ],
        },
      },
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.title, "NRK RSS");
    assert.equal(hits[0]?.url, "https://www.nrk.no/rss");
  });
});

describe("searchFeedsViaLangSearch", () => {
  it("maps a successful LangSearch payload", async () => {
    const result = await searchFeedsViaLangSearch({
      query: "nrk.no RSS OR Atom feed",
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              webPages: {
                value: [
                  {
                    name: "Feed",
                    url: "https://example.com/atom.xml",
                    snippet: "atom",
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0]?.url, "https://example.com/atom.xml");
  });

  it("returns upstream on HTTP failure", async () => {
    const result = await searchFeedsViaLangSearch({
      query: "x",
      apiKey: "test-key",
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });
    assert.deepEqual(result, { ok: false, error: "upstream" });
  });
});
