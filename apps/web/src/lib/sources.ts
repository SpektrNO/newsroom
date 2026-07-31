import type { SourceSubscriptionConfig } from "@newsroom/db";
import {
  normalizeBlueskyHandle,
  normalizeCanonicalUrl,
  normalizeSubredditName,
  type SourceAdapterId,
  type SourceCategory,
} from "@newsroom/sources";

export type SourceCategoryV1 = SourceCategory;
export type SourceAdapterV1 = SourceAdapterId;

export type SourceJson = {
  id: string;
  category: SourceCategoryV1;
  adapter: SourceAdapterV1;
  config: SourceSubscriptionConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SourceRow = {
  id: string;
  category: string;
  adapter: string;
  config: SourceSubscriptionConfig;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toSourceJson(row: SourceRow): SourceJson {
  return {
    id: row.id,
    category: row.category as SourceCategoryV1,
    adapter: row.adapter as SourceAdapterV1,
    config: row.config ?? {},
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const CATEGORIES: readonly SourceCategoryV1[] = [
  "podcast",
  "website",
  "social_media",
  "community",
  "newsletter",
];

const ADAPTERS: readonly SourceAdapterV1[] = [
  "hackernews",
  "rss",
  "bluesky",
  "reddit",
];

function isCategory(v: unknown): v is SourceCategoryV1 {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

function isAdapter(v: unknown): v is SourceAdapterV1 {
  return typeof v === "string" && (ADAPTERS as readonly string[]).includes(v);
}

function pairAllowed(
  category: SourceCategoryV1,
  adapter: SourceAdapterV1,
): boolean {
  if (adapter === "hackernews") return category === "community";
  if (adapter === "reddit") return category === "community";
  if (adapter === "bluesky") return category === "social_media";
  if (adapter === "rss") {
    return (
      category === "podcast" ||
      category === "website" ||
      category === "community" ||
      category === "newsletter"
    );
  }
  return false;
}

export type ParsedCreate =
  | {
      ok: true;
      category: SourceCategoryV1;
      adapter: SourceAdapterV1;
      config: SourceSubscriptionConfig;
      enabled: boolean;
    }
  | { ok: false; error: string };

export function parseCreateBody(body: unknown): ParsedCreate {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_config" };
  }

  const record = body as Record<string, unknown>;
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

  let category = record.category;
  let adapter = record.adapter;

  // Legacy clients: sourceType → category + adapter
  if (
    !isCategory(category) &&
    !isAdapter(adapter) &&
    typeof record.sourceType === "string"
  ) {
    const legacy: Record<
      string,
      { category: SourceCategoryV1; adapter: SourceAdapterV1 }
    > = {
      hackernews: { category: "community", adapter: "hackernews" },
      substack: { category: "community", adapter: "rss" },
      podcast: { category: "podcast", adapter: "rss" },
      bluesky: { category: "social_media", adapter: "bluesky" },
      reddit: { category: "community", adapter: "reddit" },
    };
    const mapped = legacy[record.sourceType];
    if (!mapped) return { ok: false, error: "unsupported_source_type" };
    category = mapped.category;
    adapter = mapped.adapter;
  }

  if (!isCategory(category) || !isAdapter(adapter)) {
    return { ok: false, error: "unsupported_source_type" };
  }

  if (!pairAllowed(category, adapter)) {
    return { ok: false, error: "unsupported_source_type" };
  }

  if (adapter === "hackernews") {
    const mode = configRaw.mode;
    if (mode !== undefined && mode !== "top" && mode !== "new") {
      return { ok: false, error: "invalid_config" };
    }
    const config: SourceSubscriptionConfig = {};
    if (mode === "top" || mode === "new") {
      config.mode = mode;
    }
    return { ok: true, category, adapter, config, enabled };
  }

  if (adapter === "bluesky") {
    const handleRaw = configRaw.handle;
    if (typeof handleRaw !== "string" || !handleRaw.trim()) {
      return { ok: false, error: "invalid_config" };
    }
    try {
      return {
        ok: true,
        category,
        adapter,
        config: { handle: normalizeBlueskyHandle(handleRaw) },
        enabled,
      };
    } catch {
      return { ok: false, error: "invalid_config" };
    }
  }

  if (adapter === "reddit") {
    const subRaw = configRaw.subreddit;
    if (typeof subRaw !== "string" || !subRaw.trim()) {
      return { ok: false, error: "invalid_config" };
    }
    try {
      return {
        ok: true,
        category,
        adapter,
        config: { subreddit: normalizeSubredditName(subRaw) },
        enabled,
      };
    } catch {
      return { ok: false, error: "invalid_config" };
    }
  }

  const rssUrlRaw = configRaw.rssUrl;
  if (typeof rssUrlRaw !== "string" || !rssUrlRaw.trim()) {
    return { ok: false, error: "invalid_config" };
  }

  try {
    const rssUrl = normalizeCanonicalUrl(rssUrlRaw);
    return {
      ok: true,
      category,
      adapter,
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
  currentAdapter: string,
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

    if (currentAdapter === "hackernews") {
      const mode = configRaw.mode;
      if (mode !== undefined && mode !== "top" && mode !== "new") {
        return { ok: false, error: "invalid_config" };
      }
      const config: SourceSubscriptionConfig = {};
      if (mode === "top" || mode === "new") {
        config.mode = mode;
      }
      result.config = config;
    } else if (currentAdapter === "rss") {
      const rssUrlRaw = configRaw.rssUrl;
      if (typeof rssUrlRaw !== "string" || !rssUrlRaw.trim()) {
        return { ok: false, error: "invalid_config" };
      }
      try {
        result.config = { rssUrl: normalizeCanonicalUrl(rssUrlRaw) };
      } catch {
        return { ok: false, error: "invalid_config" };
      }
    } else if (currentAdapter === "bluesky") {
      const handleRaw = configRaw.handle;
      if (typeof handleRaw !== "string" || !handleRaw.trim()) {
        return { ok: false, error: "invalid_config" };
      }
      try {
        result.config = { handle: normalizeBlueskyHandle(handleRaw) };
      } catch {
        return { ok: false, error: "invalid_config" };
      }
    } else if (currentAdapter === "reddit") {
      const subRaw = configRaw.subreddit;
      if (typeof subRaw !== "string" || !subRaw.trim()) {
        return { ok: false, error: "invalid_config" };
      }
      try {
        result.config = { subreddit: normalizeSubredditName(subRaw) };
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
