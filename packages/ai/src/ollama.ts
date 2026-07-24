import type { AiCompleteRequest, AiCompleteResult, AiProvider } from "./types.js";

export type OllamaProviderOptions = {
  host?: string;
  model?: string;
  /** Fetch timeout for health / complete (ms). */
  timeoutMs?: number;
};

export class OllamaProvider implements AiProvider {
  readonly host: string;
  readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaProviderOptions = {}) {
    this.host = (options.host ?? process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    this.model = options.model ?? process.env.OLLAMA_MODEL ?? "llama3.2";
    this.timeoutMs = options.timeoutMs ?? 10_000;
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

    const res = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama generate failed (${res.status}): ${body || res.statusText}`);
    }

    const data = (await res.json()) as { response?: string; model?: string };
    return {
      text: data.response ?? "",
      model: data.model ?? this.model,
    };
  }
}
