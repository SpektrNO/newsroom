/**
 * Canonical URL policy (ingest + subscriptions):
 * - Parse as absolute URL; reject non-http(s)
 * - Lowercase host
 * - Strip hash fragment
 * - Drop default ports (:80 / :443)
 * - No trailing slash on path except for origin root `/`
 * - Preserve query string as-is (case-sensitive)
 */
export function normalizeCanonicalUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error("invalid_url");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("invalid_url");
  }

  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();

  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}
