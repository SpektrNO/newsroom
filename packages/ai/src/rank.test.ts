import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankArticleBatch } from "./rank.js";
import type { AiProvider } from "./types.js";

function fakeProvider(text: string): AiProvider {
  return {
    async complete() {
      return { text, model: "fake" };
    },
    async health() {
      return true;
    },
  };
}

describe("rankArticleBatch", () => {
  const topics = [{ name: "AI", keywords: ["llm"], weight: 1 }];
  const articles = [
    { articleId: "a1", title: "LLM news", summary: "About models" },
    { articleId: "a2", title: "Other", summary: null },
  ];

  it("parses JSON array from model output", async () => {
    const provider = fakeProvider(
      JSON.stringify([
        {
          articleId: "a1",
          aiScore: 0.9,
          reason: "Strong LLM match",
          nearDuplicateOfArticleId: null,
        },
        {
          articleId: "a2",
          aiScore: 0.2,
          reason: "Weak",
          nearDuplicateOfArticleId: "a1",
        },
      ]),
    );

    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.articleId, "a1");
    assert.equal(ranked[0]?.aiScore, 0.9);
    assert.equal(ranked[1]?.nearDuplicateOfArticleId, "a1");
  });

  it("strips markdown fences and ignores unknown article ids", async () => {
    const provider = fakeProvider(`\`\`\`json
[{"articleId":"a1","aiScore":0.5,"reason":"ok"},{"articleId":"ghost","aiScore":1,"reason":"x"}]
\`\`\``);

    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.articleId, "a1");
  });

  it("returns empty on unparseable output without throwing", async () => {
    const provider = fakeProvider("sorry, I cannot help");
    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.deepEqual(ranked, []);
  });

  it("skips malformed items and keeps valid ones", async () => {
    const provider = fakeProvider(
      JSON.stringify([
        { articleId: "a1", aiScore: "nope", reason: "bad" },
        { articleId: "a2", aiScore: 0.7, reason: "fine" },
        null,
        { foo: 1 },
      ]),
    );
    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.articleId, "a2");
    assert.equal(ranked[0]?.aiScore, 0.7);
  });

  it("ignores invalid near-duplicate ids", async () => {
    const provider = fakeProvider(
      JSON.stringify([
        {
          articleId: "a1",
          aiScore: 0.5,
          reason: "x",
          nearDuplicateOfArticleId: "not-in-batch",
        },
      ]),
    );
    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked[0]?.nearDuplicateOfArticleId, null);
  });
});
