import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_LOG_MAX_TURNS,
  chatApiMessages,
  parseStoredChatLog,
  trimChatLog,
} from "./chat-log.js";

describe("trimChatLog", () => {
  it("keeps the newest turns up to max", () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg ${i}`,
    }));
    const trimmed = trimChatLog(turns);
    assert.equal(trimmed.length, CHAT_LOG_MAX_TURNS);
    assert.equal(trimmed[0]!.id, "t5");
    assert.equal(trimmed[trimmed.length - 1]!.id, "t29");
  });
});

describe("parseStoredChatLog", () => {
  it("parses wrapped turns and drops junk", () => {
    const raw = JSON.stringify({
      turns: [
        { id: "u1", role: "user", content: "hello" },
        { id: "bad", role: "system", content: "nope" },
        {
          id: "a1",
          role: "assistant",
          content: "hi",
          suggestions: [
            {
              topicLabel: "LLMs & agents",
              keywords: ["llm"],
              rationale: "fits",
              inCatalog: true,
            },
          ],
        },
      ],
    });
    const turns = parseStoredChatLog(raw);
    assert.equal(turns.length, 2);
    assert.equal(turns[0]!.content, "hello");
    assert.equal(turns[1]!.suggestions?.[0]?.topicLabel, "LLMs & agents");
  });

  it("returns empty on invalid JSON", () => {
    assert.deepEqual(parseStoredChatLog("{"), []);
  });
});

describe("chatApiMessages", () => {
  it("windows to API size with role/content only", () => {
    const turns = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg ${i}`,
      suggestions: i % 2 === 1 ? [] : undefined,
    }));
    const msgs = chatApiMessages(turns, 4);
    assert.equal(msgs.length, 4);
    assert.deepEqual(msgs[0], { role: "user", content: "msg 16" });
    assert.equal("suggestions" in msgs[0]!, false);
  });
});
