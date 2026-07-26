import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PodcastAdapter } from "./podcast.js";
import { parseDurationSeconds } from "./rss.js";

const SAMPLE_PODCAST_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Show Name</title>
    <itunes:author>Host Person</itunes:author>
    <item>
      <title>Episode With Audio</title>
      <link>https://example.com/ep/1</link>
      <guid>ep-1</guid>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <description>Episode summary</description>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="123"/>
      <itunes:duration>1:02:03</itunes:duration>
      <dc:creator>Guest</dc:creator>
    </item>
    <item>
      <title>Episode Page Only</title>
      <link>https://example.com/ep/2</link>
      <guid>ep-2</guid>
      <description>No enclosure</description>
      <itunes:duration>45:30</itunes:duration>
    </item>
    <item>
      <title>Skip Me</title>
      <description>Neither link nor enclosure</description>
    </item>
  </channel>
</rss>`;

describe("parseDurationSeconds", () => {
  it("parses HH:MM:SS, MM:SS, and raw seconds", () => {
    assert.equal(parseDurationSeconds("1:02:03"), 3723);
    assert.equal(parseDurationSeconds("45:30"), 2730);
    assert.equal(parseDurationSeconds("90"), 90);
    assert.equal(parseDurationSeconds(120), 120);
    assert.equal(parseDurationSeconds(""), undefined);
  });
});

describe("PodcastAdapter", () => {
  it("maps enclosure + itunes duration and page-only episodes", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(SAMPLE_PODCAST_RSS, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });

    const adapter = new PodcastAdapter(
      { rssUrl: "https://example.com/podcast.xml" },
      { fetch: fetchMock },
    );
    const articles = await adapter.fetchRecent();

    assert.equal(articles.length, 2);

    const withAudio = articles[0];
    assert.equal(withAudio?.title, "Episode With Audio");
    assert.equal(withAudio?.url, "https://example.com/ep/1");
    assert.equal(withAudio?.showTitle, "Show Name");
    assert.equal(withAudio?.durationSeconds, 3723);
    assert.equal(withAudio?.enclosureUrl, "https://cdn.example.com/ep1.mp3");
    assert.equal(withAudio?.externalId, "ep-1");
    assert.match(withAudio?.summary ?? "", /Episode summary/i);

    const pageOnly = articles[1];
    assert.equal(pageOnly?.title, "Episode Page Only");
    assert.equal(pageOnly?.url, "https://example.com/ep/2");
    assert.equal(pageOnly?.showTitle, "Show Name");
    assert.equal(pageOnly?.durationSeconds, 2730);
    assert.equal(pageOnly?.enclosureUrl, undefined);
  });
});
