import { isUniqueViolation } from "./sources";
import { resolveSelectableTopicLabel } from "./topic-tree";

export { isUniqueViolation };

const MAX_KEYWORDS = 50;
const MAX_KEYWORD_LEN = 64;
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 10;

export type TopicJson = {
  id: string;
  name: string;
  keywords: string[];
  weight: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Body for one-click Follow from a catalog leaf (POST /api/topics). */
export type FollowTopicDefaults = {
  name: string;
  keywords: string[];
  weight: number;
  enabled: boolean;
};

/**
 * Normative create payload when following a curated catalog leaf:
 * name = label, keywords = [label], weight = 1, enabled = true.
 */
export function followDefaultsForLabel(label: string): FollowTopicDefaults {
  const name = label.trim();
  return {
    name,
    keywords: [name],
    weight: 1,
    enabled: true,
  };
}

/** Case-insensitive match of a catalog leaf label to a user topic name. */
export function isFollowingLabel(
  topics: ReadonlyArray<{ name: string }>,
  label: string,
): boolean {
  const needle = label.trim().toLowerCase();
  if (!needle) return false;
  return topics.some((t) => t.name.trim().toLowerCase() === needle);
}

/** Find the signed-in user's topic row for a catalog leaf label, if any. */
export function findTopicByLabel<T extends { name: string }>(
  topics: ReadonlyArray<T>,
  label: string,
): T | undefined {
  const needle = label.trim().toLowerCase();
  if (!needle) return undefined;
  return topics.find((t) => t.name.trim().toLowerCase() === needle);
}

export type TopicRow = {
  id: string;
  name: string;
  keywords: string[];
  weight: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toTopicJson(row: TopicRow): TopicJson {
  return {
    id: row.id,
    name: row.name,
    keywords: row.keywords ?? [],
    weight: row.weight,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeKeywords(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_KEYWORD_LEN) return null;
    out.push(trimmed);
    if (out.length > MAX_KEYWORDS) return null;
  }
  return out;
}

function clampWeight(n: number): number {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, n));
}

/** Accept JSON numbers or numeric strings from clients. */
function parseWeightValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampWeight(raw);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return clampWeight(n);
  }
  return null;
}

export type ParsedTopicCreate =
  | {
      ok: true;
      name: string;
      keywords: string[];
      weight: number;
      enabled: boolean;
    }
  | { ok: false; error: string };

export function parseTopicCreateBody(body: unknown): ParsedTopicCreate {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_topic" };
  }
  const record = body as Record<string, unknown>;

  if (typeof record.name !== "string" || !record.name.trim()) {
    return { ok: false, error: "invalid_topic" };
  }
  const name = resolveSelectableTopicLabel(record.name);
  if (!name) {
    return { ok: false, error: "invalid_topic" };
  }

  const keywords = normalizeKeywords(record.keywords);
  if (keywords === null || keywords.length === 0) {
    return { ok: false, error: "invalid_topic" };
  }

  let weight = 1;
  if (record.weight !== undefined) {
    const parsedWeight = parseWeightValue(record.weight);
    if (parsedWeight === null) {
      return { ok: false, error: "invalid_topic" };
    }
    weight = parsedWeight;
  }

  const enabled =
    record.enabled === undefined ? true : Boolean(record.enabled);

  if (enabled && keywords.length === 0) {
    return { ok: false, error: "invalid_topic" };
  }

  return { ok: true, name, keywords, weight, enabled };
}

export type ParsedTopicPatch =
  | {
      ok: true;
      name?: string;
      keywords?: string[];
      weight?: number;
      enabled?: boolean;
    }
  | { ok: false; error: string };

export function parseTopicPatchBody(body: unknown): ParsedTopicPatch {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_topic" };
  }
  const record = body as Record<string, unknown>;
  const result: {
    name?: string;
    keywords?: string[];
    weight?: number;
    enabled?: boolean;
  } = {};

  if (record.name !== undefined) {
    if (typeof record.name !== "string" || !record.name.trim()) {
      return { ok: false, error: "invalid_topic" };
    }
    const name = resolveSelectableTopicLabel(record.name);
    if (!name) {
      return { ok: false, error: "invalid_topic" };
    }
    result.name = name;
  }

  if (record.keywords !== undefined) {
    const keywords = normalizeKeywords(record.keywords);
    if (keywords === null || keywords.length === 0) {
      return { ok: false, error: "invalid_topic" };
    }
    result.keywords = keywords;
  }

  if (record.weight !== undefined) {
    const parsedWeight = parseWeightValue(record.weight);
    if (parsedWeight === null) {
      return { ok: false, error: "invalid_topic" };
    }
    result.weight = parsedWeight;
  }

  if (record.enabled !== undefined) {
    if (typeof record.enabled !== "boolean") {
      return { ok: false, error: "invalid_topic" };
    }
    result.enabled = record.enabled;
  }

  if (
    result.name === undefined &&
    result.keywords === undefined &&
    result.weight === undefined &&
    result.enabled === undefined
  ) {
    return { ok: false, error: "invalid_topic" };
  }

  return { ok: true, ...result };
}
