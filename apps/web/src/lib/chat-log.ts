import type { ChatSuggestion } from "@newsroom/api-client";

export const CHAT_LOG_KEY = "newsroom.advisor.chatlog";
export const CHAT_LOG_MAX_TURNS = 25;
/** Must stay ≤ server `MAX_MESSAGES` in `apps/web/src/lib/chat.ts`. */
export const CHAT_API_WINDOW = 12;

export type ChatLogTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: ChatSuggestion[];
};

function parseSuggestion(raw: unknown): ChatSuggestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.topicLabel !== "string" || !record.topicLabel.trim()) {
    return null;
  }
  if (!Array.isArray(record.keywords)) return null;
  const keywords = record.keywords
    .filter((k): k is string => typeof k === "string")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (typeof record.rationale !== "string") return null;
  return {
    topicLabel: record.topicLabel.trim(),
    keywords,
    rationale: record.rationale,
    inCatalog: Boolean(record.inCatalog),
  };
}

function parseTurn(raw: unknown): ChatLogTurn | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (record.role !== "user" && record.role !== "assistant") return null;
  if (typeof record.content !== "string" || !record.content.trim()) return null;

  let suggestions: ChatSuggestion[] | undefined;
  if (record.suggestions !== undefined) {
    if (!Array.isArray(record.suggestions)) return null;
    suggestions = [];
    for (const item of record.suggestions) {
      const s = parseSuggestion(item);
      if (s) suggestions.push(s);
    }
  }

  return {
    id: record.id.trim(),
    role: record.role,
    content: record.content,
    ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
  };
}

/** Keep the newest N turns. */
export function trimChatLog(
  turns: readonly ChatLogTurn[],
  max = CHAT_LOG_MAX_TURNS,
): ChatLogTurn[] {
  if (turns.length <= max) return [...turns];
  return turns.slice(-max);
}

export function parseStoredChatLog(raw: string | null): ChatLogTurn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { turns?: unknown }).turns)
        ? (parsed as { turns: unknown[] }).turns
        : null;
    if (!list) return [];
    const turns: ChatLogTurn[] = [];
    for (const item of list) {
      const turn = parseTurn(item);
      if (turn) turns.push(turn);
    }
    return trimChatLog(turns);
  } catch {
    return [];
  }
}

export function readStoredChatLog(): ChatLogTurn[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return parseStoredChatLog(localStorage.getItem(CHAT_LOG_KEY));
  } catch {
    return [];
  }
}

export function writeStoredChatLog(turns: readonly ChatLogTurn[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      CHAT_LOG_KEY,
      JSON.stringify({ turns: trimChatLog(turns) }),
    );
  } catch {
    // Quota / private mode — ignore.
  }
}

/** Last N turns for the chat API (role + content only). */
export function chatApiMessages(
  turns: readonly ChatLogTurn[],
  windowSize = CHAT_API_WINDOW,
): Array<{ role: "user" | "assistant"; content: string }> {
  return trimChatLog(turns, windowSize).map((t) => ({
    role: t.role,
    content: t.content,
  }));
}
