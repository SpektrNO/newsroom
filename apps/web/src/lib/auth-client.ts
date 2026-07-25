import { createAuthClient } from "better-auth/react";

/**
 * Prefer the page origin so cookies stay on the same host the UI is using
 * (localhost vs 127.0.0.1 vs WSL hostname). Fall back to env for SSR.
 */
function resolveAuthBaseUrl(): string | undefined {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return (
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL
  );
}

export const authClient = createAuthClient({
  baseURL: resolveAuthBaseUrl(),
});
