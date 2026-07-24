import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCanonicalUrl } from "./url.js";

describe("normalizeCanonicalUrl", () => {
  it("lowercases host, strips fragment, drops trailing slash", () => {
    assert.equal(
      normalizeCanonicalUrl("HTTPS://Example.COM/Path/Page/#section"),
      "https://example.com/Path/Page",
    );
  });

  it("preserves root slash and query", () => {
    assert.equal(
      normalizeCanonicalUrl("https://example.com/?q=1"),
      "https://example.com/?q=1",
    );
  });

  it("rejects non-http schemes", () => {
    assert.throws(() => normalizeCanonicalUrl("ftp://example.com/a"), /invalid_url/);
  });
});
