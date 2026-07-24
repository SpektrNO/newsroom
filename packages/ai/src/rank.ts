import type { AiProvider } from "./types.js";

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
  /** Max summary chars sent to the model (default 400). */
  summaryMaxChars?: number;
};

const DEFAULT_SUMMARY_MAX = 400;

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function buildPrompt(input: RankArticleBatchInput): string {
  const summaryMax = input.summaryMaxChars ?? DEFAULT_SUMMARY_MAX;
  const topicsJson = JSON.stringify(
    input.topics.map((t) => ({
      name: t.name,
      keywords: t.keywords,
      weight: t.weight,
    })),
  );
  const articlesJson = JSON.stringify(
    input.articles.map((a) => ({
      articleId: a.articleId,
      title: a.title,
      summary: truncate(a.summary, summaryMax),
    })),
  );

  return [
    "Rank each article for relevance to the user's topics.",
    "Respond with ONLY a JSON array (no markdown fences). Each element:",
    '{"articleId":"<id>","aiScore":<0-1 number>,"reason":"<one line>","nearDuplicateOfArticleId":"<id or null>"}',
    "aiScore is relevance in [0,1]. nearDuplicateOfArticleId is another articleId in this batch if near-duplicate, else null.",
    "Include every articleId from the input exactly once.",
    "",
    `topics: ${topicsJson}`,
    `articles: ${articlesJson}`,
  ].join("\n");
}

function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1] ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no_json_array");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function parseRankedItem(
  raw: unknown,
  knownIds: Set<string>,
): RankedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const articleId = rec.articleId ?? rec.article_id;
  if (typeof articleId !== "string" || !knownIds.has(articleId)) return null;

  const scoreRaw = rec.aiScore ?? rec.ai_score ?? rec.score;
  const aiScore =
    typeof scoreRaw === "number"
      ? clamp01(scoreRaw)
      : typeof scoreRaw === "string"
        ? clamp01(Number(scoreRaw))
        : null;
  if (aiScore === null) return null;

  const reasonRaw = rec.reason;
  const reason =
    typeof reasonRaw === "string" && reasonRaw.trim()
      ? reasonRaw.trim().slice(0, 500)
      : "Relevant to your topics.";

  let nearDuplicateOfArticleId: string | null = null;
  const dupRaw =
    rec.nearDuplicateOfArticleId ?? rec.near_duplicate_of_article_id;
  if (typeof dupRaw === "string" && dupRaw.trim() && knownIds.has(dupRaw)) {
    nearDuplicateOfArticleId = dupRaw;
  } else if (dupRaw === null || dupRaw === undefined || dupRaw === "") {
    nearDuplicateOfArticleId = null;
  }
  // Invalid dup ids are ignored (do not crash).

  return { articleId, aiScore, reason, nearDuplicateOfArticleId };
}

/**
 * Batch-rank articles via AiProvider.complete. Never imports DB/Next.
 * Malformed items are skipped; callers keep keyword-only scores for those.
 */
export async function rankArticleBatch(
  provider: AiProvider,
  input: RankArticleBatchInput,
): Promise<RankedItem[]> {
  if (input.articles.length === 0) return [];

  const knownIds = new Set(input.articles.map((a) => a.articleId));
  const result = await provider.complete({
    system:
      "You are a news ranking assistant. Output valid JSON only. No prose outside JSON.",
    prompt: buildPrompt(input),
  });

  let parsed: unknown;
  try {
    parsed = extractJsonArray(result.text);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const out: RankedItem[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    try {
      const ranked = parseRankedItem(item, knownIds);
      if (!ranked || seen.has(ranked.articleId)) continue;
      seen.add(ranked.articleId);
      out.push(ranked);
    } catch {
      // continue on malformed item
    }
  }
  return out;
}
