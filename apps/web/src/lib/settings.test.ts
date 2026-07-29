import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRankModelTierBody } from "./settings.js";

describe("parseRankModelTierBody", () => {
  it("accepts each valid tier", () => {
    for (const tier of ["none", "fast", "standard"] as const) {
      const parsed = parseRankModelTierBody({ tier });
      assert.equal(parsed.ok, true);
      if (!parsed.ok) return;
      assert.equal(parsed.tier, tier);
    }
  });

  it("rejects an unknown tier", () => {
    const parsed = parseRankModelTierBody({ tier: "cheap" });
    assert.equal(parsed.ok, false);
  });

  it("rejects a missing tier", () => {
    assert.equal(parseRankModelTierBody({}).ok, false);
  });

  it("rejects a non-object body", () => {
    assert.equal(parseRankModelTierBody(null).ok, false);
    assert.equal(parseRankModelTierBody("fast").ok, false);
  });
});
