import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findTopicByLabel,
  followDefaultsForLabel,
  isFollowingLabel,
  parseTopicCreateBody,
  parseTopicPatchBody,
} from "./topics.js";

describe("followDefaultsForLabel", () => {
  it("builds one-click Follow create body from catalog label", () => {
    assert.deepEqual(followDefaultsForLabel("AI & infra"), {
      name: "AI & infra",
      keywords: ["AI", "infra"],
      weight: 1,
      enabled: true,
    });
  });

  it("trims label and tokenizes multi-word leaves", () => {
    assert.deepEqual(followDefaultsForLabel("  Developer tools  "), {
      name: "Developer tools",
      keywords: ["Developer", "tools"],
      weight: 1,
      enabled: true,
    });
  });

  it("produces a body accepted by parseTopicCreateBody", () => {
    const body = followDefaultsForLabel("LLMs & agents");
    const parsed = parseTopicCreateBody(body);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.name, "LLMs & agents");
    assert.deepEqual(parsed.keywords, ["LLMs", "agents"]);
    assert.equal(parsed.weight, 1);
    assert.equal(parsed.enabled, true);
  });
});

describe("isFollowingLabel / findTopicByLabel", () => {
  const topics = [
    { id: "1", name: "AI & infra" },
    { id: "2", name: "Developer tools" },
  ];

  it("matches case-insensitively", () => {
    assert.equal(isFollowingLabel(topics, "ai & INFRA"), true);
    assert.equal(isFollowingLabel(topics, "Politics"), false);
    assert.equal(findTopicByLabel(topics, "developer TOOLS")?.id, "2");
    assert.equal(findTopicByLabel(topics, "missing"), undefined);
  });
});

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

  it("accepts numeric string weight", () => {
    const parsed = parseTopicCreateBody({
      name: "Developer tools",
      keywords: ["vite"],
      weight: "1.5",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.weight, 1.5);
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
