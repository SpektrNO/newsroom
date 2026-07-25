export type AiCompleteRequest = {
  prompt: string;
  /** Optional system preamble */
  system?: string;
  /** Prefer JSON-only model output when the backend supports it (e.g. Ollama `format`). */
  json?: boolean;
  /** Soft cap on generated tokens when the backend supports it (e.g. Ollama `num_predict`). */
  maxTokens?: number;
};

export type AiCompleteResult = {
  text: string;
  model: string;
};

/**
 * Abstraction over local/hosted models.
 * UI must never call this — only API routes and workers.
 */
export interface AiProvider {
  complete(request: AiCompleteRequest): Promise<AiCompleteResult>;
  /** Lightweight reachability probe (no generation required). */
  health(): Promise<boolean>;
}
