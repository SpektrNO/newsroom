import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTopicCreateBody, parseTopicPatchBody } from "./topics.js";

describe("parseTopicCreateBody", () => {
  it("accepts valid catalog leaf topic", () => {
    const parsed = parseTopicCreateBody({
      name: "  ai & INFRA  ",
      keywords: [" llm ", "", "postgres"],
      weight: 2,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.name, "AI & infra");
    assert.deepEqual(parsed.keywords, ["llm", "postgres"]);
    assert.equal(parsed.weight, 2);
    assert.equal(parsed.enabled, true);
  });

  it("rejects empty name, non-catalog name, or empty keywords", () => {
    assert.equal(parseTopicCreateBody({ name: "", keywords: ["a"] }).ok, false);
    assert.equal(
      parseTopicCreateBody({ name: "Custom Free Text", keywords: ["a"] }).ok,
      false,
    );
    assert.equal(
      parseTopicCreateBody({ name: "Technology", keywords: ["a"] }).ok,
      false,
    );
    assert.equal(
      parseTopicCreateBody({ name: "AI & infra", keywords: [] }).ok,
      false,
    );
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

  it("rejects non-catalog name on patch", () => {
    assert.equal(parseTopicPatchBody({ name: "Legacy Name" }).ok, false);
    const ok = parseTopicPatchBody({ name: "llms & agents" });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.name, "LLMs & agents");
  });
});
