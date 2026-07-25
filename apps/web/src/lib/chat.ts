export type ChatMessageInput = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSuggestionJson = {
  topicLabel: string;
  keywords: string[];
  rationale: string;
  inCatalog: boolean;
};

const MAX_MESSAGES = 12;
const MAX_CONTENT = 2000;

export function parseChatRequestBody(
  body: unknown,
): { ok: true; messages: ChatMessageInput[] } | { ok: false } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false };
  }
  const messagesRaw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
    return { ok: false };
  }
  if (messagesRaw.length > MAX_MESSAGES) return { ok: false };

  const messages: ChatMessageInput[] = [];
  for (const item of messagesRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false };
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") return { ok: false };
    if (typeof content !== "string") return { ok: false };
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > MAX_CONTENT) return { ok: false };
    messages.push({ role, content: trimmed });
  }

  if (messages[messages.length - 1]?.role !== "user") return { ok: false };
  return { ok: true, messages };
}

export function markSuggestionsInCatalog(
  suggestions: Array<{
    topicLabel: string;
    keywords: string[];
    rationale: string;
  }>,
  selectableLabels: string[],
): ChatSuggestionJson[] {
  const byLower = new Map(
    selectableLabels.map((l) => [l.trim().toLowerCase(), l] as const),
  );
  return suggestions.map((s) => {
    const canonical = byLower.get(s.topicLabel.trim().toLowerCase());
    return {
      topicLabel: canonical ?? s.topicLabel,
      keywords: s.keywords,
      rationale: s.rationale,
      inCatalog: Boolean(canonical),
    };
  });
}
