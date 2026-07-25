import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractJsonArray, rankArticleBatch } from "./rank.js";
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
    { articleId: "uuid-1111", title: "LLM news", summary: "About models" },
    { articleId: "uuid-2222", title: "Other", summary: null },
  ];

  it("maps short model ids back to real article ids", async () => {
    const provider = fakeProvider(
      JSON.stringify([
        {
          articleId: "r0",
          aiScore: 0.9,
          reason: "Strong LLM match",
          nearDuplicateOfArticleId: null,
        },
        {
          articleId: "r1",
          aiScore: 0.2,
          reason: "Weak",
          nearDuplicateOfArticleId: "r0",
        },
      ]),
    );

    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.articleId, "uuid-1111");
    assert.equal(ranked[0]?.aiScore, 0.9);
    assert.equal(ranked[1]?.articleId, "uuid-2222");
    assert.equal(ranked[1]?.nearDuplicateOfArticleId, "uuid-1111");
  });

  it("strips markdown fences and ignores unknown article ids", async () => {
    const provider = fakeProvider(`\`\`\`json
[{"articleId":"r0","aiScore":0.5,"reason":"ok"},{"articleId":"ghost","aiScore":1,"reason":"x"}]
\`\`\``);

    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.articleId, "uuid-1111");
  });

  it("returns empty on unparseable output without throwing", async () => {
    const provider = fakeProvider("sorry, I cannot help");
    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.deepEqual(ranked, []);
  });

  it("skips malformed items and keeps valid ones", async () => {
    const provider = fakeProvider(
      JSON.stringify([
        { articleId: "r0", aiScore: "nope", reason: "bad" },
        { articleId: "r1", aiScore: 0.7, reason: "fine" },
        null,
        { foo: 1 },
      ]),
    );
    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.articleId, "uuid-2222");
    assert.equal(ranked[0]?.aiScore, 0.7);
  });

  it("ignores invalid near-duplicate ids", async () => {
    const provider = fakeProvider(
      JSON.stringify([
        {
          articleId: "r0",
          aiScore: 0.5,
          reason: "x",
          nearDuplicateOfArticleId: "not-in-batch",
        },
      ]),
    );
    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked[0]?.nearDuplicateOfArticleId, null);
  });

  it("extractJsonArray unwraps { results: [...] } objects", () => {
    const parsed = extractJsonArray(
      JSON.stringify({ results: [{ articleId: "r0", aiScore: 1 }] }),
    );
    assert.ok(Array.isArray(parsed));
    const first = (parsed as Array<{ articleId: string }>)[0];
    assert.equal(first?.articleId, "r0");
  });

  it("extractJsonArray wraps a single rank object", () => {
    const parsed = extractJsonArray(
      '{"articleId":"r0","aiScore":0.8,"reason":"ok","nearDuplicateOfArticleId":null}',
    );
    assert.ok(Array.isArray(parsed));
    assert.equal((parsed as Array<{ articleId: string }>)[0]?.articleId, "r0");
  });

  it("accepts a single-object model response", async () => {
    const provider = fakeProvider(
      '{"articleId":"r0","aiScore":0.8,"reason":"LLM mentioned","nearDuplicateOfArticleId":null}',
    );
    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.articleId, "uuid-1111");
    assert.equal(ranked[0]?.aiScore, 0.8);
  });
});
