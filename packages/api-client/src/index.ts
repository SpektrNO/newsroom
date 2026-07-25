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
  keywords: string[];
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
};

export type ListFeedOptions = {
  cursor?: string;
  topic?: string;
  source?: SourceTypeV1;
  /** When set, only items with this status. When omitted, API excludes dismissed. */
  status?: FeedItemStatus;
  limit?: number;
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
    this.fetchImpl = options.fetch ?? fetch;
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
    if (options.topic) params.set("topic", options.topic);
    if (options.source) params.set("source", options.source);
    if (options.status) params.set("status", options.status);
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
