import type { NormalizedArticle, SourceAdapter } from "./types.js";
import { normalizeCanonicalUrl } from "./url.js";
import { hashArticleContent } from "./hash.js";

/**
 * Max IDs taken from *each* Firebase list (`topstories` / `newstories`)
 * per `fetchRecent`. Union is deduped, so story hydrations are ≤ 2× this.
 * Stories with no body may trigger one extra `kids[0]` fetch (OP comment).
 */
export const HN_FETCH_LIMIT = 100;

const HN_BASE = "https://hacker-news.firebaseio.com/v0";

/**
 * Legacy config. Ingest always pulls both top and new; `mode` is ignored
 * for fetching (kept so existing subscription JSON stays valid).
 */
export type HackerNewsConfig = {
  mode?: "top" | "new";
};

export type HackerNewsAdapterOptions = {
  fetch?: typeof fetch;
  /** Override per-list batch cap (tests). Still capped at HN_FETCH_LIMIT. */
  limit?: number;
};

type HnItem = {
  id: number;
  deleted?: boolean;
  type?: string;
  by?: string;
  time?: number;
  text?: string;
  dead?: boolean;
  url?: string;
  title?: string;
  score?: number;
  kids?: number[];
};

/**
 * Hacker News via Firebase API:
 * - Candidate IDs from `/v0/topstories.json` **and** `/v0/newstories.json`
 * - Hydrate each via `/v0/item/{id}.json`
 * - When a story has no `text`, optionally hydrate `kids[0]` if it is an OP
 *   comment and use that plain text as `summary` (common clarifications).
 * Algolia HN Search is not used (Firebase alone is enough for v1 determinism).
 */
export class HackerNewsAdapter implements SourceAdapter {
  readonly type = "hackernews" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly limit: number;

  constructor(
    _config: HackerNewsConfig = {},
    options: HackerNewsAdapterOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.limit = Math.min(
      Math.max(1, options.limit ?? HN_FETCH_LIMIT),
      HN_FETCH_LIMIT,
    );
  }

  private async fetchStoryIds(listPath: string): Promise<number[]> {
    const listRes = await this.fetchImpl(`${HN_BASE}/${listPath}`);
    if (!listRes.ok) {
      throw new Error(`hn_list_failed:${listRes.status}`);
    }

    const ids = (await listRes.json()) as unknown;
    if (!Array.isArray(ids)) {
      throw new Error("hn_list_invalid");
    }

    return ids
      .filter((id): id is number => typeof id === "number")
      .slice(0, this.limit);
  }

  private async fetchItem(id: number): Promise<HnItem | null> {
    const itemRes = await this.fetchImpl(`${HN_BASE}/item/${id}.json`);
    if (!itemRes.ok) return null;
    return (await itemRes.json()) as HnItem | null;
  }

  /**
   * One optional follow-up: first kid only, and only when authored by the
   * story submitter (OP description/clarification threads).
   */
  private async summaryFromOpFirstComment(
    story: HnItem,
  ): Promise<string | undefined> {
    const firstKid = story.kids?.[0];
    if (typeof firstKid !== "number" || !story.by) return undefined;

    const comment = await this.fetchItem(firstKid);
    if (!comment || comment.deleted || comment.dead) return undefined;
    if (comment.type !== "comment") return undefined;
    if (comment.by !== story.by) return undefined;
    if (typeof comment.text !== "string" || !comment.text.trim()) {
      return undefined;
    }
    const plain = hnHtmlToPlain(comment.text);
    return plain || undefined;
  }

  async fetchRecent(): Promise<NormalizedArticle[]> {
    const [topIds, newIds] = await Promise.all([
      this.fetchStoryIds("topstories.json"),
      this.fetchStoryIds("newstories.json"),
    ]);

    const seen = new Set<number>();
    const batch: number[] = [];
    for (const id of [...topIds, ...newIds]) {
      if (seen.has(id)) continue;
      seen.add(id);
      batch.push(id);
    }

    const articles: NormalizedArticle[] = [];
    for (const id of batch) {
      const item = await this.fetchItem(id);
      if (!item || item.deleted || item.dead || item.type !== "story") continue;
      if (!item.title) continue;

      // Prefer external URL; fall back to HN discussion page for Ask/Show HN.
      const rawUrl =
        item.url?.trim() ||
        `https://news.ycombinator.com/item?id=${item.id}`;

      let url: string;
      try {
        url = normalizeCanonicalUrl(rawUrl);
      } catch {
        continue;
      }

      let summary: string | undefined =
        typeof item.text === "string" && item.text.trim()
          ? hnHtmlToPlain(item.text) || undefined
          : undefined;
      if (!summary) {
        summary = await this.summaryFromOpFirstComment(item);
      }

      const article: NormalizedArticle = {
        url,
        title: item.title,
        summary,
        author: item.by,
        publishedAt:
          typeof item.time === "number" ? new Date(item.time * 1000) : undefined,
        raw: item,
        externalId: String(item.id),
      };
      article.contentHash = hashArticleContent(article);
      articles.push(article);
    }

    return articles;
  }
}

/** Firebase HN `text` is HTML (`<p>`, `<a>`, entities). Ranking wants plain text. */
export function hnHtmlToPlain(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
