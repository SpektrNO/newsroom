import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HackerNewsAdapter } from "./hackernews.js";

describe("HackerNewsAdapter", () => {
  it("normalizes Firebase topstories fixtures", async () => {
    const item = {
      id: 42,
      type: "story",
      by: "pg",
      time: 1_700_000_000,
      title: "Hello HN",
      url: "https://Example.com/story/#frag",
    };

    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/topstories.json")) {
        return new Response(JSON.stringify([42, 99]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/item/42.json")) {
        return new Response(JSON.stringify(item), {
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

    assert.equal(articles.length, 1);
    assert.equal(articles[0]?.title, "Hello HN");
    assert.equal(articles[0]?.url, "https://example.com/story");
    assert.equal(articles[0]?.author, "pg");
    assert.equal(articles[0]?.externalId, "42");
    assert.ok(articles[0]?.contentHash);
  });
});
