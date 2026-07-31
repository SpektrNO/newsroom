import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCreateBody, parsePatchBody } from "./sources.js";

describe("parseCreateBody", () => {
  it("accepts podcast with rssUrl", () => {
    const parsed = parseCreateBody({
      category: "podcast",
      adapter: "rss",
      config: { rssUrl: "https://example.com/podcast.xml" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.category, "podcast");
    assert.equal(parsed.adapter, "rss");
    assert.equal(parsed.config.rssUrl, "https://example.com/podcast.xml");
  });

  it("maps legacy sourceType podcast", () => {
    const parsed = parseCreateBody({
      sourceType: "podcast",
      config: { rssUrl: "https://example.com/podcast.xml" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.category, "podcast");
    assert.equal(parsed.adapter, "rss");
  });

  it("rejects podcast without rssUrl", () => {
    const parsed = parseCreateBody({
      category: "podcast",
      adapter: "rss",
      config: {},
    });
    assert.deepEqual(parsed, { ok: false, error: "invalid_config" });
  });

  it("accepts bluesky with handle and normalizes", () => {
    const parsed = parseCreateBody({
      category: "social_media",
      adapter: "bluesky",
      config: { handle: "@Jay.Bsky.Social" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.category, "social_media");
    assert.equal(parsed.adapter, "bluesky");
    assert.equal(parsed.config.handle, "jay.bsky.social");
  });

  it("rejects bluesky without handle", () => {
    const parsed = parseCreateBody({
      category: "social_media",
      adapter: "bluesky",
      config: {},
    });
    assert.deepEqual(parsed, { ok: false, error: "invalid_config" });
  });

  it("rejects bluesky with invalid handle", () => {
    const parsed = parseCreateBody({
      category: "social_media",
      adapter: "bluesky",
      config: { handle: "noperiod" },
    });
    assert.deepEqual(parsed, { ok: false, error: "invalid_config" });
  });

  it("accepts reddit with subreddit and normalizes", () => {
    const parsed = parseCreateBody({
      category: "community",
      adapter: "reddit",
      config: { subreddit: "r/Programming" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.category, "community");
    assert.equal(parsed.adapter, "reddit");
    assert.equal(parsed.config.subreddit, "programming");
  });

  it("rejects reddit without subreddit", () => {
    const parsed = parseCreateBody({
      category: "community",
      adapter: "reddit",
      config: {},
    });
    assert.deepEqual(parsed, { ok: false, error: "invalid_config" });
  });

  it("rejects invalid category/adapter pairs", () => {
    const parsed = parseCreateBody({
      category: "podcast",
      adapter: "bluesky",
      config: { handle: "jay.bsky.social" },
    });
    assert.deepEqual(parsed, { ok: false, error: "unsupported_source_type" });
  });
});

describe("parsePatchBody", () => {
  it("accepts rssUrl updates for rss adapter", () => {
    const parsed = parsePatchBody(
      { config: { rssUrl: "https://example.com/show.xml" } },
      "rss",
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.config?.rssUrl, "https://example.com/show.xml");
  });

  it("accepts bluesky handle updates", () => {
    const parsed = parsePatchBody(
      { config: { handle: "@Alice.Bsky.Social" } },
      "bluesky",
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.config?.handle, "alice.bsky.social");
  });

  it("accepts reddit subreddit updates", () => {
    const parsed = parsePatchBody(
      { config: { subreddit: "r/rust" } },
      "reddit",
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.config?.subreddit, "rust");
  });
});
