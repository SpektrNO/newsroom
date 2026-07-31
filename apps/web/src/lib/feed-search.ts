import { normalizeCanonicalUrl } from "@newsroom/sources/url";

export type FeedSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const LANGSEARCH_URL = "https://api.langsearch.com/v1/web-search";
const INDEX_FETCH_TIMEOUT_MS = 4_000;

/** Path/query heuristics for likely RSS/Atom feed URLs (filter only — never invent). */
const FEED_LIKE =
  /(?:^|\/)(?:feed|feeds|rss|atom)(?:\/|$|\.)|\.(?:rss|xml|atom)(?:$|\?)|\/rss\.|\/atom\.|[?&](?:format|type)=(?:rss|atom|xml)/i;

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
 * Upstream LangSearch query. Domains use "<domain> feed" — no invented path list.
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

/** HTML directory pages (e.g. /rss) — not a single .rss/.xml file. */
export function looksLikeFeedIndexUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  const path = parsed.pathname.toLowerCase();
  if (/\.(?:rss|xml|atom)$/i.test(path)) return false;
  return /(?:^|\/)(?:rss|feeds?)(?:\/|$)/i.test(path);
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
  for (const m of body.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    consider(m[0].replace(/[),.;]+$/g, ""));
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

/** Fetch LangSearch-returned index pages and expand linked feeds. */
export async function discoverFeedsFromIndexPages(opts: {
  indexUrls: readonly string[];
  domainHint?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<FeedSearchHit[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? INDEX_FETCH_TIMEOUT_MS;
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
      pushHit(out, seen, indexUrl, indexUrl, "Publisher RSS index");
      for (const url of extractFeedUrlsFromText(
        text,
        indexUrl,
        opts.domainHint,
      )) {
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
    return { ok: false, error: "upstream" };
  }

  if (!res.ok) {
    return { ok: false, error: "upstream" };
  }

  let json: LangSearchResponse;
  try {
    json = (await res.json()) as LangSearchResponse;
  } catch {
    return { ok: false, error: "upstream" };
  }

  if (json.code !== undefined && json.code !== 200) {
    return { ok: false, error: "upstream" };
  }

  const seen = new Set<string>();
  const out: FeedSearchHit[] = [];
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
