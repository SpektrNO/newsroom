import type { AiProvider, AiTokenUsage } from "./types.js";

export type RankTopicInput = {
  name: string;
  keywords: string[];
  weight: number;
};

export type RankArticleInput = {
  articleId: string;
  title: string;
  summary: string | null;
};

export type RankedItem = {
  articleId: string;
  aiScore: number;
  reason: string;
  nearDuplicateOfArticleId?: string | null;
};

export type RankArticleBatchInput = {
  topics: RankTopicInput[];
  articles: RankArticleInput[];
  /** Max summary chars sent to the model (default 280). */
  summaryMaxChars?: number;
};

export type RankArticleBatchResult = {
  items: RankedItem[];
  usage?: AiTokenUsage;
};

const DEFAULT_SUMMARY_MAX = 280;

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Short opaque ids (r0, r1, …) so small models do not mangle UUIDs. */
function toShortId(index: number): string {
  return `r${index}`;
}

function buildPrompt(
  topicsJson: string,
  articlesJson: string,
  articleCount: number,
): string {
  return [
    "Rank each article for relevance to the user topics.",
    "User topics is guide only, synonyms or otherwise related words are to be interpreted as in-scope.",
    "The top-level JSON value MUST be an array (not a single object).",
    'Each element: {"articleId":"r0","aiScore":0.0,"reason":"one line","nearDuplicateOfArticleId":null}',
    "aiScore is a number from 0 to 1. Use the exact articleId values from the input (r0, r1, …).",
    "nearDuplicateOfArticleId must be another articleId in this list, or null.",
    `Include exactly ${articleCount} objects — every input articleId once.`,
    "",
    `topics: ${topicsJson}`,
    `articles: ${articlesJson}`,
  ].join("\n");
}

function looksLikeRankItem(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof (rec.articleId ?? rec.article_id) === "string" &&
    (rec.aiScore !== undefined ||
      rec.ai_score !== undefined ||
      rec.score !== undefined)
  );
}

/** Normalize model JSON into an array. Accepts arrays, wrappers, or a single rank object. */
export function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("no_json_array");
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1] ? fence[1].trim() : trimmed;

  const coerce = (parsed: unknown): unknown[] => {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      if (looksLikeRankItem(parsed)) return [parsed];
      const rec = parsed as Record<string, unknown>;
      for (const key of ["items", "results", "articles", "rankings", "data"]) {
        const value = rec[key];
        if (Array.isArray(value)) return value;
        if (looksLikeRankItem(value)) return [value];
      }
      for (const value of Object.values(rec)) {
        if (Array.isArray(value)) return value;
      }
    }
    throw new Error("not_array");
  };

  const tryParse = (raw: string): unknown[] => coerce(JSON.parse(raw) as unknown);

  try {
    return tryParse(candidate);
  } catch {
    const arrayStart = candidate.indexOf("[");
    const arrayEnd = candidate.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      try {
        return tryParse(candidate.slice(arrayStart, arrayEnd + 1));
      } catch {
        /* fall through to object */
      }
    }
    const objStart = candidate.indexOf("{");
    const objEnd = candidate.lastIndexOf("}");
    if (objStart !== -1 && objEnd > objStart) {
      return tryParse(candidate.slice(objStart, objEnd + 1));
    }
    throw new Error("no_json_array");
  }
}

function parseRankedItem(
  raw: unknown,
  knownShortIds: Set<string>,
): RankedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const articleId = rec.articleId ?? rec.article_id;
  if (typeof articleId !== "string" || !knownShortIds.has(articleId)) return null;

  const scoreRaw = rec.aiScore ?? rec.ai_score ?? rec.score;
  let aiScore: number | null = null;
  if (typeof scoreRaw === "number" && Number.isFinite(scoreRaw)) {
    aiScore = clamp01(scoreRaw);
  } else if (typeof scoreRaw === "string" && scoreRaw.trim() !== "") {
    const n = Number(scoreRaw);
    if (Number.isFinite(n)) aiScore = clamp01(n);
  }
  if (aiScore === null) return null;

  const reasonRaw = rec.reason;
  const reason =
    typeof reasonRaw === "string" && reasonRaw.trim()
      ? reasonRaw.trim().slice(0, 500)
      : "Relevant to your topics.";

  let nearDuplicateOfArticleId: string | null = null;
  const dupRaw =
    rec.nearDuplicateOfArticleId ?? rec.near_duplicate_of_article_id;
  if (typeof dupRaw === "string" && dupRaw.trim() && knownShortIds.has(dupRaw)) {
    nearDuplicateOfArticleId = dupRaw;
  } else if (dupRaw === null || dupRaw === undefined || dupRaw === "") {
    nearDuplicateOfArticleId = null;
  }

  return { articleId, aiScore, reason, nearDuplicateOfArticleId };
}

/**
 * Batch-rank articles via AiProvider.complete. Never imports DB/Next.
 * Malformed items are skipped; callers keep keyword-only scores for those.
 */
export async function rankArticleBatch(
  provider: AiProvider,
  input: RankArticleBatchInput,
): Promise<RankArticleBatchResult> {
  if (input.articles.length === 0) return { items: [] };

  const summaryMax = input.summaryMaxChars ?? DEFAULT_SUMMARY_MAX;
  const shortToReal = new Map<string, string>();
  const realToShort = new Map<string, string>();
  const shortArticles = input.articles.map((a, i) => {
    const shortId = toShortId(i);
    shortToReal.set(shortId, a.articleId);
    realToShort.set(a.articleId, shortId);
    return {
      articleId: shortId,
      title: a.title,
      summary: truncate(a.summary, summaryMax),
    };
  });
  const knownShortIds = new Set(shortToReal.keys());

  const topicsJson = JSON.stringify(
    input.topics.map((t) => ({
      name: t.name,
      keywords: t.keywords,
      weight: t.weight,
    })),
  );
  const articlesJson = JSON.stringify(shortArticles);

  // ~80 tokens per item as a soft ceiling for JSON rows on small models.
  const maxTokens = Math.min(8192, Math.max(1024, input.articles.length * 120));

  const result = await provider.complete({
    system:
      "You are a news ranking assistant. Reply with a JSON array only. No markdown. Never return a bare object.",
    prompt: buildPrompt(topicsJson, articlesJson, input.articles.length),
    json: true,
    maxTokens,
  });

  let parsed: unknown;
  try {
    parsed = extractJsonArray(result.text);
  } catch {
    console.warn(
      `[newsroom/ai] rank batch: could not parse JSON (len=${result.text.length}): ${result.text.slice(0, 280)}`,
    );
    return { items: [], usage: result.usage };
  }

  if (!Array.isArray(parsed)) return { items: [], usage: result.usage };

  const out: RankedItem[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    try {
      const ranked = parseRankedItem(item, knownShortIds);
      if (!ranked || seen.has(ranked.articleId)) continue;
      seen.add(ranked.articleId);

      const realId = shortToReal.get(ranked.articleId);
      if (!realId) continue;

      let nearDup: string | null = null;
      if (ranked.nearDuplicateOfArticleId) {
        nearDup = shortToReal.get(ranked.nearDuplicateOfArticleId) ?? null;
      }

      out.push({
        articleId: realId,
        aiScore: ranked.aiScore,
        reason: ranked.reason,
        nearDuplicateOfArticleId: nearDup,
      });
    } catch {
      // continue on malformed item
    }
  }

  if (out.length === 0 && result.text.trim()) {
    console.warn(
      `[newsroom/ai] rank batch: no matched article ids (len=${result.text.length}): ${result.text.slice(0, 280)}`,
    );
  }

  return { items: out, usage: result.usage };
}
