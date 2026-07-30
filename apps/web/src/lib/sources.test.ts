import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCreateBody, parsePatchBody } from "./sources.js";

describe("parseCreateBody", () => {
  it("accepts podcast with rssUrl", () => {
    const parsed = parseCreateBody({
      sourceType: "podcast",
      config: { rssUrl: "https://example.com/podcast.xml" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.sourceType, "podcast");
    assert.equal(parsed.config.rssUrl, "https://example.com/podcast.xml");
  });

  it("rejects podcast without rssUrl", () => {
    const parsed = parseCreateBody({
      sourceType: "podcast",
      config: {},
    });
    assert.deepEqual(parsed, { ok: false, error: "invalid_config" });
  });

  it("accepts bluesky with handle and normalizes", () => {
    const parsed = parseCreateBody({
      sourceType: "bluesky",
      config: { handle: "@Jay.Bsky.Social" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.sourceType, "bluesky");
    assert.equal(parsed.config.handle, "jay.bsky.social");
  });

  it("rejects bluesky without handle", () => {
    const parsed = parseCreateBody({
      sourceType: "bluesky",
      config: {},
    });
    assert.deepEqual(parsed, { ok: false, error: "invalid_config" });
  });

  it("rejects bluesky with invalid handle", () => {
    const parsed = parseCreateBody({
      sourceType: "bluesky",
      config: { handle: "noperiod" },
    });
    assert.deepEqual(parsed, { ok: false, error: "invalid_config" });
  });
  it("accepts reddit with subreddit and normalizes", () => {
    const parsed = parseCreateBody({
      sourceType: "reddit",
      config: { subreddit: "r/Programming" },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.sourceType, "reddit");
    assert.equal(parsed.config.subreddit, "programming");
  });

  it("rejects reddit without subreddit", () => {
    const parsed = parseCreateBody({
      sourceType: "reddit",
      config: {},
    });
    assert.deepEqual(parsed, { ok: false, error: "invalid_config" });
  });
});

describe("parsePatchBody", () => {
  it("accepts podcast rssUrl updates", () => {
    const parsed = parsePatchBody(
      { config: { rssUrl: "https://example.com/show.xml" } },
      "podcast",
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
