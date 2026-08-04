"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  type FeedItem,
  type RankFeedLatestResponse,
  type Source,
  type Topic,
  type TopicTreeNode,
} from "@newsroom/api-client";
import { getBrowserApiClient } from "@/lib/api";
import { getTopicTree, topicPathLabels } from "@/lib/topic-tree";
import {
  formatEpisodeDuration,
  feedSourceTypeLabel,
  formatTopicMembership,
  sourceSubscriptionTitle,
  splitFeedReason,
} from "@/lib/feed";
import {
  pruneSourceId,
  pruneTopicIds,
  readStoredFeedPrefs,
  writeStoredFeedPrefs,
  type FeedSortField,
  type FeedSortOrder,
  type FeedSourceFilter,
  type FeedViewFilter,
} from "@/lib/feed-prefs";

type SourceFilter = FeedSourceFilter;
type ViewFilter = FeedViewFilter;
type SortField = FeedSortField;
type SortOrder = FeedSortOrder;

const SOURCE_OPTIONS: { id: SourceFilter; label: string }[] = [
  { id: "website", label: "Website" },
  { id: "community", label: "Community" },
  { id: "newsletter", label: "Newsletter" },
  { id: "podcast", label: "Podcast" },
  { id: "social_media", label: "Social" },
];

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
      parts.push(`AI scored ${aiScored} articles (including backlog).`);
    } else if (aiSkipped > 0 && aiScored === 0) {
      parts.push(
        "AI was not applied — per-run AI article limit or token budget reached (keyword scores only; try Rank latest again later)",
      );
    }
  }

  return `${parts.join(". ")}.`;
}

function topicFilterTooltip(topic: Topic): string {
  const keywords = topic.keywords
    .map((kw) => kw.trim())
    .filter(Boolean);
  const keywordBlock =
    keywords.length > 0 ? keywords.join(", ") : "No keywords";
  return `${keywordBlock}\n\nLeft-click: include · Right-click: exclude`;
}

function formatStoryMeta(item: FeedItem): string | null {
  const date = formatPublished(item.publishedAt);
  const primary = item.sources[0];
  if (!primary) return date;

  const type = feedSourceTypeLabel(primary.category);
  let name = primary.label?.trim() || null;
  if (!name && primary.category === "podcast" && item.showTitle?.trim()) {
    name = item.showTitle.trim();
  }
  const duration = formatEpisodeDuration(item.durationSeconds);
  const author =
    primary.adapter === "reddit" && item.author?.trim()
      ? item.author.trim()
      : null;
  const parts = [type, name, author, duration, date].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
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
    year: "numeric",
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

function StoryReason({
  reason,
  membership,
}: {
  reason: string | null;
  membership: ReactNode;
}): ReactNode {
  if (!reason?.trim()) {
    return membership ?? null;
  }
  const { keywordsLine, detail } = splitFeedReason(reason);
  if (keywordsLine && detail) {
    return (
      <>
        <p className="story-reason story-reason-keywords">{keywordsLine}</p>
        {membership}
        <p className="story-reason story-reason-ai">{detail}</p>
      </>
    );
  }
  if (keywordsLine) {
    return (
      <>
        <p className="story-reason story-reason-keywords">{keywordsLine}</p>
        {membership}
      </>
    );
  }
  return (
    <>
      {membership}
      <p className="story-reason">{reason}</p>
    </>
  );
}

function StoryTopics({
  matchedTopicIds,
  topicNameById,
  hasAiScore,
}: {
  matchedTopicIds: string[] | null | undefined;
  topicNameById: ReadonlyMap<string, string>;
  hasAiScore: boolean;
}): ReactNode {
  const line = formatTopicMembership({
    matchedTopicIds,
    topicNameById,
    hasAiScore,
  });
  if (!line) return null;
  const empty = matchedTopicIds?.length === 0;
  return (
    <p
      className={
        empty
          ? "story-reason story-reason-topics story-reason-topics-empty"
          : "story-reason story-reason-topics"
      }
    >
      {line}
    </p>
  );
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
  /** Empty set = show all topics (no include filter). */
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** Empty set = no topic exclusions. */
  const [excludedTopicIds, setExcludedTopicIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** Empty set = show all source types (no type filter). */
  const [selectedSources, setSelectedSources] = useState<Set<SourceFilter>>(
    () => new Set(),
  );
  /** null = all individual sources. */
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Source[]>([]);
  const [topicsReady, setTopicsReady] = useState(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [view, setView] = useState<ViewFilter>("feed");
  const [sort, setSort] = useState<SortField>("score");
  const [order, setOrder] = useState<SortOrder>("desc");
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
  /** Topics chip panel; restored from feed prefs. */
  const [topicsOpen, setTopicsOpen] = useState(true);
  /** Ignore stale feed responses when filters change mid-flight. */
  const loadGenRef = useRef(0);
  const rankingRef = useRef(false);
  const wipingRef = useRef(false);
  const rankAbortRef = useRef<AbortController | null>(null);
  const loadPageRef = useRef<(cursor?: string, append?: boolean) => Promise<void>>(
    async () => undefined,
  );

  useEffect(() => {
    return () => {
      rankAbortRef.current?.abort();
      rankAbortRef.current = null;
      rankingRef.current = false;
    };
  }, []);

  useEffect(() => {
    const prefs = readStoredFeedPrefs();
    setView(prefs.view);
    setSort(prefs.sort);
    setOrder(prefs.order);
    setSelectedSources(new Set(prefs.sources));
    setSelectedSourceId(prefs.sourceId);
    setSelectedTopicIds(new Set(prefs.topicIds));
    setExcludedTopicIds(new Set(prefs.excludedTopicIds));
    setTopicsOpen(prefs.topicsOpen);
    setPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    writeStoredFeedPrefs({
      view,
      sort,
      order,
      sources: [...selectedSources],
      sourceId: selectedSourceId,
      topicIds: [...selectedTopicIds],
      excludedTopicIds: [...excludedTopicIds],
      topicsOpen,
    });
  }, [
    prefsHydrated,
    view,
    sort,
    order,
    selectedSources,
    selectedSourceId,
    selectedTopicIds,
    excludedTopicIds,
    topicsOpen,
  ]);

  function toggleTopicsOpen() {
    setTopicsOpen((open) => !open);
  }

  const topicGroups = useMemo(
    () => groupTopics(topics, treeNodes),
    [topics, treeNodes],
  );

  const topicNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const topic of topics) map.set(topic.id, topic.name);
    return map;
  }, [topics]);

  const allTopicIds = useMemo(() => topics.map((t) => t.id), [topics]);

  // Empty selection = all topics (no API include filter). Any selection narrows.
  const topicIncludeActive = selectedTopicIds.size > 0;
  const topicExcludeActive = excludedTopicIds.size > 0;
  const topicFilterActive = topicIncludeActive || topicExcludeActive;
  // Empty selection = all source types. Any selection includes only those types.
  const sourceFilterActive = selectedSources.size > 0;

  const sourceOptions = useMemo(() => {
    const filtered = sourceFilterActive
      ? subscriptions.filter((s) => selectedSources.has(s.category))
      : subscriptions;
    return [...filtered].sort((a, b) =>
      sourceSubscriptionTitle(a).localeCompare(sourceSubscriptionTitle(b)),
    );
  }, [subscriptions, selectedSources, sourceFilterActive]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchDraft.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchDraft]);

  const loadPage = useCallback(
    async (cursor?: string, append = false) => {
      const gen = ++loadGenRef.current;
      if (append) setLoadingMore(true);
      else {
        // Keep the list visible while Rank latest runs — filter/search during
        // ranking used to flash the full-page loader and felt like a hang.
        if (!rankingRef.current && !wipingRef.current) {
          setLoading(true);
        }
        setError(null);
      }
      try {
        const page = await api.listFeed({
          cursor,
          topics: topicIncludeActive ? [...selectedTopicIds] : undefined,
          excludeTopics: topicExcludeActive
            ? [...excludedTopicIds]
            : undefined,
          sources: sourceFilterActive ? [...selectedSources] : undefined,
          sourceId: selectedSourceId || undefined,
          status:
            view === "saved"
              ? "saved"
              : view === "dismissed"
                ? "dismissed"
                : undefined,
          q: search || undefined,
          sort,
          order,
          limit: 20,
        });
        if (gen !== loadGenRef.current) return;
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
        if (gen !== loadGenRef.current) return;
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
        // Only the latest in-flight load owns the loading flags — older
        // requests must not clear them while a newer filter load is pending.
        if (gen === loadGenRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      api,
      router,
      search,
      selectedTopicIds,
      excludedTopicIds,
      selectedSources,
      selectedSourceId,
      topicIncludeActive,
      topicExcludeActive,
      sourceFilterActive,
      view,
      sort,
      order,
    ],
  );

  loadPageRef.current = loadPage;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.listTopics(),
      api.listTopicTree(),
      api.listSources(),
    ])
      .then(([topicsRes, treeRes, sourcesRes]) => {
        if (cancelled) return;
        const loaded = topicsRes.topics;
        setTopics(loaded);
        setTreeNodes(treeRes.nodes);
        setSubscriptions(sourcesRes.sources);
        setTopicsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = getTopicTree();
        setTopics([]);
        setTreeNodes(fallback.nodes);
        setSubscriptions([]);
        setTopicsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!prefsHydrated || !topicsReady) return;
    setSelectedTopicIds((prev) => {
      const pruned = pruneTopicIds([...prev], allTopicIds);
      if (
        pruned.length === prev.size &&
        pruned.every((id) => prev.has(id))
      ) {
        return prev;
      }
      return new Set(pruned);
    });
    setExcludedTopicIds((prev) => {
      const pruned = pruneTopicIds([...prev], allTopicIds);
      if (
        pruned.length === prev.size &&
        pruned.every((id) => prev.has(id))
      ) {
        return prev;
      }
      return new Set(pruned);
    });
    setSelectedSourceId((prev) =>
      pruneSourceId(
        prev,
        subscriptions.map((s) => s.id),
      ),
    );
  }, [prefsHydrated, topicsReady, allTopicIds, subscriptions]);

  useEffect(() => {
    if (!selectedSourceId) return;
    if (sourceOptions.some((s) => s.id === selectedSourceId)) return;
    setSelectedSourceId(null);
  }, [selectedSourceId, sourceOptions]);

  useEffect(() => {
    if (!topicsReady || !prefsHydrated) return;
    void loadPage();
  }, [loadPage, topicsReady, prefsHydrated]);

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
        action === "saved" ||
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
    setExcludedTopicIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function negateTopic(id: string) {
    setSelectedTopicIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setExcludedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: TopicGroup) {
    const ids = group.topics.map((t) => t.id);
    setExcludedTopicIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) {
        if (next.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
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

  function toggleSource(id: SourceFilter) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onRankLatest() {
    if (rankingRef.current || wipingRef.current) return;
    rankingRef.current = true;
    setRanking(true);
    setRankNote(null);
    setError(null);

    // Route maxDuration is 300s; keep client wait slightly above so a late 200
    // is not aborted just as the server finishes.
    const ac = new AbortController();
    rankAbortRef.current?.abort();
    rankAbortRef.current = ac;
    const timeoutId = window.setTimeout(() => ac.abort(), 340_000);
    let refreshAfter = true;

    try {
      const result = await api.rankFeedLatest({ signal: ac.signal });
      if (ac.signal.aborted) {
        setRankNote(
          "Ranking stopped or timed out — check Ollama, then try Rank latest again.",
        );
      } else {
        setRankNote(formatRankLatestNote(result));
        setNeedsRank(false);
      }
    } catch (err) {
      if (ac.signal.aborted) {
        setRankNote(
          "Ranking stopped or timed out — check Ollama, then try Rank latest again.",
        );
      } else if (err instanceof ApiError && err.status === 401) {
        refreshAfter = false;
        router.push("/sign-in?callbackUrl=%2F");
      } else if (err instanceof ApiError && err.code === "rate_limited") {
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
      window.clearTimeout(timeoutId);
      if (rankAbortRef.current === ac) rankAbortRef.current = null;
      // Drop Ranking… before refresh so filter races cannot leave it stuck.
      rankingRef.current = false;
      setRanking(false);
      // Always refresh — server may have written scores even if the client timed out.
      if (refreshAfter) {
        try {
          await loadPageRef.current();
        } catch {
          /* loadPage sets its own error */
        }
      }
    }
  }

  async function onWipeRankings() {
    if (rankingRef.current || wipingRef.current) return;
    if (
      !window.confirm(
        "Clear ranked feed items? Saved and Dismissed stay. Rank latest when you want a fresh feed.",
      )
    ) {
      return;
    }
    wipingRef.current = true;
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
      wipingRef.current = false;
      setWiping(false);
      await loadPageRef.current();
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
      wipingRef.current = false;
      setWiping(false);
    }
  }

  const hasFilters = Boolean(
    topicFilterActive ||
      sourceFilterActive ||
      selectedSourceId ||
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
              <div
                className="feed-stat"
                title="Keyword hits within article retention (AI may still be pending)"
              >
                <dt>Ranked</dt>
                <dd>{rankedCount}</dd>
              </div>
              <div
                className="feed-stat"
                title="Keyword-checked within article retention"
              >
                <dt>Evaluated</dt>
                <dd>{evaluatedCount}</dd>
              </div>
              <div
                className="feed-stat"
                title="From enabled sources within article retention (ARTICLE_TTL_DAYS)"
              >
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
            <span
              title={
                absoluteTimeTitle(lastRankedAt) ||
                "Last time your ranking pass finished"
              }
            >
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
        <div className="source-filter" role="group" aria-label="Source types">
          <span className="filter-label">Source types</span>
          <div className="topic-filter-chips">
            {SOURCE_OPTIONS.map((opt) => {
              const on = selectedSources.has(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={on ? "topic-filter-chip on" : "topic-filter-chip"}
                  aria-pressed={on}
                  onClick={() => toggleSource(opt.id)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <label className="filter-field source-subscription-filter">
            <span className="filter-label">Source</span>
            <select
              value={selectedSourceId ?? ""}
              onChange={(e) =>
                setSelectedSourceId(e.target.value ? e.target.value : null)
              }
            >
              <option value="">All</option>
              {sourceOptions.map((source) => (
                <option key={source.id} value={source.id}>
                  {sourceSubscriptionTitle(source)}
                </option>
              ))}
            </select>
          </label>
        </div>

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
                            const included = selectedTopicIds.has(topic.id);
                            const excluded = excludedTopicIds.has(topic.id);
                            return (
                              <button
                                key={topic.id}
                                type="button"
                                className={
                                  excluded
                                    ? "topic-filter-chip exclude"
                                    : included
                                      ? "topic-filter-chip on"
                                      : "topic-filter-chip"
                                }
                                aria-pressed={included}
                                aria-label={
                                  excluded
                                    ? `${topic.name} (excluded)`
                                    : topic.name
                                }
                                title={topicFilterTooltip(topic)}
                                onClick={() => toggleTopic(topic.id)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  negateTopic(topic.id);
                                }}
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
              {[
                topicIncludeActive
                  ? `${selectedTopicIds.size} included`
                  : null,
                topicExcludeActive
                  ? `${excludedTopicIds.size} excluded`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
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

        <div className="feed-view-sort" role="group" aria-label="View and sort">
          <label className="filter-field filter-field-view">
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
          <div className="feed-sort" role="group" aria-label="Sort">
            <span className="filter-label">Sort</span>
            <div className="feed-sort-controls">
              <select
                value={sort}
                aria-label="Sort by"
                onChange={(e) => setSort(e.target.value as SortField)}
              >
                <option value="score">Score</option>
                <option value="date">Date</option>
              </select>
              <select
                value={order}
                aria-label="Sort order"
                onChange={(e) => setOrder(e.target.value as SortOrder)}
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>
          </div>
        </div>

        <label className="filter-field feed-search-field">
          <span className="filter-label">Search</span>
          <input
            type="search"
            value={searchDraft}
            placeholder='Words; "exact phrase"; -word to exclude…'
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
      </div>

      {loading || !topicsReady || !prefsHydrated ? (
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
                  setSelectedTopicIds(new Set());
                  setExcludedTopicIds(new Set());
                  setSelectedSources(new Set());
                  setSelectedSourceId(null);
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
            const meta = formatStoryMeta(item);
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
                  <StoryReason
                    reason={item.reason}
                    membership={
                      <StoryTopics
                        matchedTopicIds={item.matchedTopicIds}
                        topicNameById={topicNameById}
                        hasAiScore={
                          item.aiScore !== null && item.aiScore !== undefined
                        }
                      />
                    }
                  />
                  {meta ? <p className="story-meta">{meta}</p> : null}
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
