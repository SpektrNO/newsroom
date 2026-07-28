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
    assert.equal(ranked.items.length, 2);
    assert.equal(ranked.items[0]?.articleId, "uuid-1111");
    assert.equal(ranked.items[0]?.aiScore, 0.9);
    assert.equal(ranked.items[1]?.articleId, "uuid-2222");
    assert.equal(ranked.items[1]?.nearDuplicateOfArticleId, "uuid-1111");
  });

  it("strips markdown fences and ignores unknown article ids", async () => {
    const provider = fakeProvider(`\`\`\`json
[{"articleId":"r0","aiScore":0.5,"reason":"ok"},{"articleId":"ghost","aiScore":1,"reason":"x"}]
\`\`\``);

    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.equal(ranked.items.length, 1);
    assert.equal(ranked.items[0]?.articleId, "uuid-1111");
  });

  it("returns empty on unparseable output without throwing", async () => {
    const provider = fakeProvider("sorry, I cannot help");
    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.deepEqual(ranked.items, []);
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
    assert.equal(ranked.items.length, 1);
    assert.equal(ranked.items[0]?.articleId, "uuid-2222");
    assert.equal(ranked.items[0]?.aiScore, 0.7);
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
    assert.equal(ranked.items[0]?.nearDuplicateOfArticleId, null);
  });

  it("maps confirmedTopicIds from short topic refs back to real topic ids", async () => {
    const topicsWithIds = [
      { id: "topic-space", name: "Space & matter", keywords: ["space"], weight: 1 },
      { id: "topic-ai", name: "AI & agents", keywords: ["ai", "agents"], weight: 1 },
    ];
    const articlesWithCandidates = [
      {
        articleId: "uuid-1111",
        title: "Wmux - a workspace multiplexer for AI agents",
        summary: null,
        candidateTopicIds: ["topic-space", "topic-ai"],
      },
    ];
    const provider = fakeProvider(
      JSON.stringify([
        {
          articleId: "r0",
          aiScore: 0.6,
          reason: "About AI agents tooling, not astronomy",
          confirmedTopicIds: ["t1"],
        },
      ]),
    );

    const ranked = await rankArticleBatch(provider, {
      topics: topicsWithIds,
      articles: articlesWithCandidates,
    });
    assert.equal(ranked.items.length, 1);
    assert.deepEqual(ranked.items[0]?.confirmedTopicIds, ["topic-ai"]);
  });

  it("drops hallucinated confirmedTopicIds outside the article's own candidates", async () => {
    const topicsWithIds = [
      { id: "topic-space", name: "Space & matter", keywords: ["space"], weight: 1 },
      { id: "topic-ai", name: "AI & agents", keywords: ["ai"], weight: 1 },
    ];
    const articlesWithCandidates = [
      {
        articleId: "uuid-1111",
        title: "Deep space rover mission",
        summary: null,
        candidateTopicIds: ["topic-space"],
      },
    ];
    const provider = fakeProvider(
      JSON.stringify([
        {
          articleId: "r0",
          aiScore: 0.8,
          reason: "About space",
          // t1 (topic-ai) was never a candidate for this article — must be ignored.
          confirmedTopicIds: ["t0", "t1"],
        },
      ]),
    );

    const ranked = await rankArticleBatch(provider, {
      topics: topicsWithIds,
      articles: articlesWithCandidates,
    });
    assert.deepEqual(ranked.items[0]?.confirmedTopicIds, ["topic-space"]);
  });

  it("falls back to the full candidate set when the model omits confirmedTopicIds", async () => {
    const topicsWithIds = [
      { id: "topic-space", name: "Space & matter", keywords: ["space"], weight: 1 },
    ];
    const articlesWithCandidates = [
      {
        articleId: "uuid-1111",
        title: "Deep space rover mission",
        summary: null,
        candidateTopicIds: ["topic-space"],
      },
    ];
    const provider = fakeProvider(
      JSON.stringify([
        { articleId: "r0", aiScore: 0.8, reason: "About space" },
      ]),
    );

    const ranked = await rankArticleBatch(provider, {
      topics: topicsWithIds,
      articles: articlesWithCandidates,
    });
    assert.deepEqual(ranked.items[0]?.confirmedTopicIds, ["topic-space"]);
  });

  it("returns an empty confirmedTopicIds array when the article had no candidates", async () => {
    const provider = fakeProvider(
      JSON.stringify([
        { articleId: "r0", aiScore: 0.9, reason: "Strong LLM match" },
        { articleId: "r1", aiScore: 0.2, reason: "Weak" },
      ]),
    );
    const ranked = await rankArticleBatch(provider, { topics, articles });
    assert.deepEqual(ranked.items[0]?.confirmedTopicIds, []);
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
    assert.equal(ranked.items.length, 1);
    assert.equal(ranked.items[0]?.articleId, "uuid-1111");
    assert.equal(ranked.items[0]?.aiScore, 0.8);
  });
});
