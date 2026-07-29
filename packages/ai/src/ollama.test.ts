import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { OllamaProvider, ollamaJsonFormat, resolveModelForTier } from "./ollama.js";

describe("ollamaJsonFormat", () => {
  it("uses rank-array schema only for ranking", () => {
    const rank = ollamaJsonFormat("rank-array");
    assert.ok(rank && typeof rank === "object");
    assert.equal((rank as { type: string }).type, "array");
  });

  it("declares confirmedTopicIds as a required schema property", () => {
    // Regression: this field was missing from the constrained-decoding schema,
    // so Ollama's grammar didn't actually enforce/attend to it — the model
    // reliably echoed every keyword-matched candidate back unfiltered
    // (e.g. "matter" in an article about code comments still confirmed the
    // "Space & matter" topic) no matter how the prompt worded the ask.
    const rank = ollamaJsonFormat("rank-array") as {
      items: {
        properties: Record<string, unknown>;
        required: string[];
      };
    };
    assert.ok(rank.items.properties.confirmedTopicIds);
    assert.ok(rank.items.required.includes("confirmedTopicIds"));
  });

  it("uses plain json for advisor-style requests", () => {
    assert.equal(ollamaJsonFormat(true), "json");
    assert.equal(ollamaJsonFormat("object"), "json");
    assert.equal(ollamaJsonFormat(undefined), undefined);
  });
});

describe("OllamaProvider", () => {
  it("constructs with defaults from env", () => {
    const provider = new OllamaProvider({
      host: "http://example.test:11434",
      model: "test-model",
    });
    assert.equal(provider.host, "http://example.test:11434");
    assert.equal(provider.model, "test-model");
  });

  it("health returns false when host is unreachable (no throw)", async () => {
    const provider = new OllamaProvider({
      host: "http://127.0.0.1:1",
      timeoutMs: 500,
    });
    const ok = await provider.health();
    assert.equal(ok, false);
  });
});

describe("resolveModelForTier", () => {
  const envKeys = ["RANK_MODEL_FAST", "RANK_MODEL_STANDARD", "OLLAMA_MODEL"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults fast to llama3.2 with no env set", () => {
    assert.equal(resolveModelForTier("fast"), "llama3.2");
  });

  it("defaults standard to llama3.1:8b with no env set", () => {
    assert.equal(resolveModelForTier("standard"), "llama3.1:8b");
  });

  it("fast falls back to OLLAMA_MODEL before the hardcoded default", () => {
    process.env.OLLAMA_MODEL = "custom-fast-fallback";
    assert.equal(resolveModelForTier("fast"), "custom-fast-fallback");
  });

  it("RANK_MODEL_FAST takes priority over OLLAMA_MODEL for the fast tier", () => {
    process.env.OLLAMA_MODEL = "custom-fast-fallback";
    process.env.RANK_MODEL_FAST = "qwen2.5:7b";
    assert.equal(resolveModelForTier("fast"), "qwen2.5:7b");
  });

  it("RANK_MODEL_STANDARD overrides the standard tier default", () => {
    process.env.RANK_MODEL_STANDARD = "qwen2.5:7b";
    assert.equal(resolveModelForTier("standard"), "qwen2.5:7b");
  });

  it("standard tier ignores OLLAMA_MODEL", () => {
    process.env.OLLAMA_MODEL = "custom-fast-fallback";
    assert.equal(resolveModelForTier("standard"), "llama3.1:8b");
  });
});
