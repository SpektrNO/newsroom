import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTopicCreateBody, parseTopicPatchBody } from "./topics.js";

describe("parseTopicCreateBody", () => {
  it("accepts valid topic", () => {
    const parsed = parseTopicCreateBody({
      name: "  AI  ",
      keywords: [" llm ", "", "postgres"],
      weight: 2,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.name, "AI");
    assert.deepEqual(parsed.keywords, ["llm", "postgres"]);
    assert.equal(parsed.weight, 2);
    assert.equal(parsed.enabled, true);
  });

  it("rejects empty name or keywords", () => {
    assert.equal(parseTopicCreateBody({ name: "", keywords: ["a"] }).ok, false);
    assert.equal(parseTopicCreateBody({ name: "x", keywords: [] }).ok, false);
  });
});

describe("parseTopicPatchBody", () => {
  it("requires at least one field", () => {
    assert.equal(parseTopicPatchBody({}).ok, false);
  });

  it("clamps weight", () => {
    const parsed = parseTopicPatchBody({ weight: 100 });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.weight, 10);
  });
});
