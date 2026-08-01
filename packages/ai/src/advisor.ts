import type { AiProvider, AiTokenUsage } from "./types.js";
import { mergeTokenUsage } from "./types.js";

export type AdvisorChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AdvisorFollowingTopic = {
  name: string;
  keywords: string[];
};

export type AdvisorSuggestion = {
  topicLabel: string;
  keywords: string[];
  rationale: string;
};

export type AdviseTopicsInput = {
  catalogLabels: string[];
  /** Optional "Parent › Leaf" crumbs aligned with catalogLabels order — omit if unused. */
  catalogCrumbs?: string[];
  following: AdvisorFollowingTopic[];
  messages: AdvisorChatMessage[];
};

export type AdviseTopicsResult = {
  reply: string;
  suggestions: AdvisorSuggestion[];
  usage?: AiTokenUsage;
};

const MAX_KEYWORDS = 50;
const MAX_KEYWORD_LEN = 64;

const FRIENDLY_PARSE_FAIL =
  "I couldn’t format that answer correctly. Try asking again in a sentence or two about what you want to follow.";

function buildPrompt(input: AdviseTopicsInput): string {
  const catalog = input.catalogLabels.map((label, i) => {
    const crumb = input.catalogCrumbs?.[i];
    return crumb ? { label, path: crumb } : { label };
  });

  return [
    "You advise the user on which Newsroom topics to follow and which keywords to use.",
    "This is NOT article ranking. Do not score articles. Do not invent article titles.",
    "Never return a JSON array. Never use keys articleId, aiScore, nearDuplicateOfArticleId, or finalRank.",
    "The catalog is hierarchical: each leaf’s `path` is Root · … · Leaf (e.g. Technology · AI & Machine Learning · Evals & safety).",
    "Match suggestions to the user’s interests by branch first: only suggest leaves under roots/branches that fit (politics / world affairs / breaking news → Culture & Society · Breaking & politics or Policy & rules — never Technology leaves; climate → Science; startups → Business & Startups).",
    "Do not stretch a mismatched branch. If no leaf fits well, say so in reply, suggest the closest in-branch leaves only, and use keywords to cover the gap — never dump unrelated Technology (or other) leaves.",
    "Topic names for Follow must be catalog leaf `label` values from catalogLeaves.",
    "Keywords must be short substring-friendly tokens (e.g. llm, postgres, election), not full multi-word catalog phrases alone.",
    "Ranking also weakly matches ancestor path tokens for followed leaves; still prefer leaves whose whole path fits the user’s stated interests.",
    "User topics/keywords are a guide only; synonyms or otherwise related words may be suggested as in-scope.",
    "If the user’s interests are outside the catalog, say so in reply and still suggest the closest fitting catalog leaves and useful keywords when possible.",
    "Reply with a single JSON object only, shaped exactly like:",
    '{"reply":"markdown-free prose for the user","suggestions":[{"topicLabel":"LLMs & agents","keywords":["llm","agent"],"rationale":"why"}]}',
    "suggestions may be an empty array. Prefer 1–5 high-quality suggestions.",
    "",
    `catalogLeaves: ${JSON.stringify(catalog)}`,
    `following: ${JSON.stringify(input.following)}`,
    `messages: ${JSON.stringify(input.messages)}`,
  ].join("\n");
}

/** Exported for unit tests. */
export function buildAdvisorPrompt(input: AdviseTopicsInput): string {
  return buildPrompt(input);
}

function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("no_json");

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1] ? fence[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const objStart = candidate.indexOf("{");
    const objEnd = candidate.lastIndexOf("}");
    const arrStart = candidate.indexOf("[");
    const arrEnd = candidate.lastIndexOf("]");
    if (objStart !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(candidate.slice(objStart, objEnd + 1)) as unknown;
      } catch {
        /* fall through */
      }
    }
    if (arrStart !== -1 && arrEnd > arrStart) {
      return JSON.parse(candidate.slice(arrStart, arrEnd + 1)) as unknown;
    }
    throw new Error("no_json");
  }
}

/** True when model output looks like ranking JSON, not advisor JSON. */
export function looksLikeRankPayload(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    return value.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const rec = item as Record<string, unknown>;
      return (
        rec.articleId !== undefined ||
        rec.article_id !== undefined ||
        rec.aiScore !== undefined ||
        rec.ai_score !== undefined
      );
    });
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (rec.articleId !== undefined || rec.aiScore !== undefined) return true;
    const items = rec.suggestions ?? rec.items ?? rec.results;
    if (Array.isArray(items) && looksLikeRankPayload(items)) return true;
  }
  return false;
}

function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const kw = item.trim().slice(0, MAX_KEYWORD_LEN);
    if (!kw) continue;
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

function parseSuggestion(raw: unknown): AdvisorSuggestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (rec.articleId !== undefined || rec.aiScore !== undefined) return null;
  const labelRaw = rec.topicLabel ?? rec.topic_label ?? rec.name;
  if (typeof labelRaw !== "string" || !labelRaw.trim()) return null;
  const keywords = normalizeKeywords(rec.keywords);
  if (keywords.length === 0) return null;
  const rationaleRaw = rec.rationale ?? rec.reason;
  const rationale =
    typeof rationaleRaw === "string" && rationaleRaw.trim()
      ? rationaleRaw.trim().slice(0, 500)
      : "Suggested for your interests.";
  return {
    topicLabel: labelRaw.trim().slice(0, 120),
    keywords,
    rationale,
  };
}

function looksLikeRawJsonDump(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

/** Parse advisor model JSON into reply + suggestions. */
export function parseAdvisorResponse(text: string): AdviseTopicsResult {
  const parsed = extractJsonValue(text);
  if (looksLikeRankPayload(parsed)) {
    throw new Error("rank_shaped_response");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_advisor_json");
  }
  const rec = parsed as Record<string, unknown>;
  const replyRaw = rec.reply ?? rec.message ?? rec.text;
  const reply =
    typeof replyRaw === "string" && replyRaw.trim()
      ? replyRaw.trim().slice(0, 8000)
      : "";

  const suggestionsRaw = rec.suggestions ?? rec.items ?? [];
  const suggestions: AdvisorSuggestion[] = [];
  if (Array.isArray(suggestionsRaw)) {
    for (const item of suggestionsRaw) {
      const s = parseSuggestion(item);
      if (s) suggestions.push(s);
      if (suggestions.length >= 8) break;
    }
  }

  if (!reply && suggestions.length === 0) {
    throw new Error("empty_advisor_response");
  }

  return {
    reply:
      reply ||
      "Here are some topic and keyword ideas based on what you shared.",
    suggestions,
  };
}

/**
 * Topic/keyword advisor via AiProvider.complete. Never imports DB/Next.
 * Keep prompts separate from ranking.
 */
export async function adviseTopics(
  provider: AiProvider,
  input: AdviseTopicsInput,
): Promise<AdviseTopicsResult> {
  if (input.messages.length === 0) {
    return { reply: "Tell me what you’re interested in.", suggestions: [] };
  }

  const result = await provider.complete({
    system:
      "You are Newsroom’s topic and keyword advisor — not a feed ranker. Reply with one JSON object only: {\"reply\":\"…\",\"suggestions\":[…]}. Never return a JSON array. Never include articleId or aiScore. No markdown fences.",
    prompt: buildPrompt(input),
    json: true,
    maxTokens: 2048,
  });

  try {
    const parsed = parseAdvisorResponse(result.text);
    return { ...parsed, usage: result.usage };
  } catch (err) {
    console.warn(
      `[newsroom/ai] advisor: could not parse JSON (len=${result.text.length}): ${result.text.slice(0, 280)}`,
      err instanceof Error ? err.message : err,
    );

    // One repair pass when the model used ranking shape or invalid JSON.
    try {
      const repair = await provider.complete({
        system:
          "Convert the prior model output into Newsroom advisor JSON only. Return one object: {\"reply\":\"prose\",\"suggestions\":[{\"topicLabel\":\"…\",\"keywords\":[\"…\"],\"rationale\":\"…\"}]}. No arrays at the top level. No articleId or aiScore.",
        prompt: [
          "User messages:",
          JSON.stringify(input.messages),
          "Catalog leaves (label + hierarchical path). Only suggest leaves whose path fits the user’s interests:",
          JSON.stringify(
            input.catalogLabels.map((label, i) => ({
              label,
              path: input.catalogCrumbs?.[i] ?? label,
            })),
          ),
          "Bad model output to rewrite:",
          result.text.slice(0, 4000),
        ].join("\n"),
        json: true,
        maxTokens: 2048,
      });
      const parsed = parseAdvisorResponse(repair.text);
      return {
        ...parsed,
        usage: mergeTokenUsage(result.usage, repair.usage),
      };
    } catch {
      const fallback = result.text.trim().slice(0, 2000);
      if (fallback && !looksLikeRawJsonDump(fallback)) {
        return { reply: fallback, suggestions: [], usage: result.usage };
      }
      return {
        reply: FRIENDLY_PARSE_FAIL,
        suggestions: [],
        usage: result.usage,
      };
    }
  }
}
