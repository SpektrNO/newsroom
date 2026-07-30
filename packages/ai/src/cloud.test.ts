import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  OpenAiProvider,
  openAiResponseFormat,
  unwrapRankItemsPayload,
} from "./openai.js";
import {
  createAiProvider,
  resolveAiProviderKind,
  resolveModelForTier,
} from "./factory.js";
import { GoogleAiProvider, googleResponseSchema } from "./google.js";

describe("openAiResponseFormat", () => {
  it("uses json_schema wrapper for rank-array", () => {
    const fmt = openAiResponseFormat("rank-array") as {
      type: string;
      json_schema: { schema: { properties: { items: unknown } } };
    };
    assert.equal(fmt.type, "json_schema");
    assert.ok(fmt.json_schema.schema.properties.items);
  });

  it("uses json_object for advisor-style requests", () => {
    assert.deepEqual(openAiResponseFormat(true), { type: "json_object" });
    assert.deepEqual(openAiResponseFormat("object"), { type: "json_object" });
    assert.equal(openAiResponseFormat(undefined), undefined);
  });
});

describe("unwrapRankItemsPayload", () => {
  it("unwraps { items: [...] } to a bare array string", () => {
    const out = unwrapRankItemsPayload(
      JSON.stringify({ items: [{ articleId: "a0", aiScore: 0.5 }] }),
    );
    assert.equal(out, JSON.stringify([{ articleId: "a0", aiScore: 0.5 }]));
  });

  it("leaves bare arrays alone", () => {
    const raw = '[{"articleId":"a0"}]';
    assert.equal(unwrapRankItemsPayload(raw), raw);
  });
});

describe("OpenAiProvider", () => {
  it("health returns false without api key", async () => {
    const provider = new OpenAiProvider({ apiKey: "", timeoutMs: 500 });
    assert.equal(await provider.health(), false);
  });

  it("health ok when /models returns 200", async () => {
    const provider = new OpenAiProvider({
      apiKey: "sk-test",
      timeoutMs: 2_000,
      fetch: (async () =>
        new Response("{}", { status: 200 })) as typeof fetch,
    });
    assert.equal(await provider.health(), true);
  });

  it("health fail when /models errors", async () => {
    const provider = new OpenAiProvider({
      apiKey: "sk-test",
      timeoutMs: 2_000,
      fetch: (async () =>
        new Response("nope", { status: 401 })) as typeof fetch,
    });
    assert.equal(await provider.health(), false);
  });

  it("complete maps usage and unwraps rank items", async () => {
    const provider = new OpenAiProvider({
      apiKey: "sk-test",
      model: "gpt-test",
      fetch: (async () =>
        new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    items: [
                      {
                        articleId: "a0",
                        aiScore: 0.9,
                        reason: "ok",
                        confirmedTopicIds: ["t0"],
                      },
                    ],
                  }),
                },
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });

    const result = await provider.complete({
      prompt: "rank these",
      json: "rank-array",
    });
    assert.equal(result.model, "gpt-test");
    assert.equal(result.usage?.promptTokens, 10);
    assert.equal(result.usage?.completionTokens, 20);
    assert.equal(result.usage?.totalTokens, 30);
    assert.equal(result.usage?.estimated, undefined);
    const parsed = JSON.parse(result.text) as unknown[];
    assert.ok(Array.isArray(parsed));
    assert.equal((parsed[0] as { articleId: string }).articleId, "a0");
  });
});

describe("GoogleAiProvider", () => {
  it("health returns false without api key", async () => {
    const provider = new GoogleAiProvider({ apiKey: "", timeoutMs: 500 });
    assert.equal(await provider.health(), false);
  });

  it("health ok when model GET returns 200", async () => {
    const provider = new GoogleAiProvider({
      apiKey: "g-test",
      timeoutMs: 2_000,
      fetch: (async () =>
        new Response("{}", { status: 200 })) as typeof fetch,
    });
    assert.equal(await provider.health(), true);
  });

  it("complete maps usageMetadata and unwraps rank items", async () => {
    const provider = new GoogleAiProvider({
      apiKey: "g-test",
      model: "gemini-test",
      fetch: (async () =>
        new Response(
          JSON.stringify({
            modelVersion: "gemini-test",
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        items: [
                          {
                            articleId: "a0",
                            aiScore: 0.8,
                            reason: "hit",
                            confirmedTopicIds: [],
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 7,
              totalTokenCount: 12,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });

    const result = await provider.complete({
      prompt: "rank",
      system: "sys",
      json: "rank-array",
    });
    assert.equal(result.usage?.promptTokens, 5);
    assert.equal(result.usage?.completionTokens, 7);
    assert.equal(result.usage?.totalTokens, 12);
    assert.ok(Array.isArray(JSON.parse(result.text)));
  });

  it("googleResponseSchema returns OBJECT wrapper for rank-array", () => {
    const schema = googleResponseSchema("rank-array") as {
      type: string;
      properties: { items: unknown };
    };
    assert.equal(schema.type, "OBJECT");
    assert.ok(schema.properties.items);
  });
});

describe("createAiProvider / resolveAiProviderKind", () => {
  const keys = [
    "AI_PROVIDER",
    "RANK_MODEL_FAST",
    "RANK_MODEL_STANDARD",
    "OLLAMA_MODEL",
    "OPENAI_MODEL",
    "GOOGLE_AI_MODEL",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults to ollama", () => {
    assert.equal(resolveAiProviderKind(), "ollama");
    assert.ok(createAiProvider() instanceof Object);
    assert.equal(createAiProvider().constructor.name, "OllamaProvider");
  });

  it("selects openai and google", () => {
    assert.equal(resolveAiProviderKind("openai"), "openai");
    assert.equal(resolveAiProviderKind("google"), "google");
    assert.equal(resolveAiProviderKind("gemini"), "google");
    process.env.AI_PROVIDER = "openai";
    assert.equal(createAiProvider({ apiKey: "x" }).constructor.name, "OpenAiProvider");
    process.env.AI_PROVIDER = "google";
    assert.equal(createAiProvider({ apiKey: "x" }).constructor.name, "GoogleAiProvider");
  });

  it("resolveModelForTier uses cloud defaults when provider is openai", () => {
    process.env.AI_PROVIDER = "openai";
    assert.equal(resolveModelForTier("fast"), "gpt-4o-mini");
    assert.equal(resolveModelForTier("standard"), "gpt-4o");
    process.env.RANK_MODEL_FAST = "gpt-4.1-mini";
    assert.equal(resolveModelForTier("fast"), "gpt-4.1-mini");
  });

  it("resolveModelForTier keeps ollama defaults", () => {
    assert.equal(resolveModelForTier("fast"), "llama3.2");
    assert.equal(resolveModelForTier("standard"), "llama3.1:8b");
  });
});
