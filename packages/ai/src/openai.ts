import type { AiCompleteRequest, AiCompleteResult, AiProvider } from "./types.js";
import { estimateTokenUsage } from "./types.js";

export type OpenAiProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Health / models probe timeout (ms). Default 10s. */
  timeoutMs?: number;
  /** Chat completions timeout (ms). Default 300s. */
  completeTimeoutMs?: number;
  /** Injected fetch (tests). */
  fetch?: typeof fetch;
};

/** OpenAI-compatible JSON / schema mode for `AiCompleteRequest.json`. */
export function openAiResponseFormat(
  json: AiCompleteRequest["json"],
): Record<string, unknown> | undefined {
  if (json === "rank-array") {
    return {
      type: "json_schema",
      json_schema: {
        name: "rank_array",
        strict: true,
        schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  articleId: { type: "string" },
                  aiScore: { type: "number" },
                  reason: { type: "string" },
                  confirmedTopicIds: {
                    type: "array",
                    items: { type: "string" },
                  },
                  nearDuplicateOfArticleId: {
                    anyOf: [{ type: "string" }, { type: "null" }],
                  },
                },
                required: [
                  "articleId",
                  "aiScore",
                  "reason",
                  "confirmedTopicIds",
                  "nearDuplicateOfArticleId",
                ],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    };
  }
  if (json) {
    return { type: "json_object" };
  }
  return undefined;
}

/**
 * If the model returned `{ "items": [...] }` (OpenAI schema root must be object),
 * unwrap to a bare JSON array string for `extractJsonArray` / advisors.
 */
export function unwrapRankItemsPayload(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return text;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return JSON.stringify((parsed as { items: unknown[] }).items);
    }
  } catch {
    /* keep original */
  }
  return text;
}

function resolveCompleteTimeoutMs(options: OpenAiProviderOptions): number {
  if (options.completeTimeoutMs !== undefined) {
    return Math.max(1_000, options.completeTimeoutMs);
  }
  const fromEnv = process.env.OPENAI_TIMEOUT_MS ?? process.env.OLLAMA_TIMEOUT_MS;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return Math.max(1_000, Math.floor(n));
  }
  if (options.timeoutMs !== undefined) {
    return Math.max(1_000, options.timeoutMs);
  }
  return 300_000;
}

export class OpenAiProvider implements AiProvider {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly completeTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenAiProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = (
      options.baseUrl ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    this.model =
      options.model ?? process.env.OPENAI_MODEL?.trim() ?? "gpt-4o-mini";
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.completeTimeoutMs = resolveCompleteTimeoutMs(options);
    this.fetchFn = options.fetch ?? fetch;
  }

  async health(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await this.fetchFn(`${this.baseUrl}/models`, {
        headers: { authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(request: AiCompleteRequest): Promise<AiCompleteResult> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key missing (OPENAI_API_KEY)");
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) {
      messages.push({ role: "system", content: request.system });
    }
    let userContent = request.prompt;
    if (request.json === "rank-array") {
      userContent = `${request.prompt}\n\nReturn a JSON object with key "items" holding the ranking array.`;
    } else if (request.json) {
      userContent = `${request.prompt}\n\nReply with a JSON object only.`;
    }
    messages.push({ role: "user", content: userContent });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };
    const responseFormat = openAiResponseFormat(request.json);
    if (responseFormat) {
      body.response_format = responseFormat;
    }
    if (request.maxTokens !== undefined && request.maxTokens > 0) {
      body.max_tokens = Math.floor(request.maxTokens);
    }

    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.completeTimeoutMs),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `OpenAI chat failed (${res.status}): ${errBody || res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    let text = data.choices?.[0]?.message?.content ?? "";
    if (request.json === "rank-array") {
      text = unwrapRankItemsPayload(text);
    }

    const promptForEstimate = request.system
      ? `${request.system}\n\n${request.prompt}`
      : request.prompt;

    let usage: AiCompleteResult["usage"];
    const u = data.usage;
    if (
      u &&
      typeof u.prompt_tokens === "number" &&
      Number.isFinite(u.prompt_tokens) &&
      typeof u.completion_tokens === "number" &&
      Number.isFinite(u.completion_tokens)
    ) {
      const promptTokens = Math.max(0, Math.floor(u.prompt_tokens));
      const completionTokens = Math.max(0, Math.floor(u.completion_tokens));
      usage = {
        promptTokens,
        completionTokens,
        totalTokens:
          typeof u.total_tokens === "number" && Number.isFinite(u.total_tokens)
            ? Math.max(0, Math.floor(u.total_tokens))
            : promptTokens + completionTokens,
      };
    } else {
      usage = estimateTokenUsage(promptForEstimate, text);
    }

    return {
      text,
      model: data.model ?? this.model,
      usage,
    };
  }
}
