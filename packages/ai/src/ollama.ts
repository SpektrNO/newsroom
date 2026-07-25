import type { AiCompleteRequest, AiCompleteResult, AiProvider } from "./types.js";

export type OllamaProviderOptions = {
  host?: string;
  model?: string;
  /** Fetch timeout for health probes (ms). Default 10s. */
  timeoutMs?: number;
  /**
   * Fetch timeout for `/api/generate` (ms). Ranking batches on CPU often need minutes.
   * Default: `OLLAMA_TIMEOUT_MS` env, else `timeoutMs` if set, else 300_000 (5 min).
   */
  completeTimeoutMs?: number;
};

function resolveCompleteTimeoutMs(options: OllamaProviderOptions): number {
  if (options.completeTimeoutMs !== undefined) {
    return Math.max(1_000, options.completeTimeoutMs);
  }
  const fromEnv = process.env.OLLAMA_TIMEOUT_MS;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return Math.max(1_000, Math.floor(n));
  }
  if (options.timeoutMs !== undefined) {
    return Math.max(1_000, options.timeoutMs);
  }
  return 300_000;
}

export class OllamaProvider implements AiProvider {
  readonly host: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly completeTimeoutMs: number;

  constructor(options: OllamaProviderOptions = {}) {
    this.host = (options.host ?? process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    this.model = options.model ?? process.env.OLLAMA_MODEL ?? "llama3.2";
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.completeTimeoutMs = resolveCompleteTimeoutMs(options);
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.host}/api/tags`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(request: AiCompleteRequest): Promise<AiCompleteResult> {
    const prompt = request.system
      ? `${request.system}\n\n${request.prompt}`
      : request.prompt;

    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      stream: false,
    };
    if (request.json) {
      // Schema forces a top-level array; plain `format: "json"` often yields one object.
      body.format = {
        type: "array",
        items: {
          type: "object",
          properties: {
            articleId: { type: "string" },
            aiScore: { type: "number" },
            reason: { type: "string" },
            nearDuplicateOfArticleId: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
          },
          required: ["articleId", "aiScore", "reason"],
        },
      };
    }
    if (request.maxTokens !== undefined && request.maxTokens > 0) {
      body.options = { num_predict: Math.floor(request.maxTokens) };
    }

    const res = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.completeTimeoutMs),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Ollama generate failed (${res.status}): ${errBody || res.statusText}`,
      );
    }

    const data = (await res.json()) as { response?: string; model?: string };
    return {
      text: data.response ?? "",
      model: data.model ?? this.model,
    };
  }
}
