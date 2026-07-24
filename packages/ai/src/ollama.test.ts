import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OllamaProvider } from "./ollama.js";

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
