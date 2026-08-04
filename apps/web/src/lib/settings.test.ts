import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseAiCredentialsBody,
  parseRankModelTierBody,
  parseScoreKeepBody,
} from "./settings.js";

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

describe("parseScoreKeepBody", () => {
  it("accepts keepTopN and policy", () => {
    const parsed = parseScoreKeepBody({ keepTopN: 100, policy: "age" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.keepTopN, 100);
    assert.equal(parsed.policy, "age");
  });

  it("clamps keepTopN and accepts string numbers", () => {
    const parsed = parseScoreKeepBody({ keepTopN: "50", policy: "rank" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.keepTopN, 50);
    const capped = parseScoreKeepBody({ keepTopN: 99999, policy: "rank" });
    assert.equal(capped.ok, true);
    if (!capped.ok) return;
    assert.equal(capped.keepTopN, 10_000);
  });

  it("rejects invalid policy or keepTopN", () => {
    assert.equal(
      parseScoreKeepBody({ keepTopN: 10, policy: "newest" }).ok,
      false,
    );
    assert.equal(
      parseScoreKeepBody({ keepTopN: "x", policy: "rank" }).ok,
      false,
    );
    assert.equal(parseScoreKeepBody({}).ok, false);
  });
});

describe("parseAiCredentialsBody", () => {
  it("accepts openai and google with a non-empty key", () => {
    const a = parseAiCredentialsBody({ provider: "openai", apiKey: " sk " });
    assert.equal(a.ok, true);
    if (!a.ok) return;
    assert.equal(a.provider, "openai");
    assert.equal(a.apiKey, "sk");
    const b = parseAiCredentialsBody({ provider: "google", apiKey: "gkey" });
    assert.equal(b.ok, true);
  });

  it("rejects ollama and empty keys", () => {
    assert.equal(
      parseAiCredentialsBody({ provider: "ollama", apiKey: "x" }).ok,
      false,
    );
    assert.equal(
      parseAiCredentialsBody({ provider: "openai", apiKey: "  " }).ok,
      false,
    );
  });
});
