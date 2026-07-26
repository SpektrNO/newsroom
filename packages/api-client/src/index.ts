export type HealthCheckStatus = "ok" | "error";

export type HealthResponse = {
  status: "ok" | "degraded" | "error";
  checks: {
    database: HealthCheckStatus;
    ollama: HealthCheckStatus;
  };
  timestamp: string;
};

export type SourceTypeV1 = "hackernews" | "substack";

export type SourceConfig = {
  mode?: "top" | "new";
  rssUrl?: string;
  [key: string]: unknown;
};

export type Source = {
  id: string;
  sourceType: SourceTypeV1;
  config: SourceConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SourcesListResponse = { sources: Source[] };
export type SourceResponse = { source: Source };

export type CreateSourceInput = {
  sourceType: SourceTypeV1 | "bluesky" | string;
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
  sourceType: string;
  externalId: string | null;
};

export type FeedItem = {
  articleId: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  author: string | null;
  publishedAt: string | null;
  sources: FeedSource[];
  keywordScore: number;
  aiScore: number | null;
  finalRank: number;
  reason: string | null;
  nearDuplicateOfArticleId: string | null;
  status: FeedItemStatus;
  scoredAt: string;
};

export type FeedPage = {
  items: FeedItem[];
  nextCursor: string | null;
  /** ISO time of the last completed ingest job, if any. */
  lastIngestAt?: string | null;
  /** ISO time of the latest score write for this user, if any. */
  lastRankedAt?: string | null;
  /** Articles matching current topic/source/status/search filters. */
  matchedCount?: number;
  /** Articles in feed for current status (ignores topic/source/search filters). */
  totalCount?: number;
  /** True when the user is dirty and a catch-up rank was enqueued. */
  needsRank?: boolean;
};

export type ListFeedOptions = {
  cursor?: string;
  /** Single topic id (legacy). Prefer `topics` for multi-select. */
  topic?: string;
  /** Topic ids to include (OR). Omitted / empty = all topics. */
  topics?: string[];
  source?: SourceTypeV1;
  /** When set, only items with this status. When omitted, API excludes dismissed. */
  status?: FeedItemStatus;
  /** Free-text find-in-feed (title / summary / reason). */
  q?: string;
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
};

export type RankFeedLatestResponse = {
  scored: number;
  users: number;
  aiBatches: number;
  aiBatchFailures: number;
};

export type FeedCatalogEntry = {
  id: string;
  label: string;
  rssUrl: string;
  blurb: string;
  topicTags: string[];
};

export type FeedCatalogResponse = {
  version: number;
  feeds: FeedCatalogEntry[];
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
    if (options.source) params.set("source", options.source);
    if (options.status) params.set("status", options.status);
    if (options.q?.trim()) params.set("q", options.q.trim());
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

  /** Run keyword + AI rank for the signed-in user (may take minutes). */
  async rankFeedLatest(): Promise<RankFeedLatestResponse> {
    return this.requestJson("POST", "/api/feed/rank");
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      credentials: "include",
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
