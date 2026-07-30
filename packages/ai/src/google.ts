import type { AiCompleteRequest, AiCompleteResult, AiProvider } from "./types.js";
import { estimateTokenUsage } from "./types.js";
import { unwrapRankItemsPayload } from "./openai.js";

export type GoogleAiProviderOptions = {
  apiKey?: string;
  model?: string;
  /** Base URL without trailing slash. Default Gemini API. */
  baseUrl?: string;
  /** Health probe timeout (ms). Default 10s. */
  timeoutMs?: number;
  /** generateContent timeout (ms). Default 300s. */
  completeTimeoutMs?: number;
  /** Injected fetch (tests). */
  fetch?: typeof fetch;
};

/** Gemini `responseSchema` for `AiCompleteRequest.json`. */
export function googleResponseSchema(
  json: AiCompleteRequest["json"],
): Record<string, unknown> | undefined {
  if (json === "rank-array") {
    return {
      type: "OBJECT",
      properties: {
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              articleId: { type: "STRING" },
              aiScore: { type: "NUMBER" },
              reason: { type: "STRING" },
              confirmedTopicIds: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
              nearDuplicateOfArticleId: { type: "STRING", nullable: true },
            },
            required: [
              "articleId",
              "aiScore",
              "reason",
              "confirmedTopicIds",
            ],
          },
        },
      },
      required: ["items"],
    };
  }
  if (json) {
    return { type: "OBJECT" };
  }
  return undefined;
}

function resolveCompleteTimeoutMs(options: GoogleAiProviderOptions): number {
  if (options.completeTimeoutMs !== undefined) {
    return Math.max(1_000, options.completeTimeoutMs);
  }
  const fromEnv = process.env.GOOGLE_AI_TIMEOUT_MS ?? process.env.OLLAMA_TIMEOUT_MS;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return Math.max(1_000, Math.floor(n));
  }
  if (options.timeoutMs !== undefined) {
    return Math.max(1_000, options.timeoutMs);
  }
  return 300_000;
}

export class GoogleAiProvider implements AiProvider {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly completeTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: GoogleAiProviderOptions = {}) {
    this.apiKey =
      options.apiKey ??
      process.env.GOOGLE_AI_API_KEY ??
      process.env.GEMINI_API_KEY ??
      "";
    this.baseUrl = (
      options.baseUrl ??
      process.env.GOOGLE_AI_BASE_URL ??
      "https://generativelanguage.googleapis.com/v1beta"
    ).replace(/\/$/, "");
    this.model =
      options.model ??
      process.env.GOOGLE_AI_MODEL?.trim() ??
      "gemini-2.0-flash";
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.completeTimeoutMs = resolveCompleteTimeoutMs(options);
    this.fetchFn = options.fetch ?? fetch;
  }

  async health(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}?key=${encodeURIComponent(this.apiKey)}`;
      const res = await this.fetchFn(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(request: AiCompleteRequest): Promise<AiCompleteResult> {
    if (!this.apiKey) {
      throw new Error("Google AI API key missing (GOOGLE_AI_API_KEY)");
    }

    let userText = request.prompt;
    if (request.json === "rank-array") {
      userText = `${request.prompt}\n\nReturn a JSON object with key "items" holding the ranking array.`;
    } else if (request.json) {
      userText = `${request.prompt}\n\nReply with a JSON object only.`;
    }

    const generationConfig: Record<string, unknown> = {};
    if (request.maxTokens !== undefined && request.maxTokens > 0) {
      generationConfig.maxOutputTokens = Math.floor(request.maxTokens);
    }
    if (request.json) {
      generationConfig.responseMimeType = "application/json";
      const schema = googleResponseSchema(request.json);
      if (schema && request.json === "rank-array") {
        generationConfig.responseSchema = schema;
      }
    }

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
    };
    if (request.system) {
      body.systemInstruction = { parts: [{ text: request.system }] };
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.completeTimeoutMs),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Google AI generate failed (${res.status}): ${errBody || res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      modelVersion?: string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    let text = parts.map((p) => p.text ?? "").join("");
    if (request.json === "rank-array") {
      text = unwrapRankItemsPayload(text);
    }

    const promptForEstimate = request.system
      ? `${request.system}\n\n${request.prompt}`
      : request.prompt;

    let usage: AiCompleteResult["usage"];
    const u = data.usageMetadata;
    if (
      u &&
      typeof u.promptTokenCount === "number" &&
      Number.isFinite(u.promptTokenCount) &&
      typeof u.candidatesTokenCount === "number" &&
      Number.isFinite(u.candidatesTokenCount)
    ) {
      const promptTokens = Math.max(0, Math.floor(u.promptTokenCount));
      const completionTokens = Math.max(0, Math.floor(u.candidatesTokenCount));
      usage = {
        promptTokens,
        completionTokens,
        totalTokens:
          typeof u.totalTokenCount === "number" &&
          Number.isFinite(u.totalTokenCount)
            ? Math.max(0, Math.floor(u.totalTokenCount))
            : promptTokens + completionTokens,
      };
    } else {
      usage = estimateTokenUsage(promptForEstimate, text);
    }

    return {
      text,
      model: data.modelVersion ?? this.model,
      usage,
    };
  }
}
