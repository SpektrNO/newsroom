import type { SourceSubscriptionConfig } from "@newsroom/db";
import { normalizeCanonicalUrl } from "@newsroom/sources";

export type SourceJson = {
  id: string;
  sourceType: "hackernews" | "substack";
  config: SourceSubscriptionConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SourceRow = {
  id: string;
  sourceType: string;
  config: SourceSubscriptionConfig;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toSourceJson(row: SourceRow): SourceJson {
  return {
    id: row.id,
    sourceType: row.sourceType as "hackernews" | "substack",
    config: row.config ?? {},
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type ParsedCreate =
  | {
      ok: true;
      sourceType: "hackernews" | "substack";
      config: SourceSubscriptionConfig;
      enabled: boolean;
    }
  | { ok: false; error: string };

export function parseCreateBody(body: unknown): ParsedCreate {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_config" };
  }

  const record = body as Record<string, unknown>;
  const sourceType = record.sourceType;
  const enabled =
    record.enabled === undefined ? true : Boolean(record.enabled);
  const configRaw =
    record.config === undefined
      ? {}
      : typeof record.config === "object" && record.config !== null
        ? (record.config as Record<string, unknown>)
        : null;

  if (configRaw === null) {
    return { ok: false, error: "invalid_config" };
  }

  if (sourceType === "bluesky") {
    return { ok: false, error: "unsupported_source_type" };
  }

  if (sourceType !== "hackernews" && sourceType !== "substack") {
    return { ok: false, error: "unsupported_source_type" };
  }

  if (sourceType === "hackernews") {
    const mode = configRaw.mode;
    if (mode !== undefined && mode !== "top" && mode !== "new") {
      return { ok: false, error: "invalid_config" };
    }
    const config: SourceSubscriptionConfig = {};
    if (mode === "top" || mode === "new") {
      config.mode = mode;
    }
    return { ok: true, sourceType, config, enabled };
  }

  const rssUrlRaw = configRaw.rssUrl;
  if (typeof rssUrlRaw !== "string" || !rssUrlRaw.trim()) {
    return { ok: false, error: "invalid_config" };
  }

  try {
    const rssUrl = normalizeCanonicalUrl(rssUrlRaw);
    return {
      ok: true,
      sourceType,
      config: { rssUrl },
      enabled,
    };
  } catch {
    return { ok: false, error: "invalid_config" };
  }
}

export type ParsedPatch =
  | {
      ok: true;
      enabled?: boolean;
      config?: SourceSubscriptionConfig;
    }
  | { ok: false; error: string };

export function parsePatchBody(
  body: unknown,
  currentType: string,
): ParsedPatch {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_config" };
  }

  const record = body as Record<string, unknown>;
  const result: { enabled?: boolean; config?: SourceSubscriptionConfig } = {};

  if (record.enabled !== undefined) {
    if (typeof record.enabled !== "boolean") {
      return { ok: false, error: "invalid_config" };
    }
    result.enabled = record.enabled;
  }

  if (record.config !== undefined) {
    if (typeof record.config !== "object" || record.config === null) {
      return { ok: false, error: "invalid_config" };
    }
    const configRaw = record.config as Record<string, unknown>;

    if (currentType === "hackernews") {
      const mode = configRaw.mode;
      if (mode !== undefined && mode !== "top" && mode !== "new") {
        return { ok: false, error: "invalid_config" };
      }
      const config: SourceSubscriptionConfig = {};
      if (mode === "top" || mode === "new") {
        config.mode = mode;
      }
      result.config = config;
    } else if (currentType === "substack") {
      const rssUrlRaw = configRaw.rssUrl;
      if (typeof rssUrlRaw !== "string" || !rssUrlRaw.trim()) {
        return { ok: false, error: "invalid_config" };
      }
      try {
        result.config = { rssUrl: normalizeCanonicalUrl(rssUrlRaw) };
      } catch {
        return { ok: false, error: "invalid_config" };
      }
    } else {
      return { ok: false, error: "invalid_config" };
    }
  }

  if (result.enabled === undefined && result.config === undefined) {
    return { ok: false, error: "invalid_config" };
  }

  return { ok: true, ...result };
}

export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const cause = "cause" in err ? (err as { cause?: unknown }).cause : err;
  if (!cause || typeof cause !== "object") return false;
  const code = (cause as { code?: string }).code;
  return code === "23505";
}
