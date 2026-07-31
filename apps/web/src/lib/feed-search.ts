import { normalizeCanonicalUrl } from "@newsroom/sources/url";

export type FeedSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const LANGSEARCH_URL = "https://api.langsearch.com/v1/web-search";
const FETCH_TIMEOUT_MS = 4_000;

/** Path/query heuristics for likely RSS/Atom feed URLs (filter only — never invent). */
const FEED_LIKE =
  /(?:^|\/)(?:feed|feeds|rss|atom)(?:\/|$|\.)|\.(?:rss|xml|atom)(?:$|\?)|\/rss\.|\/atom\.|rss[-_]?feeds?|[?&](?:format|type)=(?:rss|atom|xml)/i;

/** Hostname-like token with a TLD (e.g. nrk.no, www.bbc.co.uk). */
const DOMAIN_TOKEN =
  /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(?:\/|\b)/i;

function stripWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * When the user typed a domain (or URL), prefer results on that host so
 * aggregators like openrss.org drop out.
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

/** True when the typed query is essentially just a host (or URL to that host). */
function queryIsBareDomain(userQuery: string, domain: string): boolean {
  const stripped = userQuery
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
  return stripped === domain;
}

/**
 * Upstream LangSearch query. Domains use "<domain> feed".
 * Homepage `<link rel="alternate">` discovery is the primary path for publishers
 * LangSearch fails to index (e.g. wired.com).
 */
export function buildLangSearchQuery(userQuery: string): string | null {
  const q = userQuery.trim().replace(/\s+/g, " ");
  if (!q) return null;
  const domain = extractDomainHint(q);
  if (domain && queryIsBareDomain(q, domain)) {
    return `${domain} feed`;
  }
  if (/\bfeed\b/i.test(q)) {
    return q;
  }
  return `${q} feed`;
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
  // feed.example.com / rss.example.com host labels.
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
 * HTML directory pages worth expanding — not concrete feeds like /feed/rss.
 */
export function looksLikeFeedIndexUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (/\.(?:rss|xml|atom)$/i.test(path)) return false;
  // Condé Nast / similar: /feed/rss or /feed/category/.../rss are feeds, not indexes.
  if (/\/feed\/.+/i.test(path)) return false;
  if (/rss[-_]?feeds?/i.test(path)) return true;
  return path === "/rss" || path === "/feed" || path === "/feeds" || path === "/atom";
}

function canonicalizeUrl(url: string): string | null {
  try {
    return normalizeCanonicalUrl(url);
  } catch {
    return null;
  }
}

function resolveUrl(
  raw: string,
  baseUrl: string,
  domainHint?: string | null,
): string | null {
  const trimmed = raw.trim().replace(/[),.;]+$/g, "");
  if (!trimmed) return null;
  let absolute: string;
  try {
    if (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(trimmed)) {
      absolute = new URL(`https://${trimmed}`).toString();
    } else {
      absolute = new URL(trimmed, baseUrl).toString();
    }
  } catch {
    return null;
  }
  if (domainHint && !urlMatchesDomainHint(absolute, domainHint)) return null;
  return canonicalizeUrl(absolute);
}

/** `<link rel="alternate" type="application/rss+xml|atom+xml" href="…">` */
export function extractAlternateFeedLinks(
  html: string,
  baseUrl: string,
  domainHint?: string | null,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\brel\s*=\s*["'][^"']*\balternate\b/i.test(tag)) continue;
    if (!/\btype\s*=\s*["']application\/(?:rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const canonical = resolveUrl(href, baseUrl, domainHint);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    found.push(canonical);
  }
  return found;
}

/** Links that look like publisher RSS directory pages. */
export function extractFeedIndexLinks(
  html: string,
  baseUrl: string,
  domainHint?: string | null,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1];
    if (!href) continue;
    const absolute = resolveUrl(href, baseUrl, domainHint);
    if (!absolute || !looksLikeFeedIndexUrl(absolute)) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    found.push(absolute);
  }
  return found;
}

/** Pull absolute feed-like URLs from an HTML/text index page. */
export function extractFeedUrlsFromText(
  body: string,
  baseUrl: string,
  domainHint?: string | null,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const consider = (raw: string) => {
    const absolute = resolveUrl(raw, baseUrl, domainHint);
    if (!absolute || !isFeedLikeUrl(absolute) || seen.has(absolute)) return;
    seen.add(absolute);
    found.push(absolute);
  };

  for (const m of body.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    if (m[1]) consider(m[1]);
  }
  for (const m of body.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    consider(m[0]);
  }
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
  const canonical = canonicalizeUrl(url);
  if (!canonical || seen.has(canonical)) return;
  seen.add(canonical);
  out.push({ title: title.trim() || canonical, url: canonical, snippet });
}

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html, application/xhtml+xml, */*;q=0.8",
        "User-Agent": "NewsroomFeedSearch/1.0",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Discover feeds the standard way: publisher homepage
 * `<link rel="alternate" type="application/rss+xml">`, then expand any
 * RSS directory pages linked from that homepage.
 */
export async function discoverFeedsFromPublisherSite(opts: {
  domain: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<FeedSearchHit[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const d = stripWww(opts.domain);
  const out: FeedSearchHit[] = [];
  const seen = new Set<string>();
  const indexUrls = new Set<string>();

  for (const origin of [`https://www.${d}/`, `https://${d}/`]) {
    const html = await fetchText(origin, fetchImpl, timeoutMs);
    if (!html) continue;

    for (const url of extractAlternateFeedLinks(html, origin, d)) {
      pushHit(out, seen, url, url, `From ${origin}`);
    }
    for (const indexUrl of extractFeedIndexLinks(html, origin, d)) {
      indexUrls.add(indexUrl);
    }
  }

  for (const indexUrl of indexUrls) {
    const html = await fetchText(indexUrl, fetchImpl, timeoutMs);
    if (!html) continue;
    pushHit(out, seen, indexUrl, indexUrl, "Publisher RSS index");
    for (const url of extractFeedUrlsFromText(html, indexUrl, d)) {
      pushHit(out, seen, url, url, `From ${indexUrl}`);
    }
  }

  return out;
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
  if (!Array.isArray(pages)) return [];

  const seen = new Set<string>();
  const out: FeedSearchHit[] = [];

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

/** Fetch known index pages and expand linked feeds. */
export async function discoverFeedsFromIndexPages(opts: {
  indexUrls: readonly string[];
  domainHint?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<FeedSearchHit[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const out: FeedSearchHit[] = [];
  const seen = new Set<string>();

  for (const indexUrl of opts.indexUrls) {
    if (!looksLikeFeedIndexUrl(indexUrl)) continue;
    if (
      opts.domainHint &&
      !urlMatchesDomainHint(indexUrl, opts.domainHint)
    ) {
      continue;
    }

    const text = await fetchText(indexUrl, fetchImpl, timeoutMs);
    if (!text) continue;
    pushHit(out, seen, indexUrl, indexUrl, "Publisher RSS index");
    for (const url of extractFeedUrlsFromText(
      text,
      indexUrl,
      opts.domainHint,
    )) {
      pushHit(out, seen, url, url, `From ${indexUrl}`);
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

  // 1) Publisher homepage / RSS directory (works when LangSearch is useless).
  if (opts.domainHint) {
    const discovered = await discoverFeedsFromPublisherSite({
      domain: opts.domainHint,
      fetchImpl,
    });
    for (const hit of discovered) {
      pushHit(out, seen, hit.url, hit.title, hit.snippet);
    }
  }

  // 2) LangSearch — soft-fail if homepage discovery already found feeds.
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

  const indexUrls: string[] = [];
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
      if (looksLikeFeedIndexUrl(page.url)) {
        indexUrls.push(page.url);
      }
    }
  }

  if (indexUrls.length > 0) {
    const scraped = await discoverFeedsFromIndexPages({
      indexUrls,
      domainHint: opts.domainHint,
      fetchImpl,
    });
    for (const hit of scraped) {
      pushHit(out, seen, hit.url, hit.title, hit.snippet);
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
