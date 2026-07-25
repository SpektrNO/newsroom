import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  markSuggestionsInCatalog,
  parseChatRequestBody,
} from "./chat.js";
import {
  checkRateLimit,
  resetRateLimitsForTests,
} from "./rate-limit.js";

describe("parseChatRequestBody", () => {
  it("accepts a short user-ended history", () => {
    const parsed = parseChatRequestBody({
      messages: [{ role: "user", content: "I like local-first sync" }],
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.messages.length, 1);
  });

  it("rejects empty, oversized, or assistant-last payloads", () => {
    assert.equal(parseChatRequestBody({ messages: [] }).ok, false);
    assert.equal(
      parseChatRequestBody({
        messages: [{ role: "assistant", content: "Hi" }],
      }).ok,
      false,
    );
    assert.equal(
      parseChatRequestBody({
        messages: [{ role: "user", content: "x".repeat(2001) }],
      }).ok,
      false,
    );
  });
});

describe("markSuggestionsInCatalog", () => {
  it("canonicalizes catalog labels and flags non-catalog", () => {
    const marked = markSuggestionsInCatalog(
      [
        {
          topicLabel: "llms & agents",
          keywords: ["llm"],
          rationale: "x",
        },
        {
          topicLabel: "Made Up Topic",
          keywords: ["foo"],
          rationale: "y",
        },
      ],
      ["LLMs & agents", "Developer tools"],
    );
    assert.equal(marked[0]?.inCatalog, true);
    assert.equal(marked[0]?.topicLabel, "LLMs & agents");
    assert.equal(marked[1]?.inCatalog, false);
  });
});

describe("checkRateLimit", () => {
  it("allows then blocks within the window", () => {
    resetRateLimitsForTests();
    const key = `test-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      assert.equal(checkRateLimit(key, { limit: 10, windowMs: 60_000 }).ok, true);
    }
    assert.equal(checkRateLimit(key, { limit: 10, windowMs: 60_000 }).ok, false);
  });
});
