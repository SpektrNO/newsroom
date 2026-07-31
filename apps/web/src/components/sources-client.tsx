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
import { defaultRssCategory, isCommunityRssHost } from "@newsroom/sources/community-host";
import { getBrowserApiClient } from "@/lib/api";
import { isCatalogEntryAlreadyAdded } from "@/lib/feed-catalog-match";
import {
  FEED_CATALOG_CATEGORIES,
  catalogEntryKind,
  listCatalogTopicTags,
  type FeedCatalogCategory,
} from "@/lib/feed-catalog";

type AddKind = "website" | "podcast" | "social_media" | "reddit";

function configSummary(source: Source): string {
  if (source.adapter === "hackernews") {
    const mode = source.config.mode === "new" ? "new" : "top";
    return `mode: ${mode}`;
  }
  if (source.adapter === "rss") {
    return typeof source.config.rssUrl === "string"
      ? source.config.rssUrl
      : "RSS feed";
  }
  if (source.adapter === "bluesky") {
    const handle =
      typeof source.config.handle === "string" ? source.config.handle : "";
    const did =
      typeof source.config.did === "string" ? source.config.did : "";
    if (handle && did) return `${handle} · ${did}`;
    if (handle) return handle;
    if (did) return did;
    return "Bluesky account";
  }
  if (source.adapter === "reddit") {
    const sub =
      typeof source.config.subreddit === "string"
        ? source.config.subreddit.trim()
        : "";
    return sub ? `r/${sub}` : "Subreddit";
  }
  return "";
}

function categoryLabel(category: string): string {
  if (category === "podcast") return "Podcast";
  if (category === "website") return "Website";
  if (category === "social_media") return "Social";
  if (category === "community") return "Community";
  return category;
}

function catalogKindLabel(kind: ReturnType<typeof catalogEntryKind>): string {
  if (kind === "reddit") return "Reddit";
  if (kind === "podcast") return "Podcast";
  if (kind === "bluesky") return "Bluesky";
  return "Feed";
}

/** Persist category for a catalog RSS shelf row. */
function catalogRssCategory(
  shelf: FeedCatalogCategory,
  rssUrl: string,
): SourceCategoryV1 {
  if (shelf === "podcasts") return "podcast";
  if (shelf === "websites") return "website";
  if (shelf === "communities") return "community";
  if (shelf === "newsletters") {
    return isCommunityRssHost(rssUrl) ? "community" : "website";
  }
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
      await api.createSource({
        category: "community",
        adapter: "hackernews",
        config: { mode: "top" },
      });
      await refresh();
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
      if (addKind === "social_media") {
        await api.createSource({
          category: "social_media",
          adapter: "bluesky",
          config: { handle: blueskyHandle.trim() },
        });
        setBlueskyHandle("");
      } else if (addKind === "reddit") {
        await api.createSource({
          category: "community",
          adapter: "reddit",
          config: { subreddit: redditSubreddit.trim() },
        });
        setRedditSubreddit("");
      } else if (addKind === "podcast") {
        await api.createSource({
          category: "podcast",
          adapter: "rss",
          config: { rssUrl: rssUrl.trim() },
        });
        setRssUrl("");
      } else {
        const url = rssUrl.trim();
        await api.createSource({
          category: defaultRssCategory(url),
          adapter: "rss",
          config: { rssUrl: url },
        });
        setRssUrl("");
      }
      await refresh();
    } catch (err) {
      mapSourceError(
        err,
        setFormError,
        addKind === "social_media"
          ? "Check the Bluesky handle."
          : addKind === "reddit"
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
      if (kind === "reddit") {
        const subreddit = feed.subreddit?.trim();
        if (!subreddit) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        await api.createSource({
          category: "community",
          adapter: "reddit",
          config: { subreddit },
          enabled: true,
        });
      } else if (kind === "bluesky") {
        const handle = feed.handle?.trim();
        if (!handle) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        await api.createSource({
          category: "social_media",
          adapter: "bluesky",
          config: { handle },
          enabled: true,
        });
      } else if (kind === "podcast") {
        const url = feed.rssUrl?.trim();
        if (!url) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        await api.createSource({
          category: "podcast",
          adapter: "rss",
          config: { rssUrl: url },
          enabled: true,
        });
      } else {
        const url = feed.rssUrl?.trim();
        if (!url) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        await api.createSource({
          category: catalogRssCategory(feed.category, url),
          adapter: "rss",
          config: { rssUrl: url },
          enabled: true,
        });
      }
      setCatalogNote(`Added ${feed.label}.`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && (err.code === "duplicate" || err.status === 409)) {
        setCatalogNote("That source is already added.");
        await refresh();
      } else {
        mapSourceError(
          err,
          setCatalogNote,
          kind === "reddit"
            ? "Check the subreddit name."
            : kind === "bluesky"
              ? "Check the Bluesky handle."
              : "Check the RSS URL.",
        );
      }
    } finally {
      setAddingId(null);
    }
  }

  async function toggleEnabled(source: Source) {
    try {
      await api.patchSource(source.id, { enabled: !source.enabled });
      await refresh();
    } catch {
      setError("Couldn't update source — try again.");
    }
  }

  async function onDelete(source: Source) {
    if (!window.confirm("Remove this source?")) return;
    try {
      await api.deleteSource(source.id);
      await refresh();
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
    ) : addKind === "reddit" ? (
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
              : "https://www.platformer.news/feed"
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
          What Newsroom ingests for ranking — websites, podcasts, communities,
          and social accounts.
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
                  const kind = catalogEntryKind(feed);
                  return (
                    <li key={feed.id} className="manage-row">
                      <div className="manage-main">
                        <p className="manage-title">{feed.label}</p>
                        <p className="manage-meta">
                          {catalogKindLabel(kind)} · {feed.blurb}
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
                  ["podcast", "Podcast"],
                  ["social_media", "Social"],
                  ["reddit", "Reddit"],
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
                        ? "Add Bluesky"
                        : addKind === "reddit"
                          ? "Add Reddit"
                          : "Add website"}
                </button>
                {!hasHn ? (
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
              {hasHn ? (
                <p className="helper">Hacker News is already connected.</p>
              ) : (
                <p className="helper">
                  HN is a shared firehose — one click, no URL needed.
                </p>
              )}
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
                            {categoryLabel(source.category)}
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
