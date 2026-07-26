import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  articleMatchesTopicKeywords,
  combineFinalRank,
  scoreKeywordMatch,
} from "./keyword.js";

describe("scoreKeywordMatch", () => {
  it("matches case-insensitive substrings in title and summary", () => {
    const result = scoreKeywordMatch(
      "New LLM Tools",
      "Running Postgres locally",
      [{ id: "t1", keywords: ["llm", "postgres"], weight: 1 }],
    );
    assert.equal(result.hit, true);
    // two hits × weight 1 × 0.25 = 0.5
    assert.equal(result.keywordScore, 0.5);
    assert.deepEqual(result.matchedTopicIds, ["t1"]);
  });

  it("uses title only when summary is null", () => {
    const result = scoreKeywordMatch("Typescript tips", null, [
      { keywords: ["typescript"], weight: 1 },
    ]);
    assert.equal(result.hit, true);
    assert.equal(result.keywordScore, 0.25);
  });

  it("returns no hit when keywords miss", () => {
    const result = scoreKeywordMatch("Cooking pasta", "Recipes", [
      { keywords: ["llm", "ollama"], weight: 2 },
    ]);
    assert.equal(result.hit, false);
    assert.equal(result.keywordScore, 0);
  });

  it("caps score at 1 with weight-aware hits", () => {
    const result = scoreKeywordMatch("ai llm openai postgres typescript", null, [
      {
        keywords: ["ai", "llm", "openai", "postgres", "typescript"],
        weight: 2,
      },
    ]);
    // 5 × 2 × 0.25 = 2.5 → min(1, 2.5) = 1
    assert.equal(result.keywordScore, 1);
  });
  it("scores inherited ancestor keywords more weakly", () => {
    const result = scoreKeywordMatch(
      "New Technology breakthrough",
      null,
      [
        {
          id: "evals",
          name: "Evals & safety",
          keywords: ["evals", "safety"],
          inheritedKeywords: ["Technology", "AI", "Machine", "Learning"],
          weight: 1,
        },
      ],
    );
    assert.equal(result.hit, true);
    assert.equal(result.keywordScore, 0.1);
  });

  it("does not double-count inherited tokens already in primary keywords", () => {
    const result = scoreKeywordMatch("ai news", null, [
      {
        keywords: ["ai"],
        inheritedKeywords: ["AI", "Technology"],
        weight: 1,
      },
    ]);
    assert.equal(result.keywordScore, 0.25);
  });
});

describe("withInheritedCatalogKeywords", () => {
  it("adds ancestor tokens for a deep catalog leaf", async () => {
    const { withInheritedCatalogKeywords } = await import("./keyword.js");
    const expanded = withInheritedCatalogKeywords({
      name: "Evals & safety",
      keywords: ["Evals", "safety"],
      weight: 1,
    });
    const inherited = (expanded.inheritedKeywords ?? []).map((k) =>
      k.toLowerCase(),
    );
    assert.ok(inherited.includes("technology"));
    assert.ok(inherited.includes("machine"));
    assert.ok(!inherited.includes("evals"));
  });
});

describe("combineFinalRank", () => {
  it("uses 0.35 keyword + 0.65 ai", () => {
    assert.equal(combineFinalRank(1, 0), 0.35);
    assert.equal(combineFinalRank(0, 1), 0.65);
    assert.equal(combineFinalRank(1, 1), 1);
  });

  it("falls back to keyword when ai is null", () => {
    assert.equal(combineFinalRank(0.8, null), 0.8);
    assert.equal(combineFinalRank(0.8, undefined), 0.8);
  });
});

describe("articleMatchesTopicKeywords", () => {
  it("detects overlap for feed topic filter", () => {
    assert.equal(
      articleMatchesTopicKeywords("Hello LLM world", null, ["llm"]),
      true,
    );
    assert.equal(
      articleMatchesTopicKeywords("Hello world", null, ["llm"]),
      false,
    );
  });
});
