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
} from "@newsroom/api-client";
import { getBrowserApiClient } from "@/lib/api";
import { isCatalogEntryAlreadyAdded } from "@/lib/feed-catalog-match";
import { catalogEntryKind, listCatalogTopicTags } from "@/lib/feed-catalog";

type AddKind = "feed" | "podcast" | "bluesky" | "reddit";

function configSummary(source: Source): string {
  if (source.sourceType === "hackernews") {
    const mode = source.config.mode === "new" ? "new" : "top";
    return `mode: ${mode}`;
  }
  if (source.sourceType === "substack" || source.sourceType === "podcast") {
    return typeof source.config.rssUrl === "string"
      ? source.config.rssUrl
      : "RSS feed";
  }
  if (source.sourceType === "bluesky") {
    const handle =
      typeof source.config.handle === "string" ? source.config.handle : "";
    const did =
      typeof source.config.did === "string" ? source.config.did : "";
    if (handle && did) return `${handle} · ${did}`;
    if (handle) return handle;
    if (did) return did;
    return "Bluesky account";
  }
  if (source.sourceType === "reddit") {
    const sub =
      typeof source.config.subreddit === "string"
        ? source.config.subreddit.trim()
        : "";
    return sub ? `r/${sub}` : "Subreddit";
  }
  return "";
}

function sourceTypeLabel(sourceType: string): string {
  if (sourceType === "hackernews") return "Hacker News";
  if (sourceType === "podcast") return "Podcast";
  if (sourceType === "substack") return "Feed";
  if (sourceType === "bluesky") return "Bluesky";
  if (sourceType === "reddit") return "Reddit";
  return sourceType;
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
  const [addKind, setAddKind] = useState<AddKind>("feed");
  const [rssUrl, setRssUrl] = useState("");
  const [blueskyHandle, setBlueskyHandle] = useState("");
  const [redditSubreddit, setRedditSubreddit] = useState("");
  const [pending, setPending] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");

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

  const hasHn = sources.some((s) => s.sourceType === "hackernews");
  const topicTags = useMemo(() => listCatalogTopicTags(catalog), [catalog]);
  const visibleCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalog.filter((f) => {
      if (
        tagFilter &&
        !f.topicTags.some((t) => t.toLowerCase() === tagFilter.toLowerCase())
      ) {
        return false;
      }
      if (!q) return true;
      const kind = catalogEntryKind(f);
      const hay =
        `${f.label} ${f.blurb} ${f.topicTags.join(" ")} ${kind} ${f.subreddit ?? ""} ${f.rssUrl ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, tagFilter, catalogSearch]);

  function selectAddKind(kind: AddKind) {
    setAddKind(kind);
    setFormError(null);
  }

  async function addHackerNews() {
    setFormError(null);
    setPending(true);
    try {
      await api.createSource({
        sourceType: "hackernews",
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
      if (addKind === "bluesky") {
        await api.createSource({
          sourceType: "bluesky",
          config: { handle: blueskyHandle.trim() },
        });
        setBlueskyHandle("");
      } else if (addKind === "reddit") {
        await api.createSource({
          sourceType: "reddit",
          config: { subreddit: redditSubreddit.trim() },
        });
        setRedditSubreddit("");
      } else if (addKind === "podcast") {
        await api.createSource({
          sourceType: "podcast",
          config: { rssUrl: rssUrl.trim() },
        });
        setRssUrl("");
      } else {
        await api.createSource({
          sourceType: "substack",
          config: { rssUrl: rssUrl.trim() },
        });
        setRssUrl("");
      }
      await refresh();
    } catch (err) {
      mapSourceError(
        err,
        setFormError,
        addKind === "bluesky"
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
    try {
      if (catalogEntryKind(feed) === "reddit") {
        const subreddit = feed.subreddit?.trim();
        if (!subreddit) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        await api.createSource({
          sourceType: "reddit",
          config: { subreddit },
          enabled: true,
        });
      } else {
        const rssUrl = feed.rssUrl?.trim();
        if (!rssUrl) {
          setCatalogNote("Couldn't add source — try again.");
          return;
        }
        await api.createSource({
          sourceType: "substack",
          config: { rssUrl },
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
          catalogEntryKind(feed) === "reddit"
            ? "Check the subreddit name."
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
    addKind === "bluesky" ? (
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
          What Newsroom ingests for ranking — feeds, podcasts, Bluesky, Reddit,
          and Hacker News.
        </p>
      </header>

      {loading ? (
        <p className="feed-placeholder">Loading sources…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <>
          <div className="topics-section">
            <h2 className="section-heading">Your sources</h2>
            {sources.length === 0 ? (
              <p className="empty-copy">
                Nothing connected yet. Add a source below, or pick a suggested
                feed.
              </p>
            ) : (
              <ul className="manage-list">
                {sources.map((source) => (
                  <li key={source.id} className="manage-row">
                    <div className="manage-main">
                      <p className="manage-title">
                        {sourceTypeLabel(source.sourceType)}
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

          <div className="manage-form panel-soft">
            <h2 className="form-heading">Add a source</h2>
            <div
              className="topics-filter-toggle source-kind-toggle"
              role="group"
              aria-label="Source type"
            >
              {(
                [
                  ["feed", "Feed"],
                  ["podcast", "Podcast"],
                  ["bluesky", "Bluesky"],
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
                      : addKind === "bluesky"
                        ? "Add Bluesky"
                        : addKind === "reddit"
                          ? "Add Reddit"
                          : "Add feed"}
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

          <div className="topics-section">
            <h2 className="section-heading">Suggested feeds</h2>
            <p className="section-lede">
              A small curated starter set of newsletters and subreddits — not
              every topic. Add anything else with the form above.
            </p>
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
                No suggestions match. Clear filters or add a source above.
              </p>
            ) : (
              <ul className="manage-list">
                {visibleCatalog.map((feed) => {
                  const added = isCatalogEntryAlreadyAdded(sources, feed);
                  const kind = catalogEntryKind(feed);
                  return (
                    <li key={feed.id} className="manage-row">
                      <div className="manage-main">
                        <p className="manage-title">{feed.label}</p>
                        <p className="manage-meta">
                          {kind === "reddit" ? "Reddit · " : "Feed · "}
                          {feed.blurb}
                        </p>
                        {feed.topicTags.length > 0 ? (
                          <p className="catalog-feed-tags">
                            {feed.topicTags.join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="manage-actions">
                        {added ? (
                          <span className="catalog-following-status">Added</span>
                        ) : (
                          <button
                            type="button"
                            disabled={addingId === feed.id}
                            onClick={() => void addCatalogFeed(feed)}
                          >
                            {addingId === feed.id ? "Adding…" : "Add"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
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
