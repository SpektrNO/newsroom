import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLangSearchQuery,
  extractDomainHint,
  isFeedLikeUrl,
  mapLangSearchResults,
  parseFeedSearchBody,
  searchFeedsViaLangSearch,
  urlMatchesDomainHint,
} from "./feed-search.js";

describe("extractDomainHint", () => {
  it("pulls a bare domain", () => {
    assert.equal(extractDomainHint("nrk.no"), "nrk.no");
    assert.equal(extractDomainHint("www.nrk.no"), "nrk.no");
  });

  it("pulls a domain from a URL", () => {
    assert.equal(extractDomainHint("https://www.nrk.no/nyheter"), "nrk.no");
  });

  it("returns null for free text without a host", () => {
    assert.equal(extractDomainHint("schneier security blog"), null);
  });
});

describe("urlMatchesDomainHint", () => {
  it("matches host and subdomains", () => {
    assert.equal(
      urlMatchesDomainHint("https://www.nrk.no/rss", "nrk.no"),
      true,
    );
    assert.equal(
      urlMatchesDomainHint("https://podcast.nrk.no/feed", "nrk.no"),
      true,
    );
    assert.equal(
      urlMatchesDomainHint("https://openrss.org/feeds/reddit", "nrk.no"),
      false,
    );
  });
});

describe("buildLangSearchQuery", () => {
  it("uses site: when the query is a domain", () => {
    assert.equal(
      buildLangSearchQuery("nrk.no"),
      "site:nrk.no (RSS OR Atom feed)",
    );
  });

  it("trims free-text queries and appends feed hint", () => {
    assert.equal(
      buildLangSearchQuery("  schneier security  "),
      "schneier security RSS OR Atom feed",
    );
  });

  it("rejects empty", () => {
    assert.equal(buildLangSearchQuery("   "), null);
  });

  it("does not double the hint when already present (non-domain)", () => {
    assert.equal(
      buildLangSearchQuery("schneier RSS Atom feed"),
      "schneier RSS Atom feed",
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
  it("builds site query and domain hint from body", () => {
    assert.deepEqual(parseFeedSearchBody({ query: "nrk.no" }), {
      ok: true,
      query: "site:nrk.no (RSS OR Atom feed)",
      domainHint: "nrk.no",
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

  it("drops feed-like URLs off the queried domain", () => {
    const hits = mapLangSearchResults(
      {
        code: 200,
        data: {
          webPages: {
            value: [
              {
                name: "Open RSS Reddit",
                url: "https://openrss.org/feeds/reddit",
                snippet: "aggregator",
              },
              {
                name: "NRK",
                url: "https://www.nrk.no/rss",
                snippet: "ok",
              },
            ],
          },
        },
      },
      "nrk.no",
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.url, "https://www.nrk.no/rss");
  });
});

describe("searchFeedsViaLangSearch", () => {
  it("maps a successful LangSearch payload with domain filter", async () => {
    const result = await searchFeedsViaLangSearch({
      query: "site:nrk.no (RSS OR Atom feed)",
      domainHint: "nrk.no",
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              webPages: {
                value: [
                  {
                    name: "Wrong",
                    url: "https://example.com/atom.xml",
                    snippet: "atom",
                  },
                  {
                    name: "Feed",
                    url: "https://www.nrk.no/atom.xml",
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
    assert.equal(result.results[0]?.url, "https://www.nrk.no/atom.xml");
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
