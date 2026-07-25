import type { AiProvider } from "./types.js";

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
};

const MAX_KEYWORDS = 50;
const MAX_KEYWORD_LEN = 64;

function buildPrompt(input: AdviseTopicsInput): string {
  const catalog = input.catalogLabels.map((label, i) => {
    const crumb = input.catalogCrumbs?.[i];
    return crumb ? { label, path: crumb } : { label };
  });

  return [
    "Help the user choose Newsroom topics and keywords.",
    "Topic names should prefer catalog leaf labels when suggesting Follow targets.",
    "Keywords must be short substring-friendly tokens (e.g. llm, postgres), not full multi-word catalog phrases alone.",
    "User topics/keywords are a guide only; synonyms or otherwise related words may be suggested as in-scope.",
    "Reply with a JSON object only:",
    '{"reply":"markdown-free prose","suggestions":[{"topicLabel":"…","keywords":["…"],"rationale":"…"}]}',
    "suggestions may be an empty array. Prefer 1–5 high-quality suggestions.",
    "",
    `catalogLeaves: ${JSON.stringify(catalog)}`,
    `following: ${JSON.stringify(input.following)}`,
    `messages: ${JSON.stringify(input.messages)}`,
  ].join("\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("no_json");

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1] ? fence[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as unknown;
    }
    throw new Error("no_json");
  }
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

/** Parse advisor model JSON into reply + suggestions. */
export function parseAdvisorResponse(text: string): AdviseTopicsResult {
  const parsed = extractJsonObject(text);
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
      "You are Newsroom’s topic advisor. Reply with a JSON object only. No markdown fences.",
    prompt: buildPrompt(input),
    json: true,
    maxTokens: 2048,
  });

  try {
    return parseAdvisorResponse(result.text);
  } catch {
    console.warn(
      `[newsroom/ai] advisor: could not parse JSON (len=${result.text.length}): ${result.text.slice(0, 280)}`,
    );
    const fallback = result.text.trim().slice(0, 2000);
    if (fallback) {
      return { reply: fallback, suggestions: [] };
    }
    throw new Error("ai_unavailable");
  }
}
