import { createApiClient, type ApiClient } from "@newsroom/api-client";

let browserClient: ApiClient | null = null;

/** Same-origin browser client; cookies via credentials: "include". */
export function getBrowserApiClient(): ApiClient {
  if (!browserClient) {
    browserClient = createApiClient("");
  }
  return browserClient;
}
