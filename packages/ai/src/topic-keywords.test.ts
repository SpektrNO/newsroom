import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inheritedKeywordsForTopicName,
  pathKeywordsForTopicName,
  tokenizeTopicLabel,
} from "./topic-keywords.js";

describe("topic path keywords", () => {
  it("tokenizes labels on separators", () => {
    assert.deepEqual(tokenizeTopicLabel("LLMs & agents"), ["LLMs", "agents"]);
  });

  it("builds full path starters for a deep leaf", () => {
    const path = pathKeywordsForTopicName("Evals & safety").map((k) =>
      k.toLowerCase(),
    );
    assert.ok(path.includes("technology"));
    assert.ok(path.includes("machine"));
    assert.ok(path.includes("evals"));
    assert.ok(path.includes("safety"));
  });

  it("inherited keywords exclude the leaf tokens", () => {
    const inherited = inheritedKeywordsForTopicName("Evals & safety").map((k) =>
      k.toLowerCase(),
    );
    assert.ok(inherited.includes("technology"));
    assert.ok(inherited.includes("learning"));
    assert.ok(!inherited.includes("evals"));
    assert.ok(!inherited.includes("safety"));
  });
});
