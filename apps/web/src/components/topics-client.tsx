"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  type Topic,
  type TopicTreeNode,
} from "@newsroom/api-client";
import { getBrowserApiClient } from "@/lib/api";
import {
  findNodeByLabel,
  getTopicTree,
  topicPathLabels,
} from "@/lib/topic-tree";

function readApiError(
  err: unknown,
): { status: number; code: string } | null {
  if (err instanceof ApiError) {
    return { status: err.status, code: err.code };
  }
  // Bundled copies of api-client can break `instanceof`.
  if (!err || typeof err !== "object") return null;
  const rec = err as { status?: unknown; code?: unknown; name?: unknown };
  if (typeof rec.status !== "number") return null;
  if (typeof rec.code === "string") {
    return { status: rec.status, code: rec.code };
  }
  if (rec.name === "ApiError") {
    return { status: rec.status, code: "error" };
  }
  return null;
}

/** Map key for roots — treats null/undefined parentId the same. */
function parentKey(parentId: string | null | undefined): string {
  return parentId ?? "";
}

const WEIGHT_HELP = (
  <>
    <p>
      <strong>What weight does:</strong> When a keyword from this topic matches
      an article’s title or summary, that hit adds weight × 0.25 toward the
      keyword score (capped at 1). Keyword score is part of hybrid ranking:
      final rank blends keyword score (35%) with the AI score (65%). See hybrid
      ranking.
    </p>
    <p>
      <strong>Higher weight</strong> (e.g. 2–10): matching keywords push this
      topic’s stories harder toward the shortlist ceiling — use for interests
      you care about most.
    </p>
    <p>
      <strong>Lower weight</strong> (e.g. 0.1–0.5): matches still count, but
      contribute less to keyword score — use for weaker or exploratory
      interests.
    </p>
  </>
);

function pathFromNodes(
  nodes: TopicTreeNode[],
  label: string,
): string[] | null {
  return topicPathLabels(label) ?? buildPathFromFetched(nodes, label);
}

function buildPathFromFetched(
  nodes: TopicTreeNode[],
  label: string,
): string[] | null {
  const needle = label.trim().toLowerCase();
  const node = nodes.find((n) => n.label.toLowerCase() === needle);
  if (!node) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: string[] = [];
  let current: TopicTreeNode | undefined = node;
  while (current) {
    path.unshift(current.label);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

function formatPath(path: string[] | null): string | null {
  if (!path?.length) return null;
  return path.join(" · ");
}

type TreeItemProps = {
  node: TopicTreeNode;
  childrenByParent: Map<string, TopicTreeNode[]>;
  expanded: Set<string>;
  selectedId: string | null;
  search: string;
  onToggle: (id: string) => void;
  onSelect: (node: TopicTreeNode) => void;
};

function TreeItem({
  node,
  childrenByParent,
  expanded,
  selectedId,
  search,
  onToggle,
  onSelect,
}: TreeItemProps): ReactNode {
  const kids = childrenByParent.get(parentKey(node.id)) ?? [];
  const hasKids = kids.length > 0;
  const isOpen = expanded.has(node.id);
  const q = search.trim().toLowerCase();

  function matchesSelf(n: TopicTreeNode): boolean {
    if (!q) return true;
    return n.label.toLowerCase().includes(q);
  }

  function matchesBranch(n: TopicTreeNode): boolean {
    if (matchesSelf(n)) return true;
    return (childrenByParent.get(parentKey(n.id)) ?? []).some(matchesBranch);
  }

  if (q && !matchesBranch(node)) return null;

  return (
    <li className="topic-tree-item">
      <div className="topic-tree-row">
        {hasKids ? (
          <button
            type="button"
            className="topic-tree-toggle"
            aria-expanded={isOpen}
            onClick={() => onToggle(node.id)}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="topic-tree-toggle spacer" aria-hidden />
        )}
        {node.selectable ? (
          <button
            type="button"
            className={
              selectedId === node.id
                ? "topic-tree-leaf selected"
                : "topic-tree-leaf"
            }
            onClick={() => onSelect(node)}
          >
            {node.label}
          </button>
        ) : (
          <button
            type="button"
            className="topic-tree-branch"
            onClick={() => hasKids && onToggle(node.id)}
          >
            {node.label}
          </button>
        )}
      </div>
      {hasKids && isOpen ? (
        <ul className="topic-tree-children">
          {kids.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              expanded={expanded}
              selectedId={selectedId}
              search={search}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

type TopicTreePickerProps = {
  nodes: TopicTreeNode[];
  selectedLabel: string;
  onSelectLabel: (label: string) => void;
  legacyName: string | null;
};

function TopicTreePicker({
  nodes,
  selectedLabel,
  onSelectLabel,
  legacyName,
}: TopicTreePickerProps): ReactNode {
  const childrenByParent = useMemo(() => {
    const map = new Map<string, TopicTreeNode[]>();
    for (const n of nodes) {
      const key = parentKey(n.parentId);
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    }
    return map;
  }, [nodes]);

  const selectedNode = useMemo(() => {
    if (!selectedLabel) return null;
    const needle = selectedLabel.toLowerCase();
    return (
      nodes.find((n) => n.selectable && n.label.toLowerCase() === needle) ??
      null
    );
  }, [nodes, selectedLabel]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const roots = childrenByParent.get("") ?? [];

  /** Expand every non-leaf so categories are browsable without hunting. */
  function expandBranches(base?: Set<string>) {
    const next = new Set(base ?? []);
    for (const n of nodes) {
      if (!n.selectable && (childrenByParent.get(parentKey(n.id))?.length ?? 0) > 0) {
        next.add(n.id);
      }
    }
    return next;
  }

  useEffect(() => {
    if (!selectedNode) return;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const next = new Set<string>();
    let current: TopicTreeNode | undefined = selectedNode;
    while (current?.parentId) {
      next.add(current.parentId);
      current = byId.get(current.parentId);
    }
    setExpanded((prev) => {
      const merged = new Set(prev);
      for (const id of next) merged.add(id);
      return merged;
    });
  }, [selectedNode, nodes]);

  useEffect(() => {
    if (!search.trim()) return;
    const q = search.trim().toLowerCase();
    const next = new Set<string>();
    for (const n of nodes) {
      if (!n.label.toLowerCase().includes(q)) continue;
      let current: TopicTreeNode | undefined = n;
      const byId = new Map(nodes.map((x) => [x.id, x]));
      while (current?.parentId) {
        next.add(current.parentId);
        current = byId.get(current.parentId);
      }
    }
    setExpanded((prev) => {
      const merged = new Set(prev);
      for (const id of next) merged.add(id);
      return merged;
    });
  }, [search, nodes]);

  const pathCrumb = formatPath(
    selectedLabel ? pathFromNodes(nodes, selectedLabel) : null,
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openPanel() {
    setOpen(true);
    setExpanded((prev) => expandBranches(prev));
  }

  return (
    <div className="topic-picker">
      <span className="field-label">Topic</span>
      {legacyName ? (
        <p className="legacy-note">
          Current name isn’t in the catalog: “{legacyName}”. Pick a topic from
          the tree.
        </p>
      ) : null}
      <button
        type="button"
        className="topic-picker-trigger"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        {selectedNode ? selectedNode.label : "Choose a topic…"}
      </button>
      {pathCrumb && selectedNode ? (
        <p className="topic-path">{pathCrumb}</p>
      ) : null}
      {open ? (
        <div className="topic-tree-panel">
          <input
            type="search"
            className="topic-tree-search"
            placeholder="Search topics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search topics"
          />
          {roots.length === 0 ? (
            <p className="legacy-note">No topics in the catalog.</p>
          ) : (
            <ul className="topic-tree-root">
              {roots.map((node) => (
                <TreeItem
                  key={node.id}
                  node={node}
                  childrenByParent={childrenByParent}
                  expanded={expanded}
                  selectedId={selectedNode?.id ?? null}
                  search={search}
                  onToggle={toggle}
                  onSelect={(n) => {
                    onSelectLabel(n.label);
                    setOpen(false);
                    setSearch("");
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

type KeywordChipsProps = {
  keywords: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

function KeywordChips({
  keywords,
  onChange,
  disabled,
}: KeywordChipsProps): ReactNode {
  const [draft, setDraft] = useState("");

  function commitToken(raw: string) {
    const parts = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...keywords];
    for (const p of parts) {
      if (p.length > 64) continue;
      if (next.length >= 50) break;
      if (
        next.some((k) => k.toLowerCase() === p.toLowerCase())
      ) {
        continue;
      }
      next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      commitToken(draft);
      return;
    }
    if (e.key === "Backspace" && draft === "" && keywords.length > 0) {
      e.preventDefault();
      onChange(keywords.slice(0, -1));
    }
  }

  function removeAt(index: number) {
    onChange(keywords.filter((_, i) => i !== index));
  }

  return (
    <div className="keyword-chips">
      <span className="field-label">Keywords</span>
      <div className="keyword-chips-box">
        {keywords.map((kw, i) => (
          <button
            key={`${kw}-${i}`}
            type="button"
            className="keyword-chip"
            disabled={disabled}
            onClick={() => removeAt(i)}
            aria-label={`Remove ${kw}`}
          >
            {kw}
            <span aria-hidden>×</span>
          </button>
        ))}
        <input
          value={draft}
          disabled={disabled}
          placeholder={keywords.length ? "" : "Add keywords…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) commitToken(draft);
          }}
          aria-label="Add keywords"
        />
      </div>
    </div>
  );
}

export function TopicsClient(): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [treeNodes, setTreeNodes] = useState<TopicTreeNode[]>(
    () => getTopicTree().nodes,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [selectedLabel, setSelectedLabel] = useState("");
  const [legacyName, setLegacyName] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [weight, setWeight] = useState("1");
  const [enabled, setEnabled] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [topicsRes, treeRes] = await Promise.all([
        api.listTopics(),
        api.listTopicTree().catch(() => getTopicTree()),
      ]);
      setTopics(topicsRes.topics);
      const nodes =
        treeRes.nodes?.length > 0 ? treeRes.nodes : getTopicTree().nodes;
      setTreeNodes(nodes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/sign-in?callbackUrl=%2Ftopics");
        return;
      }
      // Still offer the static catalog so the picker is never blank.
      setTreeNodes(getTopicTree().nodes);
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
    setSelectedLabel("");
    setLegacyName(null);
    setKeywords([]);
    setWeight("1");
    setEnabled(true);
    setFormError(null);
  }

  function startEdit(topic: Topic) {
    setEditingId(topic.id);
    const catalogNode = findNodeByLabel(topic.name);
    if (catalogNode?.selectable) {
      setSelectedLabel(catalogNode.label);
      setLegacyName(null);
    } else {
      setSelectedLabel("");
      setLegacyName(topic.name);
    }
    setKeywords([...topic.keywords]);
    setWeight(String(topic.weight));
    setEnabled(topic.enabled);
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!selectedLabel.trim()) {
      setFormError("Check the topic and keywords.");
      return;
    }
    if (keywords.length === 0) {
      setFormError("Check the topic and keywords.");
      return;
    }

    setPending(true);
    const w = Number(weight);
    try {
      if (editingId) {
        await api.patchTopic(editingId, {
          name: selectedLabel.trim(),
          keywords,
          weight: Number.isFinite(w) ? w : 1,
          enabled,
        });
      } else {
        await api.createTopic({
          name: selectedLabel.trim(),
          keywords,
          weight: Number.isFinite(w) ? w : 1,
          enabled,
        });
      }
      resetForm();
      await refresh();
    } catch (err) {
      const apiErr = readApiError(err);
      if (apiErr?.status === 401) {
        router.push("/sign-in?callbackUrl=%2Ftopics");
        return;
      }
      if (apiErr?.code === "duplicate" || apiErr?.status === 409) {
        setFormError("You already have a topic with that name.");
      } else if (apiErr?.code === "invalid_topic" || apiErr?.status === 400) {
        setFormError("Check the topic and keywords.");
      } else {
        console.error("[newsroom] topic save failed", err);
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
          Pick a topic from the tree, add keywords, and set how strongly matches
          should rank.
        </p>
      </header>

      {loading ? (
        <p className="feed-placeholder">Loading topics…</p>
      ) : (
        <form className="manage-form panel-soft" onSubmit={onSubmit}>
          <h2 className="form-heading">
            {editingId ? "Edit topic" : "Add topic"}
          </h2>

          <TopicTreePicker
            nodes={treeNodes}
            selectedLabel={selectedLabel}
            onSelectLabel={(label) => {
              setSelectedLabel(label);
              setLegacyName(null);
            }}
            legacyName={legacyName}
          />

          <KeywordChips keywords={keywords} onChange={setKeywords} />

          <div className="weight-field">
            <label className="weight-label" htmlFor="topic-weight">
              Weight
            </label>
            <input
              id="topic-weight"
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <div className="weight-help">{WEIGHT_HELP}</div>
          </div>

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
      )}

      {loading ? null : error ? (
        <p className="error">{error}</p>
      ) : topics.length === 0 ? (
        <p className="empty-copy">
          No topics yet. Pick one from the tree so ranking knows what you care
          about.
        </p>
      ) : (
        <ul className="manage-list">
          {topics.map((topic) => {
            const crumb = formatPath(pathFromNodes(treeNodes, topic.name));
            return (
              <li key={topic.id} className="manage-row">
                <div className="manage-main">
                  <p className="manage-title">{topic.name}</p>
                  {crumb ? <p className="topic-path list-path">{crumb}</p> : null}
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
