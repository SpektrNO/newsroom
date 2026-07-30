import type { AiProvider } from "./types.js";
import { OllamaProvider, type OllamaProviderOptions } from "./ollama.js";
import { OpenAiProvider, type OpenAiProviderOptions } from "./openai.js";
import { GoogleAiProvider, type GoogleAiProviderOptions } from "./google.js";

export type AiProviderKind = "ollama" | "openai" | "google";

export type CreateAiProviderOptions = {
  /** Override env `AI_PROVIDER`. */
  kind?: AiProviderKind;
  /** Model id (rank tier resolution should pass this). */
  model?: string;
  timeoutMs?: number;
  completeTimeoutMs?: number;
  /** Test injection */
  fetch?: typeof fetch;
  apiKey?: string;
  baseUrl?: string;
  host?: string;
};

/** Resolve operator-selected provider. Default `ollama` when unset/unknown. */
export function resolveAiProviderKind(
  raw: string | undefined = process.env.AI_PROVIDER,
): AiProviderKind {
  const v = (raw ?? "ollama").trim().toLowerCase();
  if (v === "openai") return "openai";
  if (v === "google" || v === "gemini") return "google";
  return "ollama";
}

function defaultFastModel(kind: AiProviderKind): string {
  switch (kind) {
    case "openai":
      return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    case "google":
      return process.env.GOOGLE_AI_MODEL?.trim() || "gemini-2.0-flash";
    default:
      return process.env.OLLAMA_MODEL?.trim() || "llama3.2";
  }
}

function defaultStandardModel(kind: AiProviderKind): string {
  switch (kind) {
    case "openai":
      return (
        process.env.OPENAI_MODEL_STANDARD?.trim() ||
        process.env.OPENAI_MODEL?.trim() ||
        "gpt-4o"
      );
    case "google":
      return (
        process.env.GOOGLE_AI_MODEL_STANDARD?.trim() ||
        process.env.GOOGLE_AI_MODEL?.trim() ||
        "gemini-2.0-flash"
      );
    default:
      return "llama3.1:8b";
  }
}

/**
 * Model name for a user-selectable rank tier.
 * `RANK_MODEL_FAST` / `RANK_MODEL_STANDARD` always win when set;
 * otherwise defaults depend on `kind` (BYOK provider) or deploy `AI_PROVIDER`.
 */
export function resolveModelForTier(
  tier: "fast" | "standard",
  kind: AiProviderKind = resolveAiProviderKind(),
): string {
  if (tier === "standard") {
    return (
      process.env.RANK_MODEL_STANDARD?.trim() || defaultStandardModel(kind)
    );
  }
  return process.env.RANK_MODEL_FAST?.trim() || defaultFastModel(kind);
}

/**
 * Build a provider for a session user: BYOK cloud key when present, else deploy env.
 */
export function createAiProviderForUser(options: {
  byok?: { provider: "openai" | "google"; apiKey: string } | null;
  model?: string;
  timeoutMs?: number;
  completeTimeoutMs?: number;
}): AiProvider {
  if (options.byok) {
    return createAiProvider({
      kind: options.byok.provider,
      apiKey: options.byok.apiKey,
      model: options.model,
      timeoutMs: options.timeoutMs,
      completeTimeoutMs: options.completeTimeoutMs,
    });
  }
  return createAiProvider({
    model: options.model,
    timeoutMs: options.timeoutMs,
    completeTimeoutMs: options.completeTimeoutMs,
  });
}

/**
 * Construct the deploy-wide AI provider from env (and optional overrides).
 * Used by worker rank and web BFF — never from the browser.
 */
export function createAiProvider(
  options: CreateAiProviderOptions = {},
): AiProvider {
  const kind = options.kind ?? resolveAiProviderKind();
  const shared = {
    model: options.model,
    timeoutMs: options.timeoutMs,
    completeTimeoutMs: options.completeTimeoutMs,
    fetch: options.fetch,
  };

  switch (kind) {
    case "openai": {
      const o: OpenAiProviderOptions = {
        ...shared,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
      };
      return new OpenAiProvider(o);
    }
    case "google": {
      const o: GoogleAiProviderOptions = {
        ...shared,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
      };
      return new GoogleAiProvider(o);
    }
    default: {
      const o: OllamaProviderOptions = {
        host: options.host ?? options.baseUrl,
        model: options.model,
        timeoutMs: options.timeoutMs,
        completeTimeoutMs: options.completeTimeoutMs,
      };
      return new OllamaProvider(o);
    }
  }
}
