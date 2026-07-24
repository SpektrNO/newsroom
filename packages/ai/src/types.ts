export type AiCompleteRequest = {
  prompt: string;
  /** Optional system preamble */
  system?: string;
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
