import type { AiProvider, AiTokenUsage } from "./types.js";

export type RankTopicInput = {
  /** Topic id — needed to map `confirmedTopicIds` back from short model refs. */
  id?: string;
  name: string;
  keywords: string[];
  weight: number;
};

export type RankArticleInput = {
  articleId: string;
  title: string;
  summary: string | null;
  /** Podcast show title — scored with title/summary; not shown as summary. */
  showTitle?: string | null;
  /** Topic ids this article already keyword-matched (the AI narrows, never adds to this set). */
  candidateTopicIds?: string[];
  /**
   * Keyword-match reason (e.g. "Matched keywords: llm, agent") used as the
   * displayed reason when the model omits one or returns boilerplate that
   * just restates these instructions instead of describing the article.
   */
  keywordReason?: string | null;
};

export type RankedItem = {
  articleId: string;
  aiScore: number;
  reason: string;
  nearDuplicateOfArticleId?: string | null;
  /** Subset of the article's `candidateTopicIds` the AI confirms it's genuinely about. */
  confirmedTopicIds: string[];
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
    'Each element: {"articleId":"r0","aiScore":0.0,"reason":"one line","confirmedTopicIds":["t0"],"nearDuplicateOfArticleId":null}',
    "aiScore is a number from 0 to 1. Use the exact articleId values from the input (r0, r1, …).",
    "reason: state what the article is actually about, in your own words, in under 20 words (e.g. \"Benchmarks a new open-source LLM inference engine\"). Never describe these instructions, the matching process, or mention the words candidateTopics/confirmedTopicIds.",
    "Each article includes candidateTopics: topic ids it keyword-matched, listed only as a hint. confirmedTopicIds must be the subset of that article's OWN candidateTopics it is genuinely about — judge from the article's actual subject, not from whether a keyword string happens to appear (e.g. the word \"space\" inside \"workspace\" is not the Space topic). Return an empty array if none genuinely fit. Never invent ids outside that article's candidateTopics.",
    "nearDuplicateOfArticleId must be another articleId in this list, or null.",
    `Include exactly ${articleCount} objects — every input articleId once.`,
    "",
    `topics: ${topicsJson}`,
    `articles: ${articlesJson}`,
  ].join("\n");
}

/**
 * Small local models sometimes echo the prompt's own instructions instead of
 * describing the article (e.g. "Candidate topics fully match confirmed
 * topic ids…"). Treat that as no reason and fall back to the keyword match.
 */
const BOILERPLATE_REASON_PATTERNS = [
  "candidate topic",
  "confirmed topic",
  "superficial word overlap",
];

function isBoilerplateReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  return BOILERPLATE_REASON_PATTERNS.some((p) => lower.includes(p));
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
  candidateTopicShortIdsByArticle: Map<string, string[]>,
  fallbackReasonByArticle: Map<string, string>,
): (RankedItem & { articleId: string }) | null {
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
  const fallbackReason =
    fallbackReasonByArticle.get(articleId) ?? "Relevant to your topics.";
  const reason =
    typeof reasonRaw === "string" &&
    reasonRaw.trim() &&
    !isBoilerplateReason(reasonRaw)
      ? reasonRaw.trim().slice(0, 500)
      : fallbackReason;

  let nearDuplicateOfArticleId: string | null = null;
  const dupRaw =
    rec.nearDuplicateOfArticleId ?? rec.near_duplicate_of_article_id;
  if (typeof dupRaw === "string" && dupRaw.trim() && knownShortIds.has(dupRaw)) {
    nearDuplicateOfArticleId = dupRaw;
  } else if (dupRaw === null || dupRaw === undefined || dupRaw === "") {
    nearDuplicateOfArticleId = null;
  }

  const candidates = candidateTopicShortIdsByArticle.get(articleId) ?? [];
  const confirmedRaw = rec.confirmedTopicIds ?? rec.confirmed_topic_ids;
  let confirmedTopicIds: string[];
  if (Array.isArray(confirmedRaw)) {
    const candidateSet = new Set(candidates);
    confirmedTopicIds = confirmedRaw.filter(
      (v): v is string => typeof v === "string" && candidateSet.has(v),
    );
  } else {
    // Model omitted the field — keep the full keyword-matched candidate set
    // rather than silently unfollowing the article from all its topics.
    confirmedTopicIds = candidates;
  }

  return { articleId, aiScore, reason, nearDuplicateOfArticleId, confirmedTopicIds };
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

  /** Short opaque topic refs (t0, t1, …) so confirmedTopicIds stay small/stable. */
  const topicShortToReal = new Map<string, string>();
  const topicRealToShort = new Map<string, string>();
  input.topics.forEach((t, i) => {
    if (!t.id) return;
    const shortId = `t${i}`;
    topicShortToReal.set(shortId, t.id);
    topicRealToShort.set(t.id, shortId);
  });

  const candidateTopicShortIdsByArticle = new Map<string, string[]>();
  const fallbackReasonByArticle = new Map<string, string>();
  const shortArticles = input.articles.map((a, i) => {
    const shortId = toShortId(i);
    shortToReal.set(shortId, a.articleId);
    realToShort.set(a.articleId, shortId);
    const candidateTopics = (a.candidateTopicIds ?? [])
      .map((id) => topicRealToShort.get(id))
      .filter((v): v is string => v !== undefined);
    candidateTopicShortIdsByArticle.set(shortId, candidateTopics);
    if (a.keywordReason?.trim()) {
      fallbackReasonByArticle.set(shortId, a.keywordReason.trim());
    }
    return {
      articleId: shortId,
      title: a.title,
      summary: truncate(a.summary, summaryMax),
      ...(a.showTitle ? { showTitle: truncate(a.showTitle, summaryMax) } : {}),
      ...(candidateTopics.length > 0 ? { candidateTopics } : {}),
    };
  });
  const knownShortIds = new Set(shortToReal.keys());

  const topicsJson = JSON.stringify(
    input.topics.map((t, i) => ({
      ...(topicShortToReal.has(`t${i}`) ? { id: `t${i}` } : {}),
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
    json: "rank-array",
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
      const ranked = parseRankedItem(
        item,
        knownShortIds,
        candidateTopicShortIdsByArticle,
        fallbackReasonByArticle,
      );
      if (!ranked || seen.has(ranked.articleId)) continue;
      seen.add(ranked.articleId);

      const realId = shortToReal.get(ranked.articleId);
      if (!realId) continue;

      let nearDup: string | null = null;
      if (ranked.nearDuplicateOfArticleId) {
        nearDup = shortToReal.get(ranked.nearDuplicateOfArticleId) ?? null;
      }

      const confirmedTopicIds = ranked.confirmedTopicIds
        .map((shortTopicId) => topicShortToReal.get(shortTopicId))
        .filter((v): v is string => v !== undefined);

      out.push({
        articleId: realId,
        aiScore: ranked.aiScore,
        reason: ranked.reason,
        nearDuplicateOfArticleId: nearDup,
        confirmedTopicIds,
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
