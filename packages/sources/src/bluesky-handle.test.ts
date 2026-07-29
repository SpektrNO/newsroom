import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeBlueskyHandle } from "./bluesky-handle.js";

describe("normalizeBlueskyHandle", () => {
  it("strips @, trims, and lowercases handles", () => {
    assert.equal(
      normalizeBlueskyHandle("  @Jay.Bsky.Social  "),
      "jay.bsky.social",
    );
  });

  it("keeps DID strings as-is after trim", () => {
    assert.equal(
      normalizeBlueskyHandle("  did:plc:abc123XYZ  "),
      "did:plc:abc123XYZ",
    );
    assert.equal(
      normalizeBlueskyHandle("did:web:example.com"),
      "did:web:example.com",
    );
  });

  it("rejects empty and invalid shapes", () => {
    assert.throws(() => normalizeBlueskyHandle(""), /invalid_handle/);
    assert.throws(() => normalizeBlueskyHandle("@@@"), /invalid_handle/);
    assert.throws(() => normalizeBlueskyHandle("noperiod"), /invalid_handle/);
    assert.throws(() => normalizeBlueskyHandle("did:key:z6Mk"), /invalid_handle/);
  });
});
