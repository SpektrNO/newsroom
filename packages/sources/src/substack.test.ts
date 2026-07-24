import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SubstackAdapter } from "./substack.js";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example</title>
    <item>
      <title>First Post</title>
      <link>https://example.substack.com/p/first/#top</link>
      <guid>guid-1</guid>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <description>A short summary</description>
      <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Ada</dc:creator>
    </item>
  </channel>
</rss>`;

describe("SubstackAdapter", () => {
  it("parses RSS fixtures into NormalizedArticle", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(SAMPLE_RSS, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });

    const adapter = new SubstackAdapter(
      { rssUrl: "https://example.substack.com/feed" },
      { fetch: fetchMock },
    );
    const articles = await adapter.fetchRecent();

    assert.equal(articles.length, 1);
    assert.equal(articles[0]?.title, "First Post");
    assert.equal(articles[0]?.url, "https://example.substack.com/p/first");
    assert.equal(articles[0]?.author, "Ada");
    assert.equal(articles[0]?.externalId, "guid-1");
    assert.match(articles[0]?.summary ?? "", /short summary/i);
  });
});
