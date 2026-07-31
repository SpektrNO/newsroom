import { normalizeCanonicalUrl } from "@newsroom/sources/url";

export type FeedSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const LANGSEARCH_URL = "https://api.langsearch.com/v1/web-search";
const INDEX_FETCH_TIMEOUT_MS = 4_000;

/** Path/query heuristics for likely RSS/Atom feed URLs. */
const FEED_LIKE =
  /(?:^|\/)(?:feed|feeds|rss|atom)(?:\/|$|\.)|\.(?:rss|xml|atom)(?:$|\?)|\/rss\.|\/atom\.|[?&](?:format|type)=(?:rss|atom|xml)/i;

/** Hostname-like token with a TLD (e.g. nrk.no, www.bbc.co.uk). */
const DOMAIN_TOKEN =
  /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(?:\/|\b)/i;

function stripWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * When the user typed a domain (or URL), prefer results on that host and
 * bias LangSearch with a site: operator so aggregators like openrss.org drop out.
 */
export function extractDomainHint(userQuery: string): string | null {
  const q = userQuery.trim();
  if (!q) return null;
  const m = q.match(DOMAIN_TOKEN);
  if (!m?.[1]) return null;
  const host = stripWww(m[1]);
  // Need a real label.tld — reject single-label tokens.
  if (!host.includes(".")) return null;
  return host;
}

export function urlMatchesDomainHint(url: string, hint: string): boolean {
  let host: string;
  try {
    host = stripWww(new URL(url.trim()).hostname);
  } catch {
    return false;
  }
  const h = stripWww(hint);
  return host === h || host.endsWith(`.${h}`);
}

export function buildLangSearchQuery(userQuery: string): string | null {
  const q = userQuery.trim().replace(/\s+/g, " ");
  if (!q) return null;
  const domain = extractDomainHint(q);
  if (domain) {
    // site: keeps results on the publisher; feed hint still helps ranking.
    return `site:${domain} (RSS OR Atom feed)`;
  }
  // Avoid doubling the feed hint when the user already typed it.
  if (/\b(rss|atom)\b/i.test(q) && /\bfeed\b/i.test(q)) {
    return q;
  }
  return `${q} RSS OR Atom feed`;
}

export function isFeedLikeUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  // Common publisher pattern: feed.nrk.no, rss.cnn.com (host label, not path).
  const host = stripWww(parsed.hostname);
  const firstLabel = host.split(".")[0] ?? "";
  if (
    firstLabel === "feed" ||
    firstLabel === "feeds" ||
    firstLabel === "rss" ||
    firstLabel === "atom"
  ) {
    return true;
  }
  const hay = `${parsed.pathname}${parsed.search}`;
  return FEED_LIKE.test(hay);
}

/**
 * Well-known feed URL shapes for a publisher domain. Not fetched here —
 * create/ingest validates; this only surfaces likely candidates when search
 * misses hostnames like https://feed.nrk.no.
 */
export function candidateFeedUrls(domain: string): string[] {
  const d = stripWww(domain);
  if (!d.includes(".")) return [];
  return [
    `https://www.${d}/rss`,
    `https://${d}/rss`,
    `https://feed.${d}`,
    `https://feeds.${d}`,
    `https://rss.${d}`,
    `https://${d}/feed`,
    `https://${d}/atom.xml`,
    `https://www.${d}/feed`,
    `https://www.${d}/atom.xml`,
    `https://www.${d}/toppsaker.rss`,
  ];
}

/** Pull absolute feed-like URLs from an HTML/text index page (e.g. nrk.no/rss). */
export function extractFeedUrlsFromText(
  body: string,
  baseUrl: string,
  domainHint?: string | null,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const consider = (raw: string) => {
    const trimmed = raw.trim().replace(/[),.;]+$/g, "");
    if (!trimmed) return;
    let absolute: string;
    try {
      // Bare host paths like www.nrk.no/sport/toppsaker.rss (no scheme).
      if (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(trimmed)) {
        absolute = new URL(`https://${trimmed}`).toString();
      } else {
        absolute = new URL(trimmed, baseUrl).toString();
      }
    } catch {
      return;
    }
    if (!isFeedLikeUrl(absolute)) return;
    if (domainHint && !urlMatchesDomainHint(absolute, domainHint)) return;
    let canonical: string;
    try {
      canonical = normalizeCanonicalUrl(absolute);
    } catch {
      return;
    }
    if (seen.has(canonical)) return;
    seen.add(canonical);
    found.push(canonical);
  };

  for (const m of body.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    if (m[1]) consider(m[1]);
  }
  // Plain text / bare URLs (NRK lists some without <a href>).
  for (const m of body.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    consider(m[0].replace(/[),.;]+$/g, ""));
  }
  // Relative paths ending in .rss listed as bare text (www.nrk.no/sport/toppsaker.rss).
  for (const m of body.matchAll(
    /(?:^|[\s>])((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\/[^\s"'<>]*\.rss)/gi,
  )) {
    if (m[1]) consider(m[1]);
  }

  return found;
}

function pushHit(
  out: FeedSearchHit[],
  seen: Set<string>,
  url: string,
  title: string,
  snippet: string,
): void {
  if (!isFeedLikeUrl(url)) return;
  let canonical: string;
  try {
    canonical = normalizeCanonicalUrl(url);
  } catch {
    return;
  }
  if (seen.has(canonical)) return;
  seen.add(canonical);
  out.push({ title: title.trim() || canonical, url: canonical, snippet });
}

export function parseFeedSearchBody(
  body: unknown,
):
  | { ok: true; query: string; domainHint: string | null }
  | { ok: false; error: "invalid_query" } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_query" };
  }
  const raw = (body as Record<string, unknown>).query;
  if (typeof raw !== "string") {
    return { ok: false, error: "invalid_query" };
  }
  const built = buildLangSearchQuery(raw);
  if (!built) {
    return { ok: false, error: "invalid_query" };
  }
  return {
    ok: true,
    query: built,
    domainHint: extractDomainHint(raw),
  };
}

type LangSearchPage = {
  name?: unknown;
  url?: unknown;
  snippet?: unknown;
};

type LangSearchResponse = {
  code?: unknown;
  data?: {
    webPages?: {
      value?: LangSearchPage[];
    };
  };
};

export function mapLangSearchResults(
  payload: LangSearchResponse,
  domainHint?: string | null,
): FeedSearchHit[] {
  const pages = payload.data?.webPages?.value;
  const seen = new Set<string>();
  const out: FeedSearchHit[] = [];

  if (domainHint) {
    for (const url of candidateFeedUrls(domainHint)) {
      pushHit(out, seen, url, url, "Common feed URL for this site");
    }
  }

  if (!Array.isArray(pages)) return out;

  for (const page of pages) {
    if (typeof page.url !== "string" || !page.url.trim()) continue;
    if (domainHint && !urlMatchesDomainHint(page.url, domainHint)) continue;
    const title =
      typeof page.name === "string" && page.name.trim()
        ? page.name.trim()
        : page.url;
    const snippet = typeof page.snippet === "string" ? page.snippet : "";
    pushHit(out, seen, page.url, title, snippet);
  }

  return out;
}

/** Index pages that usually list real .rss / Atom links for a publisher. */
export function feedIndexUrls(domain: string): string[] {
  const d = stripWww(domain);
  if (!d.includes(".")) return [];
  return [`https://www.${d}/rss`, `https://${d}/rss`, `https://www.${d}/feeds`];
}

export async function discoverFeedsFromDomainIndexes(opts: {
  domain: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<FeedSearchHit[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? INDEX_FETCH_TIMEOUT_MS;
  const out: FeedSearchHit[] = [];
  const seen = new Set<string>();

  for (const indexUrl of feedIndexUrls(opts.domain)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(indexUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "text/html, application/xhtml+xml, */*;q=0.8",
          "User-Agent": "NewsroomFeedSearch/1.0",
        },
      });
      if (!res.ok) continue;
      const text = await res.text();
      // Always surface the index itself when it looks feed-related.
      pushHit(
        out,
        seen,
        indexUrl,
        indexUrl,
        "Publisher RSS index",
      );
      for (const url of extractFeedUrlsFromText(text, indexUrl, opts.domain)) {
        pushHit(out, seen, url, url, `From ${indexUrl}`);
      }
    } catch {
      // Soft-fail per index page.
    } finally {
      clearTimeout(timer);
    }
  }

  return out;
}

export async function searchFeedsViaLangSearch(opts: {
  query: string;
  apiKey: string;
  domainHint?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; results: FeedSearchHit[] }
  | { ok: false; error: "upstream" }
> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const seen = new Set<string>();
  const out: FeedSearchHit[] = [];

  if (opts.domainHint) {
    for (const url of candidateFeedUrls(opts.domainHint)) {
      pushHit(out, seen, url, url, "Common feed URL for this site");
    }
    const scraped = await discoverFeedsFromDomainIndexes({
      domain: opts.domainHint,
      fetchImpl,
    });
    for (const hit of scraped) {
      pushHit(out, seen, hit.url, hit.title, hit.snippet);
    }
  }

  let res: Response;
  try {
    res = await fetchImpl(LANGSEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: opts.query,
        freshness: "noLimit",
        summary: false,
        count: 10,
      }),
    });
  } catch {
    if (out.length > 0) return { ok: true, results: out };
    return { ok: false, error: "upstream" };
  }

  if (!res.ok) {
    if (out.length > 0) return { ok: true, results: out };
    return { ok: false, error: "upstream" };
  }

  let json: LangSearchResponse;
  try {
    json = (await res.json()) as LangSearchResponse;
  } catch {
    if (out.length > 0) return { ok: true, results: out };
    return { ok: false, error: "upstream" };
  }

  if (json.code !== undefined && json.code !== 200) {
    if (out.length > 0) return { ok: true, results: out };
    return { ok: false, error: "upstream" };
  }

  const pages = json.data?.webPages?.value;
  if (Array.isArray(pages)) {
    for (const page of pages) {
      if (typeof page.url !== "string" || !page.url.trim()) continue;
      if (opts.domainHint && !urlMatchesDomainHint(page.url, opts.domainHint)) {
        continue;
      }
      const title =
        typeof page.name === "string" && page.name.trim()
          ? page.name.trim()
          : page.url;
      const snippet = typeof page.snippet === "string" ? page.snippet : "";
      pushHit(out, seen, page.url, title, snippet);
    }
  }

  return { ok: true, results: out };
}

export function langSearchApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.LANGSEARCH_API_KEY?.trim();
  return key || null;
}
