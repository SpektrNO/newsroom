"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  type FeedItem,
  type SourceTypeV1,
  type Topic,
} from "@newsroom/api-client";
import { getBrowserApiClient } from "@/lib/api";

type SourceFilter = "" | SourceTypeV1;
type ViewFilter = "feed" | "saved";

function sourceLabel(type: string): string {
  if (type === "hackernews") return "Hacker News";
  if (type === "substack") return "Substack";
  return type;
}

function formatPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 36) return `${hours}h ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function FeedClient(): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [topicId, setTopicId] = useState("");
  const [source, setSource] = useState<SourceFilter>("");
  const [view, setView] = useState<ViewFilter>("feed");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const loadPage = useCallback(
    async (cursor?: string, append = false) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const page = await api.listFeed({
          cursor,
          topic: topicId || undefined,
          source: source || undefined,
          status: view === "saved" ? "saved" : undefined,
          limit: 20,
        });
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch (err) {
        const status =
          err instanceof ApiError
            ? err.status
            : err &&
                typeof err === "object" &&
                "status" in err &&
                typeof (err as { status: unknown }).status === "number"
              ? (err as { status: number }).status
              : null;
        if (status === 401) {
          router.push("/sign-in?callbackUrl=%2F");
          return;
        }
        console.error("[newsroom] feed load failed", err);
        setError("Couldn't load your feed.");
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [api, router, source, topicId, view],
  );

  useEffect(() => {
    void api.listTopics().then(
      (res) => setTopics(res.topics),
      () => setTopics([]),
    );
  }, [api]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function updateStatus(
    articleId: string,
    action: "saved" | "dismissed" | "seen",
  ) {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[articleId];
      return next;
    });
    try {
      if (action === "saved") await api.markFeedSaved(articleId);
      else if (action === "dismissed") await api.markFeedDismissed(articleId);
      else await api.markFeedSeen(articleId);

      if (action === "dismissed" || (view === "saved" && action === "seen")) {
        setItems((prev) => prev.filter((i) => i.articleId !== articleId));
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.articleId === articleId ? { ...i, status: action } : i,
          ),
        );
      }
    } catch {
      setRowErrors((prev) => ({
        ...prev,
        [articleId]: "Couldn't update — try again.",
      }));
    }
  }

  function onTitleOpen(item: FeedItem) {
    void updateStatus(item.articleId, "seen").catch(() => undefined);
  }

  const hasFilters = Boolean(topicId || source || view === "saved");

  return (
    <section className="feed-page">
      <div className="feed-filters" role="group" aria-label="Feed filters">
        <label className="filter-field">
          <span className="filter-label">Topic</span>
          <select
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span className="filter-label">Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SourceFilter)}
          >
            <option value="">All sources</option>
            <option value="hackernews">Hacker News</option>
            <option value="substack">Substack</option>
          </select>
        </label>
        <label className="filter-field">
          <span className="filter-label">View</span>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ViewFilter)}
          >
            <option value="feed">Feed</option>
            <option value="saved">Saved</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="feed-state" aria-busy="true">
          <p className="feed-placeholder">Loading your feed…</p>
          <div className="skeleton-lines" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : error ? (
        <div className="feed-state">
          <p className="feed-state-title">{error}</p>
          <button type="button" onClick={() => void loadPage()}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="feed-state">
          {hasFilters ? (
            <>
              <p className="feed-state-title">No stories match these filters.</p>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setTopicId("");
                  setSource("");
                  setView("feed");
                }}
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="feed-state-title">Your feed is quiet.</p>
              <p className="feed-state-body">
                Add topics and sources, then let ingest and ranking run. Seeded
                demos: try Topics and Sources after{" "}
                <code>pnpm db:seed</code> and{" "}
                <code>pnpm worker:ingest</code> /{" "}
                <code>pnpm worker:rank</code>.
              </p>
              <p className="feed-state-ctas">
                <Link href="/topics">Topics</Link>
                {" · "}
                <Link href="/sources">Sources</Link>
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="story-list">
          {items.map((item, index) => {
            const metaParts = [
              ...new Set(item.sources.map((s) => sourceLabel(s.sourceType))),
              item.author,
              formatPublished(item.publishedAt),
            ].filter(Boolean);
            return (
              <li
                key={item.articleId}
                className="story-row"
                style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
              >
                <div className="story-main">
                  <a
                    className="story-title"
                    href={item.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onTitleOpen(item)}
                  >
                    {item.title}
                  </a>
                  {item.reason ? (
                    <p className="story-reason">{item.reason}</p>
                  ) : null}
                  {metaParts.length > 0 ? (
                    <p className="story-meta">{metaParts.join(" · ")}</p>
                  ) : null}
                  {item.nearDuplicateOfArticleId ? (
                    <p className="story-note">
                      Similar to another story in your feed.
                    </p>
                  ) : null}
                  {item.status === "saved" || item.status === "seen" ? (
                    <p className="story-status">
                      {item.status === "saved" ? "Saved" : "Seen"}
                    </p>
                  ) : null}
                  {rowErrors[item.articleId] ? (
                    <p className="error">{rowErrors[item.articleId]}</p>
                  ) : null}
                </div>
                <div className="story-actions">
                  {view === "saved" ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void updateStatus(item.articleId, "seen")}
                    >
                      Remove from saved
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void updateStatus(item.articleId, "saved")}
                      disabled={item.status === "saved"}
                    >
                      Save
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      void updateStatus(item.articleId, "dismissed")
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !error && nextCursor ? (
        <div className="feed-more">
          <button
            type="button"
            className="ghost"
            disabled={loadingMore}
            onClick={() => void loadPage(nextCursor, true)}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
