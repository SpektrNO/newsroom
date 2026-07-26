import Parser from "rss-parser";
import { normalizeCanonicalUrl } from "./url.js";

export type RssFeedItem = Parser.Item & {
  itunesDuration?: string;
  itunesAuthor?: string;
  author?: string;
};

export type ParsedRssFeed = {
  title?: string;
  itunesAuthor?: string;
  items: RssFeedItem[];
};

export type FetchRssOptions = {
  fetch?: typeof fetch;
  /** Error prefix when HTTP fails (e.g. podcast_fetch_failed). */
  fetchErrorPrefix?: string;
};

/**
 * Fetch and parse an RSS/Atom URL with common podcast custom fields.
 */
export async function fetchAndParseRss(
  rssUrl: string,
  options: FetchRssOptions = {},
): Promise<ParsedRssFeed> {
  const fetchImpl = options.fetch ?? fetch;
  const prefix = options.fetchErrorPrefix ?? "rss_fetch_failed";
  const parser = new Parser({
    timeout: 15_000,
    customFields: {
      feed: ["itunes:author"],
      item: ["itunes:duration", "itunes:author"],
    },
  });

  const res = await fetchImpl(rssUrl, {
    headers: {
      accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) {
    throw new Error(`${prefix}:${res.status}`);
  }

  const xml = await res.text();
  const feed = await parser.parseString(xml);
  const feedRec = feed as Parser.Output<RssFeedItem> & {
    itunesAuthor?: string;
    "itunes:author"?: string;
  };
  return {
    title: feed.title,
    itunesAuthor: feedRec.itunesAuthor ?? feedRec["itunes:author"],
    items: (feed.items ?? []).map((item) => {
      const rec = item as RssFeedItem & {
        "itunes:duration"?: string;
        "itunes:author"?: string;
      };
      return {
        ...rec,
        itunesDuration: rec.itunesDuration ?? rec["itunes:duration"],
        itunesAuthor: rec.itunesAuthor ?? rec["itunes:author"],
      };
    }),
  };
}

/** Parse itunes:duration / similar into non-negative whole seconds. */
export function parseDurationSeconds(
  raw: string | number | undefined | null,
): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return undefined;
    return Math.floor(raw);
  }
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.floor(n);
  }

  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return undefined;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return undefined;

  if (nums.length === 3) {
    const [h, m, s] = nums as [number, number, number];
    return Math.floor(h * 3600 + m * 60 + s);
  }
  const [m, s] = nums as [number, number];
  return Math.floor(m * 60 + s);
}

export function enclosureUrlFromItem(item: RssFeedItem): string | undefined {
  const url = item.enclosure?.url?.trim();
  if (!url) return undefined;
  try {
    return normalizeCanonicalUrl(url);
  } catch {
    return undefined;
  }
}
