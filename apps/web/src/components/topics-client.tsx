"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ApiError, type Topic } from "@newsroom/api-client";
import { getBrowserApiClient } from "@/lib/api";

function splitKeywords(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function TopicsClient(): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [weight, setWeight] = useState("1");
  const [enabled, setEnabled] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listTopics();
      setTopics(res.topics);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/sign-in?callbackUrl=%2Ftopics");
        return;
      }
      setError("Couldn't load topics.");
    } finally {
      setLoading(false);
    }
  }, [api, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setKeywords("");
    setWeight("1");
    setEnabled(true);
    setFormError(null);
  }

  function startEdit(topic: Topic) {
    setEditingId(topic.id);
    setName(topic.name);
    setKeywords(topic.keywords.join(", "));
    setWeight(String(topic.weight));
    setEnabled(topic.enabled);
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    const kw = splitKeywords(keywords);
    const w = Number(weight);
    try {
      if (editingId) {
        await api.patchTopic(editingId, {
          name: name.trim(),
          keywords: kw,
          weight: Number.isFinite(w) ? w : 1,
          enabled,
        });
      } else {
        await api.createTopic({
          name: name.trim(),
          keywords: kw,
          weight: Number.isFinite(w) ? w : 1,
          enabled,
        });
      }
      resetForm();
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "duplicate" || err.status === 409) {
          setFormError("You already have a topic with that name.");
        } else if (
          err.code === "invalid_topic" ||
          err.status === 400
        ) {
          setFormError("Check the name and keywords.");
        } else {
          setFormError("Couldn't save topic — try again.");
        }
      } else {
        setFormError("Couldn't save topic — try again.");
      }
    } finally {
      setPending(false);
    }
  }

  async function toggleEnabled(topic: Topic) {
    try {
      await api.patchTopic(topic.id, { enabled: !topic.enabled });
      await refresh();
    } catch {
      setError("Couldn't update topic — try again.");
    }
  }

  async function onDelete(topic: Topic) {
    if (!window.confirm(`Delete topic "${topic.name}"?`)) return;
    try {
      await api.deleteTopic(topic.id);
      if (editingId === topic.id) resetForm();
      await refresh();
    } catch {
      setError("Couldn't delete topic — try again.");
    }
  }

  return (
    <section className="manage-page">
      <header className="page-header">
        <h1 className="page-title">Topics</h1>
        <p className="page-lede">
          Tell ranking what you care about with names, keywords, and weight.
        </p>
      </header>

      <form className="manage-form panel-soft" onSubmit={onSubmit}>
        <h2 className="form-heading">
          {editingId ? "Edit topic" : "Add topic"}
        </h2>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label>
          Keywords
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="comma-separated"
            required
          />
        </label>
        <label>
          Weight
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled
        </label>
        {formError ? <p className="error">{formError}</p> : null}
        <div className="form-actions">
          <button type="submit" disabled={pending}>
            {pending ? "Saving…" : editingId ? "Save changes" : "Add topic"}
          </button>
          {editingId ? (
            <button type="button" className="ghost" onClick={resetForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {loading ? (
        <p className="feed-placeholder">Loading topics…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : topics.length === 0 ? (
        <p className="empty-copy">
          No topics yet. Create one so ranking knows what you care about.
        </p>
      ) : (
        <ul className="manage-list">
          {topics.map((topic) => (
            <li key={topic.id} className="manage-row">
              <div className="manage-main">
                <p className="manage-title">{topic.name}</p>
                <p className="manage-meta">
                  Weight {topic.weight}
                  {topic.enabled ? "" : " · Disabled"}
                </p>
                <p className="keyword-line">
                  {topic.keywords.length
                    ? topic.keywords.join(", ")
                    : "No keywords"}
                </p>
              </div>
              <div className="manage-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void toggleEnabled(topic)}
                >
                  {topic.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => startEdit(topic)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="ghost danger-text"
                  onClick={() => void onDelete(topic)}
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
