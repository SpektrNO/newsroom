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
