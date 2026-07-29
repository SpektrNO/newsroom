export type AiCompleteRequest = {
  prompt: string;
  /** Optional system preamble */
  system?: string;
  /**
   * Prefer JSON-only model output when the backend supports it.
   * - `true` / `"object"` — unstructured JSON (advisor object shape)
   * - `"rank-array"` — Ollama schema forcing a ranking result array
   */
  json?: boolean | "object" | "rank-array";
  /** Soft cap on generated tokens when the backend supports it (e.g. Ollama `num_predict`). */
  maxTokens?: number;
};

export type AiTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** True when counts were estimated (e.g. chars/4) rather than reported by the model. */
  estimated?: boolean;
};

export type AiCompleteResult = {
  text: string;
  model: string;
  usage?: AiTokenUsage;
};

/**
 * Abstraction over local/hosted models.
 * UI must never call this — only API routes and workers.
 */
export interface AiProvider {
  /** Model id when known (e.g. Ollama tag). */
  readonly model?: string;
  complete(request: AiCompleteRequest): Promise<AiCompleteResult>;
  /** Lightweight reachability probe (no generation required). */
  health(): Promise<boolean>;
}

/** Rough estimator when the backend omits token counts (~4 chars/token). */
export function estimateTokenUsage(
  prompt: string,
  completion: string,
): AiTokenUsage {
  const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const completionTokens = Math.max(0, Math.ceil(completion.length / 4));
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true,
  };
}

export function mergeTokenUsage(
  a?: AiTokenUsage,
  b?: AiTokenUsage,
): AiTokenUsage | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    estimated: Boolean(a.estimated || b.estimated) || undefined,
  };
}
