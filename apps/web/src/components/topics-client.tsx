"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import {
  extraKeywordsBeyondStarters,
  findTopicByLabel,
  followDefaultsForLabel,
  isFollowingLabel,
  mergeTopicKeywords,
  starterKeywordsFromLabel,
} from "@/lib/topics-catalog";

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

type CatalogItemProps = {
  node: TopicTreeNode;
  childrenByParent: Map<string, TopicTreeNode[]>;
  expanded: Set<string>;
  search: string;
  topics: Topic[];
  followingOnly: boolean;
  followingLabel: string | null;
  managingId: string | null;
  onToggle: (id: string) => void;
  onFollow: (label: string) => void;
  onManage: (topic: Topic) => void;
};

function CatalogItem({
  node,
  childrenByParent,
  expanded,
  search,
  topics,
  followingOnly,
  followingLabel,
  managingId,
  onToggle,
  onFollow,
  onManage,
}: CatalogItemProps): ReactNode {
  const kids = childrenByParent.get(parentKey(node.id)) ?? [];
  const hasKids = kids.length > 0;
  const isOpen = expanded.has(node.id);
  const q = search.trim().toLowerCase();

  function leafVisible(n: TopicTreeNode): boolean {
    if (!n.selectable) return false;
    if (q && !n.label.toLowerCase().includes(q)) return false;
    if (followingOnly && !isFollowingLabel(topics, n.label)) return false;
    return true;
  }

  function branchVisible(n: TopicTreeNode): boolean {
    if (n.selectable) return leafVisible(n);
    return (childrenByParent.get(parentKey(n.id)) ?? []).some(branchVisible);
  }

  if (!branchVisible(node)) return null;

  const followed = node.selectable && isFollowingLabel(topics, node.label);
  const matchedTopic = followed
    ? findTopicByLabel(topics, node.label)
    : undefined;
  const pending = followingLabel?.toLowerCase() === node.label.toLowerCase();
  const managing =
    matchedTopic != null && managingId === matchedTopic.id;

  return (
    <li className="topic-tree-item">
      <div
        className={
          managing
            ? "topic-tree-row catalog-row catalog-row-managing"
            : "topic-tree-row catalog-row"
        }
      >
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
          <>
            <span className="catalog-leaf-label">{node.label}</span>
            <span className="catalog-leaf-actions">
              {followed && matchedTopic ? (
                <>
                  <span className="catalog-following-status">Following</span>
                  <button
                    type="button"
                    className="ghost catalog-manage"
                    onClick={() => onManage(matchedTopic)}
                  >
                    Manage
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="catalog-follow"
                  disabled={pending}
                  onClick={() => onFollow(node.label)}
                >
                  {pending ? "Following…" : "Follow"}
                </button>
              )}
            </span>
          </>
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
            <CatalogItem
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              expanded={expanded}
              search={search}
              topics={topics}
              followingOnly={followingOnly}
              followingLabel={followingLabel}
              managingId={managingId}
              onToggle={onToggle}
              onFollow={onFollow}
              onManage={onManage}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

type TopicCatalogTreeProps = {
  nodes: TopicTreeNode[];
  topics: Topic[];
  followingOnly: boolean;
  followingLabel: string | null;
  managingId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onFollow: (label: string) => void;
  onManage: (topic: Topic) => void;
  catalogEmptyMessage?: string;
  managePanel?: ReactNode;
};

function TopicCatalogTree({
  nodes,
  topics,
  followingOnly,
  followingLabel,
  managingId,
  search,
  onSearchChange,
  onFollow,
  onManage,
  catalogEmptyMessage,
  managePanel,
}: TopicCatalogTreeProps): ReactNode {
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

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const next = new Set<string>();
    for (const n of nodes) {
      if (
        !n.selectable &&
        (childrenByParent.get(parentKey(n.id))?.length ?? 0) > 0
      ) {
        next.add(n.id);
      }
    }
    return next;
  });

  const roots = childrenByParent.get("") ?? [];

  useEffect(() => {
    if (!search.trim() && !followingOnly) return;
    const q = search.trim().toLowerCase();
    const next = new Set<string>();
    const byId = new Map(nodes.map((x) => [x.id, x]));

    for (const n of nodes) {
      if (!n.selectable) continue;
      if (q && !n.label.toLowerCase().includes(q)) continue;
      if (followingOnly && !isFollowingLabel(topics, n.label)) continue;
      let current: TopicTreeNode | undefined = n;
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
  }, [search, nodes, followingOnly, topics]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (roots.length === 0) {
    return (
      <p className="empty-copy">
        {catalogEmptyMessage ?? "Couldn't load catalog."}
      </p>
    );
  }

  return (
    <div className="topic-browse">
      <input
        type="search"
        className="topic-tree-search"
        placeholder="Search topics…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Search topics"
      />
      {managePanel}
      <div className="topic-catalog">
        <ul className="topic-tree-root">
          {roots.map((node) => (
            <CatalogItem
              key={node.id}
              node={node}
              childrenByParent={childrenByParent}
              expanded={expanded}
              search={search}
              topics={topics}
              followingOnly={followingOnly}
              followingLabel={followingLabel}
              managingId={managingId}
              onToggle={toggle}
              onFollow={onFollow}
              onManage={onManage}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

type KeywordChipsProps = {
  lockedKeywords: string[];
  extraKeywords: string[];
  onChangeExtras: (next: string[]) => void;
  disabled?: boolean;
};

function KeywordChips({
  lockedKeywords,
  extraKeywords,
  onChangeExtras,
  disabled,
}: KeywordChipsProps): ReactNode {
  const [draft, setDraft] = useState("");

  const lockedKeys = useMemo(
    () => new Set(lockedKeywords.map((k) => k.toLowerCase())),
    [lockedKeywords],
  );

  function commitToken(raw: string) {
    const parts = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...extraKeywords];
    const totalCap = 50 - lockedKeywords.length;
    for (const p of parts) {
      if (p.length > 64) continue;
      if (next.length >= totalCap) break;
      const key = p.toLowerCase();
      if (lockedKeys.has(key)) continue;
      if (next.some((k) => k.toLowerCase() === key)) continue;
      next.push(p);
    }
    onChangeExtras(next);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      commitToken(draft);
      return;
    }
    if (e.key === "Backspace" && draft === "" && extraKeywords.length > 0) {
      e.preventDefault();
      onChangeExtras(extraKeywords.slice(0, -1));
    }
  }

  function removeExtraAt(index: number) {
    onChangeExtras(extraKeywords.filter((_, i) => i !== index));
  }

  const hasAny = lockedKeywords.length > 0 || extraKeywords.length > 0;

  return (
    <div className="keyword-chips">
      <span className="field-label">Keywords</span>
      <div className="keyword-chips-box">
        {lockedKeywords.map((kw) => (
          <span
            key={`locked-${kw}`}
            className="keyword-chip keyword-chip-locked"
            title="From topic name"
          >
            {kw}
          </span>
        ))}
        {extraKeywords.map((kw, i) => (
          <button
            key={`extra-${kw}-${i}`}
            type="button"
            className="keyword-chip"
            disabled={disabled}
            onClick={() => removeExtraAt(i)}
            aria-label={`Remove ${kw}`}
          >
            {kw}
            <span aria-hidden>×</span>
          </button>
        ))}
        <input
          value={draft}
          disabled={disabled || !lockedKeywords.length}
          placeholder={
            !lockedKeywords.length
              ? "Topic name required"
              : hasAny
                ? "Add more…"
                : "Add keywords…"
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) commitToken(draft);
          }}
          aria-label="Add keywords"
        />
      </div>
      {lockedKeywords.length > 0 ? (
        <p className="keyword-chips-hint">
          Words from the topic path stay fixed (parents match more weakly when
          ranking). Add more if you want.
        </p>
      ) : null}
    </div>
  );
}

export function TopicsClient(): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();
  const managePanelRef = useRef<HTMLFormElement | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [treeNodes, setTreeNodes] = useState<TopicTreeNode[]>(
    () => getTopicTree().nodes,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followNote, setFollowNote] = useState<string | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [followingLabel, setFollowingLabel] = useState<string | null>(null);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [search, setSearch] = useState("");

  const [selectedLabel, setSelectedLabel] = useState("");
  const [legacyName, setLegacyName] = useState<string | null>(null);
  const [extraKeywords, setExtraKeywords] = useState<string[]>([]);
  const [weight, setWeight] = useState("1");
  const [enabled, setEnabled] = useState(true);

  const topicLabelForKeywords =
    selectedLabel.trim() || legacyName?.trim() || "";
  const lockedKeywords = useMemo(
    () => starterKeywordsFromLabel(topicLabelForKeywords),
    [topicLabelForKeywords],
  );

  const pathCrumb = formatPath(
    topicLabelForKeywords
      ? pathFromNodes(treeNodes, topicLabelForKeywords)
      : null,
  );

  const refresh = useCallback(
    async (opts?: { quiet?: boolean }): Promise<Topic[] | null> => {
      if (!opts?.quiet) setLoading(true);
      setError(null);
      try {
        const [topicsRes, treeResult] = await Promise.all([
          api.listTopics(),
          api.listTopicTree().then(
            (res) => ({ ok: true as const, res }),
            () => ({ ok: false as const }),
          ),
        ]);
        setTopics(topicsRes.topics);
        if (treeResult.ok && treeResult.res.nodes?.length > 0) {
          setTreeNodes(treeResult.res.nodes);
          setCatalogFailed(false);
        } else {
          const fallback = getTopicTree();
          setTreeNodes(fallback.nodes);
          setCatalogFailed(!fallback.nodes.length);
        }
        return topicsRes.topics;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/sign-in?callbackUrl=%2Ftopics");
          return null;
        }
        const fallback = getTopicTree();
        setTreeNodes(fallback.nodes);
        setCatalogFailed(!fallback.nodes.length);
        setError("Couldn't load topics.");
        return null;
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [api, router],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setSelectedLabel("");
    setLegacyName(null);
    setExtraKeywords([]);
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
      setExtraKeywords(
        extraKeywordsBeyondStarters(topic.keywords, catalogNode.label),
      );
    } else {
      setSelectedLabel("");
      setLegacyName(topic.name);
      setExtraKeywords(
        extraKeywordsBeyondStarters(topic.keywords, topic.name),
      );
    }
    setWeight(String(topic.weight));
    setEnabled(topic.enabled);
    setFormError(null);
  }

  function manageTopic(topic: Topic) {
    startEdit(topic);
    requestAnimationFrame(() => {
      managePanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      managePanelRef.current
        ?.querySelector<HTMLInputElement>("input:not([type=checkbox])")
        ?.focus();
    });
  }

  async function onFollow(label: string) {
    setFollowError(null);
    setFollowNote(null);
    setFollowingLabel(label);
    try {
      const created = await api.createTopic(followDefaultsForLabel(label));
      await refresh({ quiet: true });
      manageTopic(created.topic);
    } catch (err) {
      const apiErr = readApiError(err);
      if (apiErr?.status === 401) {
        router.push("/sign-in?callbackUrl=%2Ftopics");
        return;
      }
      if (apiErr?.code === "duplicate" || apiErr?.status === 409) {
        setFollowNote("You’re already following that topic.");
        const list = await refresh({ quiet: true });
        const existing = list
          ? findTopicByLabel(list, label)
          : findTopicByLabel(topics, label);
        if (existing) manageTopic(existing);
      } else {
        console.error("[newsroom] catalog follow failed", err);
        setFollowError("Couldn't follow topic — try again.");
      }
    } finally {
      setFollowingLabel(null);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!editingId) return;

    const name = selectedLabel.trim() || legacyName?.trim() || "";
    if (!name) {
      setFormError("Check the topic and keywords.");
      return;
    }

    setPending(true);
    const w = Number(weight);
    const resolvedKeywords = mergeTopicKeywords(name, extraKeywords);
    try {
      await api.patchTopic(editingId, {
        name: selectedLabel.trim() || name,
        keywords: resolvedKeywords,
        weight: Number.isFinite(w) ? w : 1,
        enabled,
      });
      resetForm();
      await refresh({ quiet: true });
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

  async function onDeleteEditing() {
    if (!editingId) return;
    const topic = topics.find((t) => t.id === editingId);
    const name =
      topic?.name ?? (selectedLabel || legacyName || "this topic");
    if (!window.confirm(`Delete topic "${name}"?`)) return;
    try {
      await api.deleteTopic(editingId);
      resetForm();
      await refresh({ quiet: true });
    } catch {
      setFormError("Couldn't delete topic — try again.");
    }
  }

  const managePanel =
    editingId && !loading ? (
      <form
        ref={managePanelRef}
        id="topic-manage-panel"
        className="manage-form panel-soft topic-manage-panel"
        onSubmit={onSubmit}
      >
        <h2 className="form-heading">Manage topic</h2>
        <div className="topic-manage-identity">
          <p className="manage-title">
            {selectedLabel || legacyName || "Topic"}
          </p>
          {pathCrumb ? <p className="topic-path">{pathCrumb}</p> : null}
          {legacyName ? (
            <p className="legacy-note">
              This name isn’t in the catalog: “{legacyName}”. Keywords and
              weight still apply; delete and follow a catalog topic to replace
              it.
            </p>
          ) : null}
        </div>

        <KeywordChips
          lockedKeywords={lockedKeywords}
          extraKeywords={extraKeywords}
          onChangeExtras={setExtraKeywords}
        />

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
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="ghost" onClick={resetForm}>
            Cancel
          </button>
          <button
            type="button"
            className="ghost danger-text"
            onClick={() => void onDeleteEditing()}
          >
            Delete
          </button>
        </div>
      </form>
    ) : null;

  return (
    <section className="manage-page">
      <header className="page-header">
        <h1 className="page-title">Topics</h1>
        <p className="page-lede">
          Browse topics. Follow what you care about, then manage keywords and
          weight so ranking knows what matters.
        </p>
      </header>

      {loading ? (
        <p className="feed-placeholder">Loading topics…</p>
      ) : (
        <>
          <div className="topics-toolbar">
            <p className="topics-following-count">
              Following {topics.length}
            </p>
            <div
              className="topics-filter-toggle"
              role="group"
              aria-label="Topic filter"
            >
              <button
                type="button"
                className={
                  !followingOnly
                    ? "topics-filter-btn active"
                    : "topics-filter-btn"
                }
                aria-pressed={!followingOnly}
                onClick={() => setFollowingOnly(false)}
              >
                All
              </button>
              <button
                type="button"
                className={
                  followingOnly
                    ? "topics-filter-btn active"
                    : "topics-filter-btn"
                }
                aria-pressed={followingOnly}
                onClick={() => setFollowingOnly(true)}
              >
                Following only
              </button>
            </div>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {followError ? <p className="error">{followError}</p> : null}
          {followNote ? <p className="helper">{followNote}</p> : null}
          {!error && topics.length === 0 ? (
            <p className="empty-copy">
              You’re not following any topics yet. Follow one below, then tune
              keywords and weight.
            </p>
          ) : null}

          {catalogFailed ? (
            <p className="error">Couldn't load catalog.</p>
          ) : (
            <TopicCatalogTree
              nodes={treeNodes}
              topics={topics}
              followingOnly={followingOnly}
              followingLabel={followingLabel}
              managingId={editingId}
              search={search}
              onSearchChange={setSearch}
              onFollow={(label) => void onFollow(label)}
              onManage={manageTopic}
              managePanel={managePanel}
            />
          )}
        </>
      )}
    </section>
  );
}
