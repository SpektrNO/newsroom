import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OllamaProvider, ollamaJsonFormat } from "./ollama.js";

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
