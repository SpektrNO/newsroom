"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ApiError, type Source } from "@newsroom/api-client";
import { getBrowserApiClient } from "@/lib/api";

function configSummary(source: Source): string {
  if (source.sourceType === "hackernews") {
    const mode = source.config.mode === "new" ? "new" : "top";
    return `mode: ${mode}`;
  }
  if (source.sourceType === "substack") {
    return typeof source.config.rssUrl === "string"
      ? source.config.rssUrl
      : "Substack RSS";
  }
  return "";
}

export function SourcesClient(): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rssUrl, setRssUrl] = useState("");
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listSources();
      setSources(res.sources);
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
          Connect Hacker News and Substack feeds that fill your ranked list.
        </p>
      </header>

      <div className="manage-form panel-soft">
        <h2 className="form-heading">Add Substack</h2>
        <form className="form" onSubmit={(e) => void addSubstack(e)}>
          <label>
            RSS URL
            <input
              type="url"
              value={rssUrl}
              onChange={(e) => setRssUrl(e.target.value)}
              placeholder="https://example.substack.com/feed"
              required
            />
          </label>
          {formError ? <p className="error">{formError}</p> : null}
          <div className="form-actions">
            <button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add Substack"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={pending || hasHn}
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

      {loading ? (
        <p className="feed-placeholder">Loading sources…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : sources.length === 0 ? (
        <p className="empty-copy">
          No sources yet. Connect Hacker News or a Substack RSS feed.
        </p>
      ) : (
        <ul className="manage-list">
          {sources.map((source) => (
            <li key={source.id} className="manage-row">
              <div className="manage-main">
                <p className="manage-title">
                  {source.sourceType === "hackernews"
                    ? "Hacker News"
                    : "Substack"}
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
