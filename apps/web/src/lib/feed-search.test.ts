import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLangSearchQuery,
  extractAlternateFeedLinks,
  extractDomainHint,
  extractFeedIndexLinks,
  extractFeedUrlsFromText,
  isFeedLikeUrl,
  looksLikeFeedIndexUrl,
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
      urlMatchesDomainHint("https://openrss.org/feeds/reddit", "nrk.no"),
      false,
    );
  });
});

describe("buildLangSearchQuery", () => {
  it("uses '<domain> feed' for a bare domain", () => {
    assert.equal(buildLangSearchQuery("wired.com"), "wired.com feed");
    assert.equal(
      buildLangSearchQuery("https://www.wired.com/"),
      "wired.com feed",
    );
  });

  it("appends feed to free-text queries", () => {
    assert.equal(
      buildLangSearchQuery("  schneier security  "),
      "schneier security feed",
    );
  });

  it("rejects empty", () => {
    assert.equal(buildLangSearchQuery("   "), null);
  });
});

describe("isFeedLikeUrl", () => {
  it("accepts common feed paths including Wired-style /feed/rss", () => {
    assert.equal(isFeedLikeUrl("https://www.wired.com/feed/rss"), true);
    assert.equal(isFeedLikeUrl("https://nrk.no/rss"), true);
    assert.equal(
      isFeedLikeUrl("https://www.wired.com/feed/category/science/latest/rss"),
      true,
    );
    assert.equal(isFeedLikeUrl("https://www.nrk.no/toppsaker.rss"), true);
  });

  it("accepts RSS directory paths", () => {
    assert.equal(isFeedLikeUrl("https://www.wired.com/about/rss-feeds/"), true);
  });

  it("rejects non-feed pages", () => {
    assert.equal(isFeedLikeUrl("https://www.wired.com/"), false);
    assert.equal(isFeedLikeUrl("https://nrk.no/nyheter"), false);
    assert.equal(
      isFeedLikeUrl(
        "https://static.nrk.no/publisering/kurator-visning/assets/browserconfig.xml",
      ),
      false,
    );
  });
});

describe("looksLikeFeedIndexUrl", () => {
  it("detects directory pages, not /feed/rss concrete feeds", () => {
    assert.equal(looksLikeFeedIndexUrl("https://www.nrk.no/rss"), true);
    assert.equal(
      looksLikeFeedIndexUrl("https://www.wired.com/about/rss-feeds/"),
      true,
    );
    assert.equal(looksLikeFeedIndexUrl("https://www.wired.com/feed/rss"), false);
    assert.equal(
      looksLikeFeedIndexUrl(
        "https://www.wired.com/feed/category/science/latest/rss",
      ),
      false,
    );
  });
});

describe("extractAlternateFeedLinks", () => {
  it("reads link rel=alternate rss/atom from HTML head", () => {
    const html = `
      <link rel="stylesheet" href="/app.css"/>
      <link rel="alternate" type="application/rss+xml" href="https://www.wired.com/feed/rss"/>
      <link type="application/atom+xml" rel="alternate" href="/atom.xml"/>
    `;
    const urls = extractAlternateFeedLinks(
      html,
      "https://www.wired.com/",
      "wired.com",
    );
    assert.ok(urls.includes("https://www.wired.com/feed/rss"));
    assert.ok(urls.includes("https://www.wired.com/atom.xml"));
  });

  it("reads multiline NRK-style alternate link tags", () => {
    const html = `
      <link
        rel="alternate"
        type="application/rss+xml"
        title="Toppsaker fra nrk.no"
        href="https://www.nrk.no/toppsaker.rss"
      />
    `;
    const urls = extractAlternateFeedLinks(
      html,
      "https://www.nrk.no/",
      "nrk.no",
    );
    assert.deepEqual(urls, ["https://www.nrk.no/toppsaker.rss"]);
  });
});

describe("extractFeedIndexLinks", () => {
  it("finds rss-feeds directory links", () => {
    const html = `<a href="/about/rss-feeds/">RSS</a>`;
    const urls = extractFeedIndexLinks(
      html,
      "https://www.wired.com/",
      "wired.com",
    );
    assert.ok(urls.includes("https://www.wired.com/about/rss-feeds"));
  });
});

describe("extractFeedUrlsFromText", () => {
  it("pulls NRK-style .rss links from an index page", () => {
    const html = `
      <a href="https://www.nrk.no/buskerud/toppsaker.rss">Buskerud</a>
      <a href="/sport/toppsaker.rss">Sport</a>
    `;
    const urls = extractFeedUrlsFromText(
      html,
      "https://www.nrk.no/rss/",
      "nrk.no",
    );
    assert.ok(urls.includes("https://www.nrk.no/buskerud/toppsaker.rss"));
    assert.ok(urls.includes("https://www.nrk.no/sport/toppsaker.rss"));
  });
});

describe("parseFeedSearchBody", () => {
  it("builds domain feed query and domain hint from body", () => {
    assert.deepEqual(parseFeedSearchBody({ query: "wired.com" }), {
      ok: true,
      query: "wired.com feed",
      domainHint: "wired.com",
    });
  });
});

describe("mapLangSearchResults", () => {
  it("filters feed-like URLs without inventing paths", () => {
    const hits = mapLangSearchResults(
      {
        code: 200,
        data: {
          webPages: {
            value: [
              { name: "Feed", url: "https://www.wired.com/feed/rss" },
              { name: "Home", url: "https://www.wired.com/" },
              {
                name: "Junk",
                url: "https://rss.feedspot.com/tech_news_rss_feeds/",
              },
            ],
          },
        },
      },
      "wired.com",
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.url, "https://www.wired.com/feed/rss");
  });
});

describe("searchFeedsViaLangSearch", () => {
  it("discovers Wired feeds from homepage alternate link even when LangSearch is junk", async () => {
    const result = await searchFeedsViaLangSearch({
      query: "wired.com feed",
      domainHint: "wired.com",
      apiKey: "test-key",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("langsearch.com")) {
          return new Response(
            JSON.stringify({
              code: 200,
              data: {
                webPages: {
                  value: [
                    {
                      name: "Feedspot",
                      url: "https://rss.feedspot.com/tech_news_rss_feeds/",
                    },
                  ],
                },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === "https://www.wired.com/" || url === "https://wired.com/") {
          return new Response(
            `<link rel="alternate" type="application/rss+xml" href="https://www.wired.com/feed/rss"/>
             <a href="/about/rss-feeds/">RSS Feeds</a>`,
            { status: 200, headers: { "content-type": "text/html" } },
          );
        }
        if (url.includes("/about/rss-feeds")) {
          return new Response(
            `<a href="https://www.wired.com/feed/category/science/latest/rss">Science</a>`,
            { status: 200, headers: { "content-type": "text/html" } },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(
      result.results.some((h) => h.url === "https://www.wired.com/feed/rss"),
    );
    assert.ok(
      result.results.some(
        (h) => h.url === "https://www.wired.com/feed/category/science/latest/rss",
      ),
    );
    assert.ok(!result.results.some((h) => h.url.includes("feedspot.com")));
  });

  it("returns upstream on HTTP failure without domain discovery", async () => {
    const result = await searchFeedsViaLangSearch({
      query: "schneier security feed",
      apiKey: "test-key",
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });
    assert.deepEqual(result, { ok: false, error: "upstream" });
  });

  it("finds NRK toppsaker from homepage alternate without soft-probing", async () => {
    const fetched: string[] = [];
    const result = await searchFeedsViaLangSearch({
      query: "nrk.no feed",
      domainHint: "nrk.no",
      apiKey: "test-key",
      fetchImpl: async (input) => {
        const url = String(input);
        fetched.push(url);
        if (url.includes("langsearch.com")) {
          return new Response(
            JSON.stringify({ code: 200, data: { webPages: { value: [] } } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === "https://www.nrk.no/" || url === "https://nrk.no/") {
          return new Response(
            `<link
              rel="alternate"
              type="application/rss+xml"
              href="https://www.nrk.no/toppsaker.rss"
            />`,
            { status: 200, headers: { "content-type": "text/html" } },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(
      result.results.some((h) => h.url === "https://www.nrk.no/toppsaker.rss"),
    );
    assert.ok(!fetched.some((u) => u.includes("/rss")));
  });

  it("soft-probes /rss when homepage has no feeds", async () => {
    const result = await searchFeedsViaLangSearch({
      query: "example.com feed",
      domainHint: "example.com",
      apiKey: "test-key",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("langsearch.com")) {
          return new Response(
            JSON.stringify({ code: 200, data: { webPages: { value: [] } } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.endsWith("example.com/") || url.endsWith("example.com")) {
          return new Response("<html><body>no feeds</body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        if (url.includes("/rss")) {
          return new Response(
            `<a href="https://www.example.com/news.rss">News</a>`,
            { status: 200, headers: { "content-type": "text/html" } },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(
      result.results.some((h) => h.url === "https://www.example.com/news.rss"),
    );
  });
});
