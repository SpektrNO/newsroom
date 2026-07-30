"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  type ChatSuggestion,
  type Topic,
} from "@newsroom/api-client";
import { getBrowserApiClient } from "@/lib/api";
import {
  chatApiMessages,
  readStoredChatLog,
  trimChatLog,
  writeStoredChatLog,
  type ChatLogTurn,
} from "@/lib/chat-log";
import {
  findTopicByLabel,
  followDefaultsForLabel,
  isFollowingLabel,
} from "@/lib/topics-catalog";

function mergeKeywords(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((k) => k.toLowerCase()));
  const out = [...existing];
  for (const kw of incoming) {
    const trimmed = kw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= 50) break;
  }
  return out;
}

export function ChatClient(): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [turns, setTurns] = useState<ChatLogTurn[]>([]);
  const [logReady, setLogReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const refreshTopics = useCallback(async () => {
    try {
      const res = await api.listTopics();
      setTopics(res.topics);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/sign-in?callbackUrl=%2Fchat");
      }
    }
  }, [api, router]);

  useEffect(() => {
    void refreshTopics();
  }, [refreshTopics]);

  useEffect(() => {
    setTurns(readStoredChatLog());
    setLogReady(true);
  }, []);

  useEffect(() => {
    if (!logReady) return;
    writeStoredChatLog(turns);
  }, [turns, logReady]);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || pending) return;

    setError(null);
    setActionNote(null);
    setDraft("");

    const userTurn: ChatLogTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };
    const nextTurns = trimChatLog([...turns, userTurn]);
    setTurns(nextTurns);
    setPending(true);

    const messages = chatApiMessages(nextTurns);

    try {
      const res = await api.postChat({ messages });
      setTurns((prev) =>
        trimChatLog([
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: res.reply,
            suggestions: res.suggestions,
          },
        ]),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/sign-in?callbackUrl=%2Fchat");
        return;
      }
      if (err instanceof ApiError && err.code === "rate_limited") {
        setError("Too many messages — wait a minute and try again.");
      } else if (err instanceof ApiError && err.code === "ai_unavailable") {
        setError(
          "Advisor is unavailable right now. Check Settings / Ollama, then retry.",
        );
      } else {
        setError("Couldn't reach the advisor — try again.");
      }
    } finally {
      setPending(false);
    }
  }

  function onClearLog() {
    if (turns.length === 0) return;
    if (!window.confirm("Clear the advisor chat history on this device?")) {
      return;
    }
    setTurns([]);
    setError(null);
    setActionNote(null);
  }

  async function onFollow(suggestion: ChatSuggestion) {
    if (!suggestion.inCatalog) return;
    if (
      !window.confirm(
        `Follow “${suggestion.topicLabel}” with these keywords?`,
      )
    ) {
      return;
    }
    setActionNote(null);
    try {
      const defaults = followDefaultsForLabel(suggestion.topicLabel);
      await api.createTopic({
        ...defaults,
        keywords:
          suggestion.keywords.length > 0
            ? suggestion.keywords
            : defaults.keywords,
      });
      setActionNote(`Following ${suggestion.topicLabel}.`);
      await refreshTopics();
    } catch (err) {
      if (err instanceof ApiError && (err.code === "duplicate" || err.status === 409)) {
        setActionNote("You’re already following that topic.");
        await refreshTopics();
      } else {
        setError("Couldn't follow topic — try again.");
      }
    }
  }

  async function onAddKeywords(suggestion: ChatSuggestion) {
    const topic = findTopicByLabel(topics, suggestion.topicLabel);
    if (!topic) return;
    if (
      !window.confirm(`Add these keywords to “${suggestion.topicLabel}”?`)
    ) {
      return;
    }
    setActionNote(null);
    try {
      const keywords = mergeKeywords(topic.keywords, suggestion.keywords);
      await api.patchTopic(topic.id, { keywords });
      setActionNote(`Updated keywords on ${suggestion.topicLabel}.`);
      await refreshTopics();
    } catch {
      setError("Couldn't update keywords — try again.");
    }
  }

  return (
    <section className="manage-page">
      <header className="page-header">
        <h1 className="page-title">Advisor</h1>
        <p className="page-lede">
          Ask for topic and keyword ideas. The last 25 messages stay on this
          device. Suggestions stay yours until you follow or apply them.
        </p>
      </header>

      <div className="chat-panel panel-soft">
        <div className="chat-log" aria-live="polite">
          {!logReady ? (
            <p className="empty-copy">Loading chat…</p>
          ) : turns.length === 0 ? (
            <p className="empty-copy">
              Describe your interests to get catalog topics and matchable
              keywords.
            </p>
          ) : (
            turns.map((turn) => (
              <div
                key={turn.id}
                className={
                  turn.role === "user" ? "chat-bubble user" : "chat-bubble assistant"
                }
              >
                <p className="chat-role">
                  {turn.role === "user" ? "You" : "Advisor"}
                </p>
                <p className="chat-content">{turn.content}</p>
                {turn.suggestions && turn.suggestions.length > 0 ? (
                  <ul className="chat-suggestions">
                    {turn.suggestions.map((s) => {
                      const following = isFollowingLabel(topics, s.topicLabel);
                      return (
                        <li key={`${s.topicLabel}-${s.keywords.join(",")}`}>
                          <div className="chat-suggestion-main">
                            <p className="chat-suggestion-title">
                              {s.topicLabel}
                              {!s.inCatalog ? (
                                <span className="chat-suggestion-badge">
                                  Not in catalog
                                </span>
                              ) : following ? (
                                <span className="chat-suggestion-badge">
                                  Following
                                </span>
                              ) : null}
                            </p>
                            <p className="chat-suggestion-meta">
                              {s.keywords.join(", ")}
                            </p>
                            <p className="chat-suggestion-rationale">
                              {s.rationale}
                            </p>
                          </div>
                          <div className="chat-suggestion-actions">
                            {s.inCatalog && !following ? (
                              <button
                                type="button"
                                onClick={() => void onFollow(s)}
                              >
                                Follow
                              </button>
                            ) : null}
                            {s.inCatalog && following ? (
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => void onAddKeywords(s)}
                              >
                                Add keywords
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ))
          )}
        </div>

        {error ? <p className="error">{error}</p> : null}
        {actionNote ? <p className="helper">{actionNote}</p> : null}

        <form className="chat-composer form" onSubmit={(e) => void onSend(e)}>
          <label className="sr-only" htmlFor="advisor-draft">
            Message
          </label>
          <textarea
            id="advisor-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What are you interested in?"
            rows={3}
            disabled={pending}
            required
          />
          <div className="form-actions">
            <button type="submit" disabled={pending || !draft.trim()}>
              {pending ? "Thinking…" : "Send"}
            </button>
            {turns.length > 0 ? (
              <button
                type="button"
                className="ghost"
                disabled={pending}
                onClick={onClearLog}
              >
                Clear history
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
