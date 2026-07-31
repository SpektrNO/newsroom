import { normalizeCanonicalUrl } from "@newsroom/sources/url";

export type FeedSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const LANGSEARCH_URL = "https://api.langsearch.com/v1/web-search";

/** Path/query heuristics for likely RSS/Atom feed URLs. */
const FEED_LIKE =
  /(?:^|\/)(?:feed|feeds|rss|atom)(?:\/|$|\.)|\.xml(?:$|\?)|\/rss\.|\/atom\.|[?&](?:format|type)=(?:rss|atom|xml)/i;

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
  const hay = `${parsed.pathname}${parsed.search}`;
  return FEED_LIKE.test(hay);
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
    if (!isFeedLikeUrl(page.url)) continue;
    if (domainHint && !urlMatchesDomainHint(page.url, domainHint)) continue;

    let canonical: string;
    try {
      canonical = normalizeCanonicalUrl(page.url);
    } catch {
      continue;
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    out.push({
      title:
        typeof page.name === "string" && page.name.trim()
          ? page.name.trim()
          : canonical,
      url: canonical,
      snippet: typeof page.snippet === "string" ? page.snippet : "",
    });
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

  return {
    ok: true,
    results: mapLangSearchResults(json, opts.domainHint),
  };
}

export function langSearchApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.LANGSEARCH_API_KEY?.trim();
  return key || null;
}
