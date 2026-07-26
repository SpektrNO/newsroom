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
import { isFeedAlreadyAdded } from "@/lib/feed-catalog-match";
import { listCatalogTopicTags } from "@/lib/feed-catalog";

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
  return "";
}

function sourceTypeLabel(sourceType: string): string {
  if (sourceType === "hackernews") return "Hacker News";
  if (sourceType === "podcast") return "Podcast";
  if (sourceType === "substack") return "Feed";
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
  const [rssUrl, setRssUrl] = useState("");
  const [podcastRssUrl, setPodcastRssUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [podcastPending, setPodcastPending] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");

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
    if (!tagFilter) return catalog;
    return catalog.filter((f) =>
      f.topicTags.some((t) => t.toLowerCase() === tagFilter.toLowerCase()),
    );
  }, [catalog, tagFilter]);

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

  async function addSubstack(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      await api.createSource({
        sourceType: "substack",
        config: { rssUrl: rssUrl.trim() },
      });
      setRssUrl("");
      await refresh();
    } catch (err) {
      mapSourceError(err, setFormError);
    } finally {
      setPending(false);
    }
  }

  async function addPodcast(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPodcastPending(true);
    try {
      await api.createSource({
        sourceType: "podcast",
        config: { rssUrl: podcastRssUrl.trim() },
      });
      setPodcastRssUrl("");
      await refresh();
    } catch (err) {
      mapSourceError(err, setFormError);
    } finally {
      setPodcastPending(false);
    }
  }

  async function addCatalogFeed(feed: FeedCatalogEntry) {
    if (!window.confirm(`Add “${feed.label}” to your sources?`)) return;
    setCatalogNote(null);
    setAddingId(feed.id);
    try {
      await api.createSource({
        sourceType: "substack",
        config: { rssUrl: feed.rssUrl },
        enabled: true,
      });
      setCatalogNote(`Added ${feed.label}.`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && (err.code === "duplicate" || err.status === 409)) {
        setCatalogNote("That source is already added.");
        await refresh();
      } else {
        mapSourceError(err, setCatalogNote);
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

  return (
    <section className="manage-page">
      <header className="page-header">
        <h1 className="page-title">Sources</h1>
        <p className="page-lede">
          Connect Hacker News, newsletters, and podcasts that fill your ranked
          list. Browse the catalog if you don’t already know a newsletter URL.
        </p>
      </header>

      <div className="manage-form panel-soft">
        <h2 className="form-heading">Add feed</h2>
        <form className="form" onSubmit={(e) => void addSubstack(e)}>
          <label>
            RSS URL
            <input
              type="url"
              value={rssUrl}
              onChange={(e) => setRssUrl(e.target.value)}
              placeholder="https://www.platformer.news/feed"
              required
            />
          </label>
          {formError ? <p className="error">{formError}</p> : null}
          <div className="form-actions">
            <button type="submit" disabled={pending || podcastPending}>
              {pending ? "Adding…" : "Add feed"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={pending || podcastPending || hasHn}
              onClick={() => void addHackerNews()}
            >
              Add Hacker News
            </button>
          </div>
          {hasHn ? (
            <p className="helper">Hacker News is already connected.</p>
          ) : null}
        </form>
      </div>

      <div className="manage-form panel-soft">
        <h2 className="form-heading">Add podcast</h2>
        <form className="form" onSubmit={(e) => void addPodcast(e)}>
          <label>
            Podcast RSS URL
            <input
              type="url"
              value={podcastRssUrl}
              onChange={(e) => setPodcastRssUrl(e.target.value)}
              placeholder="https://feeds.example.com/show.xml"
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={pending || podcastPending}>
              {podcastPending ? "Adding…" : "Add podcast"}
            </button>
          </div>
          {formError ? <p className="error">{formError}</p> : null}
        </form>
      </div>

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
                No sources yet. Add Hacker News, paste a newsletter or podcast
                RSS URL, or pick from the catalog below.
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
                        className="ghost danger-text"
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

          <div className="topics-section">
            <h2 className="section-heading">Catalog</h2>
            <p className="section-lede">
              Browse suggested feeds. Add one to start ingesting it into your
              ranked list.
            </p>
            {topicTags.length > 0 ? (
              <label className="filter-field catalog-tag-filter">
                <span className="filter-label">Topic tag</span>
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
            {catalogNote ? <p className="helper">{catalogNote}</p> : null}
            {visibleCatalog.length === 0 ? (
              <p className="empty-copy">No catalog feeds yet.</p>
            ) : (
              <ul className="manage-list">
                {visibleCatalog.map((feed) => {
                  const added = isFeedAlreadyAdded(sources, feed.rssUrl);
                  return (
                    <li key={feed.id} className="manage-row">
                      <div className="manage-main">
                        <p className="manage-title">{feed.label}</p>
                        <p className="manage-meta">{feed.blurb}</p>
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
                            {addingId === feed.id ? "Adding…" : "Add feed"}
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
      setFormError("Check the RSS URL.");
      return;
    }
  }
  setFormError("Couldn't add source — try again.");
}
