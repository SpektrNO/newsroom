"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  type FeedItem,
  type RankFeedLatestResponse,
  type SourceTypeV1,
  type Topic,
  type TopicTreeNode,
} from "@newsroom/api-client";
import { getBrowserApiClient } from "@/lib/api";
import { getTopicTree, topicPathLabels } from "@/lib/topic-tree";
import { formatEpisodeDuration } from "@/lib/feed";

type SourceFilter = "" | SourceTypeV1;
type ViewFilter = "feed" | "saved" | "dismissed";

type TopicGroup = {
  root: string;
  topics: Topic[];
};

function formatRankLatestNote(result: RankFeedLatestResponse): string {
  const aiScored = result.aiScored ?? 0;
  const aiSkipped = result.aiSkipped ?? 0;
  const parts: string[] = [];

  if (result.scored > 0) {
    parts.push(
      `Added ${result.scored} keyword match${result.scored === 1 ? "" : "es"} to your feed`,
    );
  } else if (result.evaluated > 0) {
    parts.push(
      `Checked ${result.evaluated} article${result.evaluated === 1 ? "" : "s"} — no new keyword matches`,
    );
  } else if (aiScored > 0) {
    parts.push(
      `Applied AI to ${aiScored} already-ranked article${aiScored === 1 ? "" : "s"}`,
    );
  } else {
    parts.push("Nothing left to rank right now");
  }

  if (result.scored > 0 || result.evaluated > 0 || aiScored > 0) {
    if (aiScored > 0 && aiSkipped > 0) {
      parts.push(
        `AI scored ${aiScored}; ${aiSkipped} stayed keyword-only (per-run limit or token budget)`,
      );
    } else if (aiScored > 0 && result.scored > 0) {
      parts.push(`AI scored ${aiScored} of them`);
    } else if (aiSkipped > 0 && aiScored === 0) {
      parts.push(
        "AI was not applied — per-run AI article limit or token budget reached (keyword scores only; try Rank latest again later)",
      );
    }
  }

  return `${parts.join(". ")}.`;
}

function sourceLabel(type: string): string {
  if (type === "hackernews") return "Hacker News";
  if (type === "substack") return "Feed";
  if (type === "podcast") return "Podcast";
  if (type === "bluesky") return "Bluesky";
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

function formatPipelineTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  return formatPublished(iso) ?? "never";
}

function absoluteTimeTitle(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString();
}

function formatRank(score: number): string {
  if (!Number.isFinite(score)) return "—";
  return score.toFixed(2);
}

function rankDetail(item: FeedItem): string {
  const parts = [`Keyword ${formatRank(item.keywordScore)}`];
  if (item.aiScore !== null && item.aiScore !== undefined) {
    parts.push(`AI ${formatRank(item.aiScore)}`);
  } else {
    parts.push("keywords only (no AI yet)");
  }
  parts.push(`Final ${formatRank(item.finalRank)}`);
  return parts.join(" · ");
}

function groupRootForTopic(
  topic: Topic,
  treeNodes: TopicTreeNode[],
): string {
  const fromCatalog = topicPathLabels(topic.name);
  if (fromCatalog?.[0]) return fromCatalog[0];
  const byId = new Map(treeNodes.map((n) => [n.id, n]));
  const needle = topic.name.trim().toLowerCase();
  const node = treeNodes.find((n) => n.label.toLowerCase() === needle);
  if (node) {
    let current: TopicTreeNode | undefined = node;
    let root = node.label;
    while (current?.parentId) {
      current = byId.get(current.parentId);
      if (current) root = current.label;
    }
    return root;
  }
  return "Other";
}

function groupTopics(
  topics: Topic[],
  treeNodes: TopicTreeNode[],
): TopicGroup[] {
  const map = new Map<string, Topic[]>();
  for (const topic of topics) {
    const root = groupRootForTopic(topic, treeNodes);
    const list = map.get(root) ?? [];
    list.push(topic);
    map.set(root, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([root, groupTopicsList]) => ({
      root,
      topics: groupTopicsList.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function FeedClient(): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [treeNodes, setTreeNodes] = useState<TopicTreeNode[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  /** Empty set = show all topics (no topic filter). */
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [topicsReady, setTopicsReady] = useState(false);
  const [source, setSource] = useState<SourceFilter>("");
  const [view, setView] = useState<ViewFilter>("feed");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [lastIngestAt, setLastIngestAt] = useState<string | null>(null);
  const [lastRankedAt, setLastRankedAt] = useState<string | null>(null);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);
  const [rankedCount, setRankedCount] = useState<number | null>(null);
  const [evaluatedCount, setEvaluatedCount] = useState<number | null>(null);
  const [articlesCount, setArticlesCount] = useState<number | null>(null);
  const [needsRank, setNeedsRank] = useState(false);
  const [ranking, setRanking] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [rankNote, setRankNote] = useState<string | null>(null);
  /** Topics chip panel; restored from localStorage after mount. */
  const [topicsOpen, setTopicsOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("newsroom.feed.topicsOpen");
      if (stored === "0") setTopicsOpen(false);
      if (stored === "1") setTopicsOpen(true);
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  function toggleTopicsOpen() {
    setTopicsOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(
          "newsroom.feed.topicsOpen",
          next ? "1" : "0",
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const topicGroups = useMemo(
    () => groupTopics(topics, treeNodes),
    [topics, treeNodes],
  );

  const allTopicIds = useMemo(() => topics.map((t) => t.id), [topics]);

  // Empty selection = all topics (no API filter). Any selection narrows the feed.
  const topicFilterActive = selectedTopicIds.size > 0;

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchDraft.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchDraft]);

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
          topics: topicFilterActive ? [...selectedTopicIds] : undefined,
          source: source || undefined,
          status:
            view === "saved"
              ? "saved"
              : view === "dismissed"
                ? "dismissed"
                : undefined,
          q: search || undefined,
          limit: 20,
        });
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
        if (!append) {
          setLastIngestAt(page.lastIngestAt ?? null);
          setLastRankedAt(page.lastRankedAt ?? null);
          setMatchedCount(
            typeof page.matchedCount === "number" ? page.matchedCount : null,
          );
          setRankedCount(
            typeof page.rankedCount === "number"
              ? page.rankedCount
              : typeof page.totalCount === "number"
                ? page.totalCount
                : null,
          );
          setEvaluatedCount(
            typeof page.evaluatedCount === "number"
              ? page.evaluatedCount
              : null,
          );
          setArticlesCount(
            typeof page.articlesCount === "number"
              ? page.articlesCount
              : null,
          );
          setNeedsRank(Boolean(page.needsRank));
        }
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
        if (!append) {
          setItems([]);
          setMatchedCount(null);
          setRankedCount(null);
          setEvaluatedCount(null);
          setArticlesCount(null);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [api, router, source, search, selectedTopicIds, topicFilterActive, view],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.listTopics(), api.listTopicTree()])
      .then(([topicsRes, treeRes]) => {
        if (cancelled) return;
        setTopics(topicsRes.topics);
        setTreeNodes(treeRes.nodes);
        setSelectedTopicIds(new Set());
        setTopicsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = getTopicTree();
        setTopics([]);
        setTreeNodes(fallback.nodes);
        setSelectedTopicIds(new Set());
        setTopicsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!topicsReady) return;
    void loadPage();
  }, [loadPage, topicsReady]);

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

      if (
        action === "dismissed" ||
        (view === "saved" && action === "seen") ||
        (view === "dismissed" && (action === "seen" || action === "saved"))
      ) {
        setItems((prev) => prev.filter((i) => i.articleId !== articleId));
        setRankedCount((prev) =>
          prev == null ? prev : Math.max(0, prev - 1),
        );
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

  function toggleTopic(id: string) {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: TopicGroup) {
    const ids = group.topics.map((t) => t.id);
    setSelectedTopicIds((prev) => {
      const allOn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }

  function selectAllTopics() {
    // "All" = no topic filter (full feed). Chips stay unselected.
    setSelectedTopicIds(new Set());
  }

  async function onRankLatest() {
    if (ranking || wiping) return;
    setRanking(true);
    setRankNote(null);
    setError(null);
    try {
      const result = await api.rankFeedLatest();
      setRankNote(formatRankLatestNote(result));
      await loadPage();
      setNeedsRank(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/sign-in?callbackUrl=%2F");
        return;
      }
      if (err instanceof ApiError && err.code === "rate_limited") {
        setRankNote("Too many rank requests — wait a few minutes.");
      } else if (err instanceof ApiError && err.code === "no_topics") {
        setRankNote("Follow an enabled topic before ranking.");
      } else if (err instanceof ApiError && err.code === "ai_unavailable") {
        setRankNote(
          "Ranking unavailable — check Settings / Ollama, then retry.",
        );
      } else {
        setRankNote("Couldn't rank — try again.");
      }
    } finally {
      setRanking(false);
    }
  }

  async function onWipeRankings() {
    if (ranking || wiping) return;
    if (
      !window.confirm(
        "Clear ranked feed items? Saved and Dismissed stay. Rank latest when you want a fresh feed.",
      )
    ) {
      return;
    }
    setWiping(true);
    setRankNote(null);
    setError(null);
    try {
      const result = await api.wipeFeedRankings();
      const scores = result.scoresDeleted;
      setRankNote(
        scores === 0
          ? "No ranked items to clear."
          : `Cleared ${scores} ranked item${scores === 1 ? "" : "s"}. Saved and Dismissed unchanged.`,
      );
      await loadPage();
      setNeedsRank(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/sign-in?callbackUrl=%2F");
        return;
      }
      if (err instanceof ApiError && err.code === "rate_limited") {
        setRankNote("Too many wipe requests — wait a few minutes.");
      } else {
        setRankNote("Couldn't wipe rankings — try again.");
      }
    } finally {
      setWiping(false);
    }
  }

  const hasFilters = Boolean(
    topicFilterActive ||
      source ||
      view === "saved" ||
      view === "dismissed" ||
      search,
  );

  return (
    <section>
      <div className="feed-pipeline-row">
        <div
          className={needsRank ? "feed-stats needs-rank" : "feed-stats"}
          aria-live="polite"
        >
          {rankedCount != null &&
          evaluatedCount != null &&
          articlesCount != null ? (
            <dl className="feed-stat-group">
              <div className="feed-stat" title="Ranked (in feed)">
                <dt>Ranked</dt>
                <dd>{rankedCount}</dd>
              </div>
              <div className="feed-stat" title="Keyword-evaluated">
                <dt>Evaluated</dt>
                <dd>{evaluatedCount}</dd>
              </div>
              <div className="feed-stat" title="Available from sources">
                <dt>Articles</dt>
                <dd>{articlesCount}</dd>
              </div>
            </dl>
          ) : null}
          <span className="feed-stat-times">
            <span title={absoluteTimeTitle(lastIngestAt)}>
              Ingested {formatPipelineTime(lastIngestAt)}
            </span>
            <span className="feed-pipeline-sep" aria-hidden>
              ·
            </span>
            <span title={absoluteTimeTitle(lastRankedAt)}>
              Ranked {formatPipelineTime(lastRankedAt)}
            </span>
          </span>
        </div>
        <div className="feed-actions">
          <button
            type="button"
            className="ghost feed-rank-btn"
            disabled={ranking || wiping}
            onClick={() => void onRankLatest()}
          >
            {ranking ? "Ranking…" : "Rank latest"}
          </button>
          <button
            type="button"
            className="ghost feed-rank-btn"
            disabled={ranking || wiping}
            onClick={() => void onWipeRankings()}
          >
            {wiping ? "Wiping…" : "Wipe rankings"}
          </button>
        </div>
      </div>
      {rankNote ? (
        <p className="feed-rank-note" aria-live="polite">
          {rankNote}
        </p>
      ) : null}
      {needsRank && !ranking && !wiping ? (
        <p className="feed-rank-note" aria-live="polite">
          Feed updating…
        </p>
      ) : null}
      <div className="feed-filters" role="group" aria-label="Feed filters">
        <label className="filter-field feed-search-field">
          <span className="filter-label">Search</span>
          <input
            type="search"
            value={searchDraft}
            placeholder="Title, summary, or reason…"
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setSearch(searchDraft.trim());
              }
            }}
            aria-label="Search feed"
          />
        </label>

        <div className="topic-filter" role="group" aria-label="Topics">
          <div className="topic-filter-header">
            <button
              type="button"
              className="topic-filter-collapse"
              aria-expanded={topicsOpen}
              aria-controls="feed-topic-filter-body"
              onClick={toggleTopicsOpen}
            >
              <span className="topic-filter-collapse-chevron" aria-hidden>
                {topicsOpen ? "▾" : "▸"}
              </span>
              <span className="filter-label">Topics</span>
            </button>
            {topics.length > 0 ? (
              <span className="topic-filter-actions">
                <button
                  type="button"
                  className="ghost topic-filter-link"
                  aria-pressed={!topicFilterActive}
                  onClick={selectAllTopics}
                >
                  All
                </button>
              </span>
            ) : null}
          </div>
          {topicsOpen ? (
            <div id="feed-topic-filter-body">
              {topics.length === 0 ? (
                <p className="topic-filter-empty">
                  No topics yet.{" "}
                  <Link href="/topics">Follow topics</Link> to filter your feed.
                </p>
              ) : (
                <ul className="topic-filter-groups">
                  {topicGroups.map((group) => {
                    const groupIds = group.topics.map((t) => t.id);
                    const selectedCount = groupIds.filter((id) =>
                      selectedTopicIds.has(id),
                    ).length;
                    const groupAllOn = selectedCount === groupIds.length;
                    return (
                      <li key={group.root} className="topic-filter-group">
                        <button
                          type="button"
                          className={
                            groupAllOn
                              ? "topic-filter-group-toggle on"
                              : "topic-filter-group-toggle"
                          }
                          aria-pressed={groupAllOn}
                          onClick={() => toggleGroup(group)}
                        >
                          {group.root}
                        </button>
                        <div className="topic-filter-chips">
                          {group.topics.map((topic) => {
                            const on = selectedTopicIds.has(topic.id);
                            return (
                              <button
                                key={topic.id}
                                type="button"
                                className={
                                  on
                                    ? "topic-filter-chip on"
                                    : "topic-filter-chip"
                                }
                                aria-pressed={on}
                                onClick={() => toggleTopic(topic.id)}
                              >
                                {topic.name}
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
          {topicFilterActive ? (
            <p className="topic-filter-hint">
              Showing {selectedTopicIds.size} of {allTopicIds.length} topics
              {matchedCount != null
                ? ` · ${matchedCount} article${matchedCount === 1 ? "" : "s"}`
                : null}
            </p>
          ) : topics.length > 0 ? (
            <p className="topic-filter-hint">
              All topics
              {matchedCount != null
                ? ` · ${matchedCount} article${matchedCount === 1 ? "" : "s"}`
                : null}
            </p>
          ) : null}
        </div>

        <label className="filter-field">
          <span className="filter-label">Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SourceFilter)}
          >
            <option value="">All sources</option>
            <option value="hackernews">Hacker News</option>
            <option value="substack">Feed</option>
            <option value="podcast">Podcast</option>
            <option value="bluesky">Bluesky</option>
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
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
      </div>

      {loading || !topicsReady ? (
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
                  selectAllTopics();
                  setSource("");
                  setView("feed");
                  setSearchDraft("");
                  setSearch("");
                }}
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="feed-state-title">Your feed is quiet.</p>
              <p className="feed-state-body">
                Follow a topic and add a source to get started.
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
              item.showTitle,
              formatEpisodeDuration(item.durationSeconds),
              item.author,
              formatPublished(item.publishedAt),
            ].filter(Boolean);
            const playAudio =
              item.enclosureUrl &&
              item.enclosureUrl !== item.canonicalUrl
                ? item.enclosureUrl
                : null;
            return (
              <li
                key={item.articleId}
                className="story-row"
                style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
              >
                <div className="story-main">
                  <div className="story-heading">
                    <a
                      className="story-title"
                      href={item.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onTitleOpen(item)}
                    >
                      {item.title}
                    </a>
                    <span
                      className="story-rank"
                      title={rankDetail(item)}
                      aria-label={`Rank ${formatRank(item.finalRank)}`}
                    >
                      {formatRank(item.finalRank)}
                    </span>
                  </div>
                  {item.reason ? (
                    <p className="story-reason">{item.reason}</p>
                  ) : null}
                  {metaParts.length > 0 ? (
                    <p className="story-meta">{metaParts.join(" · ")}</p>
                  ) : null}
                  {playAudio ? (
                    <p className="story-meta">
                      <a
                        href={playAudio}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Play audio
                      </a>
                    </p>
                  ) : null}
                  {item.nearDuplicateOfArticleId ? (
                    <p className="story-note">
                      Similar to another story in your feed.
                    </p>
                  ) : null}
                  {item.status === "saved" ||
                  item.status === "seen" ||
                  item.status === "dismissed" ? (
                    <p className="story-status">
                      {item.status === "saved"
                        ? "Saved"
                        : item.status === "dismissed"
                          ? "Dismissed"
                          : "Seen"}
                    </p>
                  ) : null}
                  {rowErrors[item.articleId] ? (
                    <p className="error">{rowErrors[item.articleId]}</p>
                  ) : null}
                </div>
                <div className="story-actions">
                  {view === "dismissed" ? (
                    <>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          void updateStatus(item.articleId, "seen")
                        }
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void updateStatus(item.articleId, "saved")
                        }
                      >
                        Save
                      </button>
                    </>
                  ) : view === "saved" ? (
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
                      onClick={() => void updateStatus(item.articleId, "saved")}
                      disabled={item.status === "saved"}
                    >
                      Save
                    </button>
                  )}
                  {view === "dismissed" ? null : (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void updateStatus(item.articleId, "dismissed")
                      }
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && topicsReady && !error && nextCursor ? (
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
