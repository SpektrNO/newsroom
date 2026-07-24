export type HealthCheckStatus = "ok" | "error";

export type HealthResponse = {
  status: "ok" | "degraded" | "error";
  checks: {
    database: HealthCheckStatus;
    ollama: HealthCheckStatus;
  };
  timestamp: string;
};

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
};

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
}

export function createApiClient(baseUrl: string): ApiClient {
  return new ApiClient({ baseUrl });
}
