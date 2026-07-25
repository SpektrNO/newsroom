import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adviseTopics, parseAdvisorResponse } from "./advisor.js";
import type { AiProvider } from "./types.js";

describe("parseAdvisorResponse", () => {
  it("parses reply and suggestions", () => {
    const parsed = parseAdvisorResponse(
      JSON.stringify({
        reply: "Try LLMs & agents.",
        suggestions: [
          {
            topicLabel: "LLMs & agents",
            keywords: ["llm", " agent ", "llm"],
            rationale: "Matches your interests",
          },
        ],
      }),
    );
    assert.equal(parsed.reply, "Try LLMs & agents.");
    assert.equal(parsed.suggestions.length, 1);
    assert.deepEqual(parsed.suggestions[0]?.keywords, ["llm", "agent"]);
  });

  it("strips fences and recovers reply-only", () => {
    const parsed = parseAdvisorResponse(
      '```json\n{"reply":"Hello","suggestions":[]}\n```',
    );
    assert.equal(parsed.reply, "Hello");
    assert.equal(parsed.suggestions.length, 0);
  });
});

describe("adviseTopics", () => {
  it("maps provider JSON through the parser", async () => {
    const provider: AiProvider = {
      async complete() {
        return {
          text: JSON.stringify({
            reply: "Ok",
            suggestions: [
              {
                topicLabel: "Developer tools",
                keywords: ["cli", "vscode"],
                rationale: "Tools",
              },
            ],
          }),
          model: "fake",
        };
      },
      async health() {
        return true;
      },
    };

    const result = await adviseTopics(provider, {
      catalogLabels: ["Developer tools", "LLMs & agents"],
      following: [],
      messages: [{ role: "user", content: "I like CLIs" }],
    });
    assert.equal(result.reply, "Ok");
    assert.equal(result.suggestions[0]?.topicLabel, "Developer tools");
  });
});
