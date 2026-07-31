import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLangSearchQuery,
  extractDomainHint,
  extractFeedUrlsFromText,
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
    assert.equal(isFeedLikeUrl("https://www.nrk.no/rss/"), true);
    assert.equal(isFeedLikeUrl("https://example.com/feed/atom"), true);
    assert.equal(isFeedLikeUrl("https://blog.example/feeds/all"), true);
    assert.equal(isFeedLikeUrl("https://x.com/index.xml"), true);
    assert.equal(isFeedLikeUrl("https://x.com/?format=rss"), true);
  });

  it("accepts .rss extensions used by publishers like NRK", () => {
    assert.equal(isFeedLikeUrl("https://www.nrk.no/toppsaker.rss"), true);
    assert.equal(isFeedLikeUrl("https://www.nrk.no/nyheter/siste.rss"), true);
  });

  it("accepts feed/rss/atom hostnames with a bare path", () => {
    assert.equal(isFeedLikeUrl("https://feed.nrk.no"), true);
    assert.equal(isFeedLikeUrl("https://feed.nrk.no/"), true);
    assert.equal(isFeedLikeUrl("https://rss.example.com/"), true);
  });

  it("rejects non-feed pages", () => {
    assert.equal(isFeedLikeUrl("https://nrk.no/"), false);
    assert.equal(isFeedLikeUrl("https://nrk.no/nyheter"), false);
    assert.equal(isFeedLikeUrl("not-a-url"), false);
  });
});

describe("extractFeedUrlsFromText", () => {
  it("pulls NRK-style .rss links from an index page", () => {
    const html = `
      <a href="https://www.nrk.no/buskerud/toppsaker.rss">Buskerud</a>
      NRK Nyheter www.nrk.no/nyheter/siste.rss
      <a href="/sport/toppsaker.rss">Sport</a>
    `;
    const urls = extractFeedUrlsFromText(html, "https://www.nrk.no/rss/", "nrk.no");
    assert.ok(urls.includes("https://www.nrk.no/buskerud/toppsaker.rss"));
    assert.ok(urls.includes("https://www.nrk.no/nyheter/siste.rss"));
    assert.ok(urls.includes("https://www.nrk.no/sport/toppsaker.rss"));
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

  it("includes www.nrk.no/rss among domain candidates", () => {
    const hits = mapLangSearchResults(
      { code: 200, data: { webPages: { value: [] } } },
      "nrk.no",
    );
    assert.ok(hits.some((h) => h.url === "https://www.nrk.no/rss"));
    assert.ok(hits.some((h) => h.url === "https://feed.nrk.no/"));
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
                url: "https://www.nrk.no/toppsaker.rss",
                snippet: "ok",
              },
            ],
          },
        },
      },
      "nrk.no",
    );
    assert.ok(hits.some((h) => h.url === "https://www.nrk.no/toppsaker.rss"));
    assert.ok(hits.some((h) => h.url === "https://www.nrk.no/rss"));
    assert.ok(!hits.some((h) => h.url.includes("openrss.org")));
  });
});

describe("searchFeedsViaLangSearch", () => {
  it("returns domain candidates even when LangSearch fails", async () => {
    const result = await searchFeedsViaLangSearch({
      query: "site:nrk.no (RSS OR Atom feed)",
      domainHint: "nrk.no",
      apiKey: "test-key",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("langsearch.com")) {
          return new Response("nope", { status: 500 });
        }
        // Index pages unavailable in unit test.
        return new Response("not found", { status: 404 });
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.results.some((h) => h.url === "https://www.nrk.no/rss"));
  });

  it("scrapes feed links from an RSS index page", async () => {
    const result = await searchFeedsViaLangSearch({
      query: "site:nrk.no (RSS OR Atom feed)",
      domainHint: "nrk.no",
      apiKey: "test-key",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("langsearch.com")) {
          return new Response(
            JSON.stringify({ code: 200, data: { webPages: { value: [] } } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/rss")) {
          return new Response(
            `<a href="https://www.nrk.no/toppsaker.rss">Forside</a>`,
            { status: 200, headers: { "content-type": "text/html" } },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.results.some((h) => h.url === "https://www.nrk.no/rss"));
    assert.ok(
      result.results.some((h) => h.url === "https://www.nrk.no/toppsaker.rss"),
    );
  });

  it("returns upstream on HTTP failure without domain fallback", async () => {
    const result = await searchFeedsViaLangSearch({
      query: "x",
      apiKey: "test-key",
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });
    assert.deepEqual(result, { ok: false, error: "upstream" });
  });
});
