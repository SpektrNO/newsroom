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

  it("still rejects bluesky", () => {
    const parsed = parseCreateBody({
      sourceType: "bluesky",
      config: {},
    });
    assert.deepEqual(parsed, { ok: false, error: "unsupported_source_type" });
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
});
