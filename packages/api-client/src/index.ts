export type HealthCheckStatus = "ok" | "error";

export type HealthResponse = {
  status: "ok" | "degraded" | "error";
  checks: {
    database: HealthCheckStatus;
    /** Configured AI provider reachability (`AI_PROVIDER`). */
    ai: HealthCheckStatus;
    /**
     * Legacy alias of `ai` (same value). Kept for older clients that still
     * read `checks.ollama`.
     */
    ollama: HealthCheckStatus;
  };
  /** Operator-selected backend: ollama | openai | google */
  aiProvider?: "ollama" | "openai" | "google";
  timestamp: string;
};

export type SourceCategoryV1 =
  | "podcast"
  | "website"
  | "social_media"
  | "community"
  | "newsletter";

export type SourceAdapterV1 =
  | "hackernews"
  | "rss"
  | "bluesky"
  | "reddit";

/** @deprecated Use SourceCategoryV1 / SourceAdapterV1. */
export type SourceTypeV1 = SourceAdapterV1 | "substack" | "podcast";

export type SourceConfig = {
  mode?: "top" | "new";
  rssUrl?: string;
  handle?: string;
  did?: string;
  subreddit?: string;
  [key: string]: unknown;
};

export type Source = {
  id: string;
  category: SourceCategoryV1;
  adapter: SourceAdapterV1;
  config: SourceConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SourcesListResponse = { sources: Source[] };
export type SourceResponse = { source: Source };

export type CreateSourceInput = {
  category: SourceCategoryV1 | string;
  adapter: SourceAdapterV1 | string;
  config?: SourceConfig;
  enabled?: boolean;
};

export type PatchSourceInput = {
  enabled?: boolean;
  config?: SourceConfig;
};

export type Topic = {
  id: string;
  name: string;
  keywords: string[];
  weight: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TopicsListResponse = { topics: Topic[] };
export type TopicResponse = { topic: Topic };

export type TopicTreeNode = {
  id: string;
  parentId: string | null;
  label: string;
  selectable: boolean;
};

export type TopicTreeResponse = {
  version: number;
  nodes: TopicTreeNode[];
};

export type CreateTopicInput = {
  name: string;
  /** Empty allowed — follow now, add keywords later. */
  keywords?: string[];
  weight?: number;
  enabled?: boolean;
};

export type PatchTopicInput = {
  name?: string;
  keywords?: string[];
  weight?: number;
  enabled?: boolean;
};

export type FeedItemStatus = "new" | "seen" | "saved" | "dismissed";

export type FeedSource = {
  category: string;
  adapter?: string;
  externalId: string | null;
  /** Short subscription identity (host, handle, HN mode, …). */
  label?: string | null;
};

export type FeedItem = {
  articleId: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  author: string | null;
  publishedAt: string | null;
  showTitle: string | null;
  durationSeconds: number | null;
  enclosureUrl: string | null;
  sources: FeedSource[];
  keywordScore: number;
  aiScore: number | null;
  finalRank: number;
  reason: string | null;
  /**
   * AI-narrowed topic ids this article belongs to (`[]` = none confirmed).
   * `null` on legacy rows scored before membership was stored.
   */
  matchedTopicIds: string[] | null;
  nearDuplicateOfArticleId: string | null;
  status: FeedItemStatus;
  scoredAt: string;
};

export type FeedPage = {
  items: FeedItem[];
  nextCursor: string | null;
  /** ISO time of the last completed ingest job, if any. */
  lastIngestAt?: string | null;
  /**
   * ISO time of the last completed rank pass for this user (job finished_at),
   * falling back to latest score write when no completed rank jobs remain.
   */
  lastRankedAt?: string | null;
  /** Articles matching current topic/source/status/search filters. */
  matchedCount?: number;
  /**
   * Ranked articles in feed for current status
   * (score rows; ignores topic/source/search filters).
   */
  totalCount?: number;
  /** Alias for totalCount — score rows (ranked into the feed). */
  rankedCount?: number;
  /** Keyword-evaluated articles (hits + misses) for enabled sources. */
  evaluatedCount?: number;
  /** Distinct articles available via enabled subscriptions. */
  articlesCount?: number;
  /** True when the user is dirty and a catch-up rank was enqueued. */
  needsRank?: boolean;
};

export type ListFeedOptions = {
  cursor?: string;
  /** Single topic id (legacy). Prefer `topics` for multi-select. */
  topic?: string;
  /** Topic ids to include (OR). Omitted / empty = all topics. */
  topics?: string[];
  /** Topic ids to exclude (NOT any). Applied after includes. */
  excludeTopics?: string[];
  /** Single source category (legacy). Prefer `sources` for multi-select. */
  source?: SourceCategoryV1;
  /** Source categories to include (OR). Omitted / empty = all source types. */
  sources?: SourceCategoryV1[];
  /** Single subscription id. Omitted / empty = all sources. */
  sourceId?: string;
  /** When set, only items with this status. When omitted, API returns `new`/`seen` only (not saved/dismissed). */
  status?: FeedItemStatus;
  /** Free-text find-in-feed (title / summary / reason). */
  q?: string;
  /** `score` (final rank, default) or `date` (publishedAt). */
  sort?: "score" | "date";
  /** `desc` (default) or `asc`. */
  order?: "asc" | "desc";
  limit?: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSuggestion = {
  topicLabel: string;
  keywords: string[];
  rationale: string;
  inCatalog: boolean;
};

export type ChatRequest = {
  messages: ChatMessage[];
};

export type ChatResponse = {
  reply: string;
  suggestions: ChatSuggestion[];
  tokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimated: boolean;
  };
  aiUsage?: {
    used: number;
    limit: number;
    softExceeded: boolean;
    hardExceeded: boolean;
  };
};

export type AiUsageResponse = {
  day: string;
  used: number;
  limit: number;
  softLimit: number;
  byPurpose: {
    rank: number;
    chat: number;
    other: number;
  };
  softExceeded: boolean;
  hardExceeded: boolean;
  rankAi?: {
    used: number;
    dayLimit: number;
    runLimit: number;
    remaining: number;
    globalUsed: number;
    globalLimit: number;
  };
};

/** AI model tier for ranking: "none" skips AI entirely (keyword-only). */
export type RankModelTier = "none" | "fast" | "standard";

export type RankModelSettingResponse = {
  tier: RankModelTier;
};

/** Keep-N overflow: drop lowest final_rank or oldest scored_at. */
export type ScoreKeepPolicy = "rank" | "age";

export type ScoreKeepSettingResponse = {
  keepTopN: number;
  policy: ScoreKeepPolicy;
};

export type AiCredentialProvider = "openai" | "google";

export type AiCredentialsResponse = {
  configured: boolean;
  byokEnabled: boolean;
  provider: AiCredentialProvider | null;
  keyHint: string | null;
};

export type AiCredentialsPutRequest = {
  provider: AiCredentialProvider;
  apiKey: string;
};

export type RankFeedLatestResponse = {
  scored: number;
  evaluated: number;
  /** Articles that got an Ollama AI score this run. */
  aiScored: number;
  /** Hits left on keyword-only scores (AI day/run/token budget). */
  aiSkipped: number;
  users: number;
  aiBatches: number;
  aiBatchFailures: number;
};

export type WipeFeedRankingsResponse = {
  scoresDeleted: number;
  evaluationsDeleted: number;
};

export type FeedCatalogCategory =
  | "websites"
  | "communities"
  | "newsletters"
  | "podcasts"
  | "social_media";

export type FeedCatalogEntry = {
  id: string;
  label: string;
  blurb: string;
  category: FeedCatalogCategory;
  topicTags: string[];
  kind?: "feed" | "reddit" | "podcast" | "bluesky";
  rssUrl?: string;
  subreddit?: string;
  handle?: string;
};

export type FeedCatalogResponse = {
  version: number;
  feeds: FeedCatalogEntry[];
};

export type FeedSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type FeedSearchResponse = {
  results: FeedSearchHit[];
};

export type FeedSearchRequest = {
  query: string;
};

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`API ${status}: ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    // Detached `fetch` throws "Illegal invocation" in browsers; keep `this` bound.
    this.fetchImpl =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async health(): Promise<HealthResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/health`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`health failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as HealthResponse;
  }

  async listSources(): Promise<SourcesListResponse> {
    return this.requestJson("GET", "/api/sources");
  }

  async createSource(input: CreateSourceInput): Promise<SourceResponse> {
    return this.requestJson("POST", "/api/sources", input);
  }

  async patchSource(
    id: string,
    input: PatchSourceInput,
  ): Promise<SourceResponse> {
    return this.requestJson("PATCH", `/api/sources/${encodeURIComponent(id)}`, input);
  }

  async deleteSource(id: string): Promise<void> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/sources/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (res.status === 204) return;
    await this.throwApiError(res);
  }

  async listTopics(): Promise<TopicsListResponse> {
    return this.requestJson("GET", "/api/topics");
  }

  async listTopicTree(): Promise<TopicTreeResponse> {
    return this.requestJson("GET", "/api/topic-tree");
  }

  async listFeedCatalog(): Promise<FeedCatalogResponse> {
    return this.requestJson("GET", "/api/feed-catalog");
  }

  /** Discover RSS/Atom feed URLs via BFF → LangSearch (never call LangSearch from the browser). */
  async searchFeeds(input: FeedSearchRequest): Promise<FeedSearchResponse> {
    return this.requestJson("POST", "/api/feed-search", input);
  }

  /**
   * Create a per-user topic. Also the one-click catalog Follow path:
   * `{ name: label, keywords: [label], weight: 1, enabled: true }`.
   */
  async createTopic(input: CreateTopicInput): Promise<TopicResponse> {
    return this.requestJson("POST", "/api/topics", input);
  }

  async patchTopic(id: string, input: PatchTopicInput): Promise<TopicResponse> {
    return this.requestJson(
      "PATCH",
      `/api/topics/${encodeURIComponent(id)}`,
      input,
    );
  }

  async deleteTopic(id: string): Promise<void> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/topics/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (res.status === 204) return;
    await this.throwApiError(res);
  }

  async listFeed(options: ListFeedOptions = {}): Promise<FeedPage> {
    const params = new URLSearchParams();
    if (options.cursor) params.set("cursor", options.cursor);
    const topicIds = [
      ...(options.topics ?? []),
      ...(options.topic ? [options.topic] : []),
    ].filter(Boolean);
    for (const id of topicIds) {
      params.append("topic", id);
    }
    for (const id of options.excludeTopics ?? []) {
      if (id) params.append("excludeTopic", id);
    }
    const sourceCategories = [
      ...(options.sources ?? []),
      ...(options.source ? [options.source] : []),
    ].filter(Boolean);
    for (const category of sourceCategories) {
      params.append("source", category);
    }
    if (options.sourceId?.trim()) {
      params.set("sourceId", options.sourceId.trim());
    }
    if (options.status) params.set("status", options.status);
    if (options.q?.trim()) params.set("q", options.q.trim());
    if (options.sort) params.set("sort", options.sort);
    if (options.order) params.set("order", options.order);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.requestJson("GET", qs ? `/api/feed?${qs}` : "/api/feed");
  }

  async markFeedSeen(articleId: string): Promise<{ item: FeedItem }> {
    return this.requestJson(
      "POST",
      `/api/feed/${encodeURIComponent(articleId)}/seen`,
    );
  }

  async markFeedSaved(articleId: string): Promise<{ item: FeedItem }> {
    return this.requestJson(
      "POST",
      `/api/feed/${encodeURIComponent(articleId)}/saved`,
    );
  }

  async markFeedDismissed(articleId: string): Promise<{ item: FeedItem }> {
    return this.requestJson(
      "POST",
      `/api/feed/${encodeURIComponent(articleId)}/dismissed`,
    );
  }

  async postChat(input: ChatRequest): Promise<ChatResponse> {
    return this.requestJson("POST", "/api/chat", input);
  }

  async getAiUsage(): Promise<AiUsageResponse> {
    return this.requestJson("GET", "/api/ai-usage");
  }

  async getRankModelSetting(): Promise<RankModelSettingResponse> {
    return this.requestJson("GET", "/api/settings/rank-model");
  }

  async setRankModelSetting(
    tier: RankModelTier,
  ): Promise<RankModelSettingResponse> {
    return this.requestJson("PATCH", "/api/settings/rank-model", { tier });
  }

  async getScoreKeepSetting(): Promise<ScoreKeepSettingResponse> {
    return this.requestJson("GET", "/api/settings/score-keep");
  }

  async setScoreKeepSetting(input: {
    keepTopN: number;
    policy: ScoreKeepPolicy;
  }): Promise<ScoreKeepSettingResponse> {
    return this.requestJson("PATCH", "/api/settings/score-keep", input);
  }

  async getAiCredentials(): Promise<AiCredentialsResponse> {
    return this.requestJson("GET", "/api/settings/ai-credentials");
  }

  async putAiCredentials(
    input: AiCredentialsPutRequest,
  ): Promise<AiCredentialsResponse> {
    return this.requestJson("PUT", "/api/settings/ai-credentials", input);
  }

  async deleteAiCredentials(): Promise<AiCredentialsResponse> {
    return this.requestJson("DELETE", "/api/settings/ai-credentials");
  }

  /** Run keyword + AI rank for the signed-in user (may take minutes). */
  async rankFeedLatest(options?: {
    signal?: AbortSignal;
  }): Promise<RankFeedLatestResponse> {
    return this.requestJson("POST", "/api/feed/rank", undefined, options?.signal);
  }

  /** Clear new/seen rankings; keep saved/dismissed. Does not auto re-rank. */
  async wipeFeedRankings(): Promise<WipeFeedRankingsResponse> {
    return this.requestJson("POST", "/api/feed/wipe-rankings");
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      credentials: "include",
      signal,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      await this.throwApiError(res);
    }

    return (await res.json()) as T;
  }

  private async throwApiError(res: Response): Promise<never> {
    let code = res.statusText || "error";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) code = data.error;
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, code);
  }
}

export function createApiClient(baseUrl: string): ApiClient {
  return new ApiClient({ baseUrl });
}
