import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adviseTopics,
  looksLikeRankPayload,
  parseAdvisorResponse,
} from "./advisor.js";
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

  it("rejects ranking-shaped arrays", () => {
    assert.throws(
      () =>
        parseAdvisorResponse(
          JSON.stringify([
            {
              articleId: "Just How Do LLMs Handle Data?",
              aiScore: 0.8,
              reason: "User query matches keywords",
            },
          ]),
        ),
      /rank_shaped_response/,
    );
  });
});

describe("looksLikeRankPayload", () => {
  it("detects articleId/aiScore rows", () => {
    assert.equal(
      looksLikeRankPayload([
        { articleId: "r0", aiScore: 0.5, reason: "x" },
      ]),
      true,
    );
    assert.equal(
      looksLikeRankPayload({
        reply: "hi",
        suggestions: [{ topicLabel: "AI & infra", keywords: ["ai"] }],
      }),
      false,
    );
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

  it("repairs ranking-shaped output instead of dumping JSON", async () => {
    let calls = 0;
    const provider: AiProvider = {
      async complete() {
        calls += 1;
        if (calls === 1) {
          return {
            text: JSON.stringify([
              {
                articleId: "From Petals to Code",
                aiScore: 0.7,
                reason: "petal",
              },
            ]),
            model: "fake",
          };
        }
        return {
          text: JSON.stringify({
            reply:
              "Your catalog is mostly tech; for flowers I’d still suggest keywords like petal and bloom if you follow a related leaf.",
            suggestions: [
              {
                topicLabel: "Science",
                keywords: ["flower", "petal", "plant"],
                rationale: "Closest nature-adjacent tokens",
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
      catalogLabels: ["LLMs & agents", "Science"],
      following: [],
      messages: [{ role: "user", content: "flowers and petals" }],
    });
    assert.equal(calls, 2);
    assert.match(result.reply, /flower/i);
    assert.equal(result.suggestions.length, 1);
    assert.doesNotMatch(result.reply, /articleId/);
  });
});
