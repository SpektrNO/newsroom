"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  type FeedCatalogEntry,
  type Source,
  type SourceCategoryV1,
} from "@newsroom/api-client";
import { defaultRssCategory } from "@newsroom/sources/community-host";
import { getBrowserApiClient } from "@/lib/api";
import { isCatalogEntryAlreadyAdded } from "@/lib/feed-catalog-match";
import {
  FEED_CATALOG_CATEGORIES,
  catalogEntryKind,
  listCatalogTopicTags,
  type FeedCatalogCategory,
} from "@/lib/feed-catalog";

type AddKind =
  | "website"
  | "community"
  | "newsletter"
  | "podcast"
  | "social_media";

type CommunityAddMode = "reddit" | "rss";

function configSummary(source: Source): string {
  if (source.adapter === "hackernews") {
    const mode = source.config.mode === "new" ? "New" : "Top";
    return `${categoryLabel(source.category)} · ${mode} stories`;
  }
  if (source.adapter === "rss") {
    const url =
      typeof source.config.rssUrl === "string" ? source.config.rssUrl : "";
    return url
      ? `${categoryLabel(source.category)} · ${url}`
      : categoryLabel(source.category);
  }
  if (source.adapter === "bluesky") {
    const handle =
      typeof source.config.handle === "string" ? source.config.handle : "";
    const did =
      typeof source.config.did === "string" ? source.config.did : "";
    const id = handle || did;
    return id
      ? `${categoryLabel(source.category)} · ${id}`
      : categoryLabel(source.category);
  }
  if (source.adapter === "reddit") {
    return categoryLabel(source.category);
  }
  return categoryLabel(source.category);
}

/** Primary label in Me — adapter identity, not only the category bucket. */
function sourceTitle(source: Source): string {
  if (source.adapter === "hackernews") return "Hacker News";
  if (source.adapter === "reddit") {
    const sub =
      typeof source.config.subreddit === "string"
        ? source.config.subreddit.trim().replace(/^\/?(r\/)/i, "")
        : "";
    return sub ? `r/${sub}` : "Reddit";
  }
  if (source.adapter === "bluesky") {
    const handle =
      typeof source.config.handle === "string"
        ? source.config.handle.trim().replace(/^@+/, "")
        : "";
    return handle ? `@${handle}` : "Social account";
  }
  if (source.adapter === "rss") {
    const raw =
      typeof source.config.rssUrl === "string" ? source.config.rssUrl : "";
    if (raw) {
      try {
        return new URL(raw).hostname.replace(/^www\./, "");
      } catch {
        /* fall through */
      }
    }
    return categoryLabel(source.category);
  }
  return categoryLabel(source.category);
}

function categoryLabel(category: string): string {
  if (category === "podcast") return "Podcast";
  if (category === "website") return "Website";
  if (category === "newsletter") return "Newsletter";
  if (category === "social_media") return "Social";
  if (category === "community") return "Community";
  return category;
}

/** Suggested-row prefix aligned with the active shelf, not ingest kind. */
function catalogShelfLabel(shelf: FeedCatalogCategory): string {
  if (shelf === "websites") return "Site";
  if (shelf === "communities") return "Community";
  if (shelf === "newsletters") return "Newsletter";
  if (shelf === "podcasts") return "Podcast";
  if (shelf === "social_media") return "Social";
  return "Source";
}

/** Persist category for a catalog RSS shelf row (1:1 with Suggested tabs). */
function catalogRssCategory(
  shelf: FeedCatalogCategory,
  rssUrl: string,
): SourceCategoryV1 {
  if (shelf === "podcasts") return "podcast";
  if (shelf === "websites") return "website";
  if (shelf === "newsletters") return "newsletter";
  if (shelf === "communities") return "community";
  return defaultRssCategory(rssUrl);
}

export function SourcesClient(): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();
  const [sources, setSources] = useState<Source[]>([]);
  const [catalog, setCatalog] = useState<FeedCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [catalogNote, setCatalogNote] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<AddKind>("website");
  const [communityMode, setCommunityMode] =
    useState<CommunityAddMode>("reddit");
  const [rssUrl, setRssUrl] = useState("");
  const [blueskyHandle, setBlueskyHandle] = useState("");
  const [redditSubreddit, setRedditSubreddit] = useState("");
  const [pending, setPending] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [suggestedTab, setSuggestedTab] =
    useState<FeedCatalogCategory>("websites");
  const [meOpen, setMeOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourcesRes, catalogRes] = await Promise.all([
        api.listSources(),
        api.listFeedCatalog(),
      ]);
      setSources(sourcesRes.sources);
      setCatalog(catalogRes.feeds);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/sign-in?callbackUrl=%2Fsources");
        return;
      }
      setError("Couldn't load sources.");
    } finally {
      setLoading(false);
    }
  }, [api, router]);

  /** Soft reload after mutations — keeps the page mounted (no scroll jump). */
  const reloadSources = useCallback(async () => {
    try {
      const sourcesRes = await api.listSources();
      setSources(sourcesRes.sources);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/sign-in?callbackUrl=%2Fsources");
        return;
      }
      setError("Couldn't refresh sources.");
    }
  }, [api, router]);

  function rememberSource(source: Source) {
    setSources((prev) => {
      if (prev.some((s) => s.id === source.id)) {
        return prev.map((s) => (s.id === source.id ? source : s));
      }
      return [...prev, source];
    });
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasHn = sources.some((s) => s.adapter === "hackernews");
  const topicTags = useMemo(() => listCatalogTopicTags(catalog), [catalog]);
  const visibleCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalog.filter((f) => {
      if (f.category !== suggestedTab) return false;
      if (isCatalogEntryAlreadyAdded(sources, f)) return false;
      if (
        tagFilter &&
        !f.topicTags.some((t) => t.toLowerCase() === tagFilter.toLowerCase())
      ) {
        return false;
      }
      if (!q) return true;
      const kind = catalogEntryKind(f);
      const hay =
        `${f.label} ${f.blurb} ${f.topicTags.join(" ")} ${kind} ${f.subreddit ?? ""} ${f.rssUrl ?? ""} ${f.handle ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, sources, suggestedTab, tagFilter, catalogSearch]);

  function selectAddKind(kind: AddKind) {
    setAddKind(kind);
    setFormError(null);
  }

  async function addHackerNews() {
    setFormError(null);
    setPending(true);
    try {
      const res = await api.createSource({
        category: "community",
        adapter: "hackernews",
        config: { mode: "top" },
      });
      rememberSource(res.source);
    } catch (err) {
      mapSourceError(err, setFormError);
    } finally {
      setPending(false);
    }
  }

  async function onAddSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      let created: Source;
      if (addKind === "social_media") {
        const res = await api.createSource({
          category: "social_media",
          adapter: "bluesky",
          config: { handle: blueskyHandle.trim() },
        });
        created = res.source;
        setBlueskyHandle("");
      } else if (addKind === "community" && communityMode === "reddit") {
        const res = await api.createSource({
          category: "community",
          adapter: "reddit",
          config: { subreddit: redditSubreddit.trim() },
        });
        created = res.source;
        setRedditSubreddit("");
      } else if (addKind === "podcast") {
        const res = await api.createSource({
          category: "podcast",
          adapter: "rss",
          config: { rssUrl: rssUrl.trim() },
        });
        created = res.source;
        setRssUrl("");
      } else if (addKind === "newsletter") {
        const res = await api.createSource({
          category: "newsletter",
          adapter: "rss",
          config: { rssUrl: rssUrl.trim() },
        });
        created = res.source;
        setRssUrl("");
      } else if (addKind === "community") {
        const url = rssUrl.trim();
        const res = await api.createSource({
          category: "community",
          adapter: "rss",
          config: { rssUrl: url },
        });
        created = res.source;
        setRssUrl("");
      } else {
        const url = rssUrl.trim();
        const res = await api.createSource({
          category: "website",
          adapter: "rss",
          config: { rssUrl: url },
        });
        created = res.source;
        setRssUrl("");
      }
      rememberSource(created);
    } catch (err) {
      mapSourceError(
        err,
        setFormError,
        addKind === "social_media"
          ? "Check the handle."
          : addKind === "community" && communityMode === "reddit"
            ? "Check the subreddit name."
            : "Check the RSS URL.",
      );
    } finally {
      setPending(false);
    }
  }

  async function addCatalogFeed(feed: FeedCatalogEntry) {
    setCatalogNote(null);
    setAddingId(feed.id);
    const kind = catalogEntryKind(feed);
    try {
      let created: Source;
      if (kind === "reddit") {
        const subreddit = feed.subreddit?.trim();
        if (!subreddit) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        const res = await api.createSource({
          category: "community",
          adapter: "reddit",
          config: { subreddit },
          enabled: true,
        });
        created = res.source;
      } else if (kind === "bluesky") {
        const handle = feed.handle?.trim();
        if (!handle) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        const res = await api.createSource({
          category: "social_media",
          adapter: "bluesky",
          config: { handle },
          enabled: true,
        });
        created = res.source;
      } else if (kind === "podcast") {
        const url = feed.rssUrl?.trim();
        if (!url) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        const res = await api.createSource({
          category: "podcast",
          adapter: "rss",
          config: { rssUrl: url },
          enabled: true,
        });
        created = res.source;
      } else {
        const url = feed.rssUrl?.trim();
        if (!url) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        const res = await api.createSource({
          category: catalogRssCategory(feed.category, url),
          adapter: "rss",
          config: { rssUrl: url },
          enabled: true,
        });
        created = res.source;
      }
      rememberSource(created);
      setCatalogNote(`Added ${feed.label}.`);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "duplicate" || err.status === 409)) {
        setCatalogNote("That source is already added.");
        await reloadSources();
      } else {
        mapSourceError(
          err,
          setCatalogNote,
          kind === "reddit"
            ? "Check the subreddit name."
            : kind === "bluesky"
              ? "Check the handle."
              : "Check the RSS URL.",
        );
      }
    } finally {
      setAddingId(null);
    }
  }

  async function toggleEnabled(source: Source) {
    try {
      const res = await api.patchSource(source.id, {
        enabled: !source.enabled,
      });
      rememberSource(res.source);
    } catch {
      setError("Couldn't update source — try again.");
    }
  }

  async function onDelete(source: Source) {
    if (!window.confirm("Remove this source?")) return;
    try {
      await api.deleteSource(source.id);
      setSources((prev) => prev.filter((s) => s.id !== source.id));
    } catch {
      setError("Couldn't remove source — try again.");
    }
  }

  const addField =
    addKind === "social_media" ? (
      <label>
        Handle
        <input
          type="text"
          value={blueskyHandle}
          onChange={(e) => setBlueskyHandle(e.target.value)}
          placeholder="jay.bsky.social"
          required
          autoComplete="off"
          spellCheck={false}
        />
      </label>
    ) : addKind === "community" && communityMode === "reddit" ? (
      <label>
        Subreddit
        <input
          type="text"
          value={redditSubreddit}
          onChange={(e) => setRedditSubreddit(e.target.value)}
          placeholder="programming"
          required
          autoComplete="off"
          spellCheck={false}
        />
      </label>
    ) : (
      <label>
        RSS URL
        <input
          type="url"
          value={rssUrl}
          onChange={(e) => setRssUrl(e.target.value)}
          placeholder={
            addKind === "podcast"
              ? "https://feeds.example.com/show.xml"
              : addKind === "newsletter"
                ? "https://tldr.tech/rss"
                : addKind === "community"
                  ? "https://importai.substack.com/feed"
                  : "https://www.schneier.com/feed/atom/"
          }
          required
        />
      </label>
    );

  return (
    <section className="manage-page">
      <header className="page-header">
        <h1 className="page-title">Sources</h1>
        <p className="page-lede">
          What Newsroom ingests for ranking — websites, communities,
          newsletters, podcasts, and social accounts.
        </p>
      </header>

      {loading ? (
        <p className="feed-placeholder">Loading sources…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <>
          <div className="topics-section">
            <h2 className="section-heading">Suggested sources</h2>
            <p className="section-lede">
              A small curated starter set — not every topic. Add anything else
              with the form below.
            </p>
            <div
              className="topics-filter-toggle source-catalog-tabs"
              role="tablist"
              aria-label="Suggested category"
            >
              {FEED_CATALOG_CATEGORIES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={
                    suggestedTab === id
                      ? "topics-filter-btn active"
                      : "topics-filter-btn"
                  }
                  aria-selected={suggestedTab === id}
                  onClick={() => setSuggestedTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="source-catalog-filters">
              <label className="filter-field">
                <span className="filter-label">Search</span>
                <input
                  type="search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Name or topic"
                  autoComplete="off"
                />
              </label>
              {topicTags.length > 0 ? (
                <label className="filter-field">
                  <span className="filter-label">Topic</span>
                  <select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                  >
                    <option value="">All tags</option>
                    {topicTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {catalogNote ? <p className="helper">{catalogNote}</p> : null}
            {visibleCatalog.length === 0 ? (
              <p className="empty-copy">
                No suggestions here. Clear filters or add a source below.
              </p>
            ) : (
              <ul className="manage-list">
                {visibleCatalog.map((feed) => {
                  return (
                    <li key={feed.id} className="manage-row">
                      <div className="manage-main">
                        <p className="manage-title">{feed.label}</p>
                        <p className="manage-meta">
                          {catalogShelfLabel(feed.category)} · {feed.blurb}
                        </p>
                        {feed.topicTags.length > 0 ? (
                          <p className="catalog-feed-tags">
                            {feed.topicTags.join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="manage-actions">
                        <button
                          type="button"
                          disabled={addingId === feed.id}
                          onClick={() => void addCatalogFeed(feed)}
                        >
                          {addingId === feed.id ? "Adding…" : "Add"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="manage-form panel-soft">
            <h2 className="form-heading">Add a source</h2>
            <div
              className="topics-filter-toggle source-kind-toggle"
              role="group"
              aria-label="Source category"
            >
              {(
                [
                  ["website", "Website"],
                  ["community", "Community"],
                  ["newsletter", "Newsletter"],
                  ["podcast", "Podcast"],
                  ["social_media", "Social"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  className={
                    addKind === kind
                      ? "topics-filter-btn active"
                      : "topics-filter-btn"
                  }
                  aria-pressed={addKind === kind}
                  onClick={() => selectAddKind(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
            {addKind === "community" ? (
              <div
                className="topics-filter-toggle source-community-mode"
                role="group"
                aria-label="Community type"
              >
                {(
                  [
                    ["reddit", "Subreddit"],
                    ["rss", "RSS"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={
                      communityMode === mode
                        ? "topics-filter-btn active"
                        : "topics-filter-btn"
                    }
                    aria-pressed={communityMode === mode}
                    onClick={() => setCommunityMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <form className="form" onSubmit={(e) => void onAddSubmit(e)}>
              {addField}
              {formError ? <p className="error">{formError}</p> : null}
              <div className="form-actions">
                <button type="submit" disabled={pending}>
                  {pending
                    ? "Adding…"
                    : addKind === "podcast"
                      ? "Add podcast"
                      : addKind === "social_media"
                        ? "Add social"
                        : addKind === "newsletter"
                          ? "Add newsletter"
                          : addKind === "community"
                            ? communityMode === "reddit"
                              ? "Add subreddit"
                              : "Add community RSS"
                            : "Add website"}
                </button>
                {addKind === "community" && !hasHn ? (
                  <button
                    type="button"
                    className="ghost"
                    disabled={pending}
                    onClick={() => void addHackerNews()}
                  >
                    Add Hacker News
                  </button>
                ) : null}
              </div>
              {addKind === "community" ? (
                hasHn ? (
                  <p className="helper">Hacker News is already connected.</p>
                ) : (
                  <p className="helper">
                    Communities include Reddit, HN, Substack, and similar
                    platforms. HN is one click — no URL needed.
                  </p>
                )
              ) : addKind === "newsletter" ? (
                <p className="helper">
                  Digests and email-style publications (TLDR, Bytes, …).
                </p>
              ) : addKind === "website" ? (
                <p className="helper">
                  Magazines, newspapers, and independent blogs.
                </p>
              ) : null}
            </form>
          </div>

          <div className="topics-section sources-me-section">
            <button
              type="button"
              className="topic-filter-collapse sources-me-toggle"
              aria-expanded={meOpen}
              aria-controls="sources-me-body"
              onClick={() => setMeOpen((open) => !open)}
            >
              <span className="topic-filter-collapse-chevron" aria-hidden>
                {meOpen ? "▾" : "▸"}
              </span>
              <span className="section-heading sources-me-heading">
                Me ({sources.length})
              </span>
            </button>
            {meOpen ? (
              <div id="sources-me-body">
                {sources.length === 0 ? (
                  <p className="empty-copy">
                    Nothing connected yet. Add a source above, or pick a
                    suggestion.
                  </p>
                ) : (
                  <ul className="manage-list">
                    {sources.map((source) => (
                      <li key={source.id} className="manage-row">
                        <div className="manage-main">
                          <p className="manage-title">
                            {sourceTitle(source)}
                          </p>
                          <p className="manage-meta">
                            {configSummary(source)}
                            {source.enabled ? "" : " · Disabled"}
                          </p>
                        </div>
                        <div className="manage-actions">
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void toggleEnabled(source)}
                          >
                            {source.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            className="danger-text"
                            onClick={() => void onDelete(source)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function mapSourceError(
  err: unknown,
  setFormError: (msg: string) => void,
  invalidConfigMessage = "Check the RSS URL.",
): void {
  if (err instanceof ApiError) {
    if (err.code === "duplicate" || err.status === 409) {
      setFormError("That source is already added.");
      return;
    }
    if (err.code === "unsupported_source_type") {
      setFormError("That source isn't available yet.");
      return;
    }
    if (err.code === "invalid_config" || err.status === 400) {
      setFormError(invalidConfigMessage);
      return;
    }
  }
  setFormError("Couldn't add source — try again.");
}
