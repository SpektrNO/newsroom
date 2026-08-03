import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HackerNewsAdapter, hnHtmlToPlain } from "./hackernews.js";

describe("hnHtmlToPlain", () => {
  it("strips tags and decodes common entities", () => {
    assert.equal(
      hnHtmlToPlain("<p>Hello &amp; <i>world</i></p><p>Next</p>"),
      "Hello & world\nNext",
    );
  });
});

describe("HackerNewsAdapter", () => {
  it("merges topstories and newstories, deduping by id", async () => {
    const topItem = {
      id: 42,
      type: "story",
      by: "pg",
      time: 1_700_000_000,
      title: "Hello HN",
      url: "https://Example.com/story/#frag",
    };
    const newOnlyItem = {
      id: 7,
      type: "story",
      by: "alice",
      time: 1_700_000_100,
      title: "Brand new",
      url: "https://example.com/new",
    };

    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/topstories.json")) {
        return new Response(JSON.stringify([42, 99]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/newstories.json")) {
        // 42 overlaps top; 7 is new-only
        return new Response(JSON.stringify([42, 7]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/42.json")) {
        return new Response(JSON.stringify(topItem), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/7.json")) {
        return new Response(JSON.stringify(newOnlyItem), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/99.json")) {
        return new Response(
          JSON.stringify({ id: 99, type: "comment", title: "skip" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const adapter = new HackerNewsAdapter({ mode: "top" }, { fetch: fetchMock });
    const articles = await adapter.fetchRecent();

    assert.equal(articles.length, 2);
    assert.equal(articles[0]?.title, "Hello HN");
    assert.equal(articles[0]?.url, "https://example.com/story");
    assert.equal(articles[0]?.author, "pg");
    assert.equal(articles[0]?.externalId, "42");
    assert.equal(articles[0]?.summary, undefined);
    assert.ok(articles[0]?.contentHash);
    assert.equal(articles[1]?.title, "Brand new");
    assert.equal(articles[1]?.externalId, "7");
  });

  it("uses kids[0] as summary when it is an OP comment", async () => {
    const story = {
      id: 10,
      type: "story",
      by: "bob",
      title: "Show HN: Widget",
      url: "https://example.com/widget",
      kids: [11, 12],
    };
    const opComment = {
      id: 11,
      type: "comment",
      by: "bob",
      text: "<p>Built this for <i>ranking</i> demos &amp; more.</p>",
    };

    let commentFetches = 0;
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/topstories.json")) {
        return new Response(JSON.stringify([10]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/newstories.json")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/10.json")) {
        return new Response(JSON.stringify(story), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/11.json")) {
        commentFetches += 1;
        return new Response(JSON.stringify(opComment), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    };

    const adapter = new HackerNewsAdapter({}, { fetch: fetchMock });
    const articles = await adapter.fetchRecent();

    assert.equal(articles.length, 1);
    assert.equal(commentFetches, 1);
    assert.equal(articles[0]?.summary, "Built this for ranking demos & more.");
  });

  it("does not use kids[0] when the comment is not from the OP", async () => {
    const story = {
      id: 10,
      type: "story",
      by: "bob",
      title: "Link post",
      url: "https://example.com/a",
      kids: [11],
    };
    const otherComment = {
      id: 11,
      type: "comment",
      by: "carol",
      text: "<p>Unrelated top reply</p>",
    };

    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/topstories.json")) {
        return new Response(JSON.stringify([10]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/newstories.json")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/10.json")) {
        return new Response(JSON.stringify(story), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/11.json")) {
        return new Response(JSON.stringify(otherComment), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    };

    const adapter = new HackerNewsAdapter({}, { fetch: fetchMock });
    const articles = await adapter.fetchRecent();
    assert.equal(articles.length, 1);
    assert.equal(articles[0]?.summary, undefined);
  });

  it("prefers story text over OP first comment", async () => {
    const story = {
      id: 10,
      type: "story",
      by: "bob",
      title: "Ask HN: Thoughts?",
      text: "<p>Story body</p>",
      kids: [11],
    };

    let commentFetches = 0;
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/topstories.json")) {
        return new Response(JSON.stringify([10]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/newstories.json")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/10.json")) {
        return new Response(JSON.stringify(story), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/11.json")) {
        commentFetches += 1;
        return new Response(
          JSON.stringify({
            id: 11,
            type: "comment",
            by: "bob",
            text: "<p>Should not be used</p>",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const adapter = new HackerNewsAdapter({}, { fetch: fetchMock });
    const articles = await adapter.fetchRecent();
    assert.equal(articles.length, 1);
    assert.equal(articles[0]?.summary, "Story body");
    assert.equal(commentFetches, 0);
  });

  it("fails if either list endpoint errors", async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/topstories.json")) {
        return new Response(JSON.stringify([1]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/newstories.json")) {
        return new Response("nope", { status: 503 });
      }
      return new Response("not found", { status: 404 });
    };

    const adapter = new HackerNewsAdapter({}, { fetch: fetchMock });
    await assert.rejects(() => adapter.fetchRecent(), /hn_list_failed:503/);
  });
});
