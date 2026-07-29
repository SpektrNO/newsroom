export type TopicTreeNode = {
  id: string;
  parentId: string | null;
  label: string;
  selectable: boolean;
};

export type TopicTreeResponse = {
  version: number;
  nodes: TopicTreeNode[];
};

/** Curated hierarchical topic catalog (v2 — richer leaves under existing roots). */
export const TOPIC_TREE_VERSION = 2;

export const TOPIC_TREE_NODES: readonly TopicTreeNode[] = [
  { id: "tech", parentId: null, label: "Technology", selectable: false },
  {
    id: "tech.ai",
    parentId: "tech",
    label: "AI & Machine Learning",
    selectable: false,
  },
  {
    id: "tech.ai.infra",
    parentId: "tech.ai",
    label: "AI & infra",
    selectable: true,
  },
  {
    id: "tech.ai.llms",
    parentId: "tech.ai",
    label: "LLMs & agents",
    selectable: true,
  },
  {
    id: "tech.ai.mlops",
    parentId: "tech.ai",
    label: "MLOps & data",
    selectable: true,
  },
  {
    id: "tech.ai.evals",
    parentId: "tech.ai",
    label: "Evals & safety",
    selectable: true,
  },
  {
    id: "tech.eng",
    parentId: "tech",
    label: "Software Engineering",
    selectable: false,
  },
  {
    id: "tech.eng.languages",
    parentId: "tech.eng",
    label: "Languages & runtimes",
    selectable: true,
  },
  {
    id: "tech.eng.databases",
    parentId: "tech.eng",
    label: "Databases & storage",
    selectable: true,
  },
  {
    id: "tech.eng.devtools",
    parentId: "tech.eng",
    label: "Developer tools",
    selectable: true,
  },
  {
    id: "tech.eng.cloud",
    parentId: "tech.eng",
    label: "Cloud & devops",
    selectable: true,
  },
  {
    id: "tech.eng.oss",
    parentId: "tech.eng",
    label: "Open source",
    selectable: true,
  },
  {
    id: "tech.hardware",
    parentId: "tech",
    label: "Hardware & chips",
    selectable: true,
  },
  {
    id: "tech.security",
    parentId: "tech",
    label: "Security & privacy",
    selectable: true,
  },
  {
    id: "business",
    parentId: null,
    label: "Business & Startups",
    selectable: false,
  },
  {
    id: "business.funding",
    parentId: "business",
    label: "Funding & markets",
    selectable: true,
  },
  {
    id: "business.product",
    parentId: "business",
    label: "Product & growth",
    selectable: true,
  },
  {
    id: "business.work",
    parentId: "business",
    label: "Work & leadership",
    selectable: true,
  },
  {
    id: "business.regulation",
    parentId: "business",
    label: "Regulation & antitrust",
    selectable: true,
  },
  { id: "science", parentId: null, label: "Science", selectable: false },
  {
    id: "science.bio",
    parentId: "science",
    label: "Biology & health",
    selectable: true,
  },
  {
    id: "science.climate",
    parentId: "science",
    label: "Climate & energy",
    selectable: true,
  },
  {
    id: "science.physics",
    parentId: "science",
    label: "Physics & mathematics",
    selectable: true,
  },
  {
    id: "science.space",
    parentId: "science",
    label: "Space & matter",
    selectable: true,
  },
  {
    id: "science.neuro",
    parentId: "science",
    label: "Neuroscience & mind",
    selectable: true,
  },
  {
    id: "culture",
    parentId: null,
    label: "Culture & Society",
    selectable: false,
  },
  {
    id: "culture.design",
    parentId: "culture",
    label: "Design & media",
    selectable: true,
  },
  {
    id: "culture.policy",
    parentId: "culture",
    label: "Policy & rules",
    selectable: true,
  },
  {
    id: "culture.literature",
    parentId: "culture",
    label: "Literature & poesy",
    selectable: true,
  },
  {
    id: "culture.philosophy",
    parentId: "culture",
    label: "Philosophy & ideas",
    selectable: true,
  },
  {
    id: "culture.history",
    parentId: "culture",
    label: "History & archives",
    selectable: true,
  },
] as const;

export function getTopicTree(): TopicTreeResponse {
  return {
    version: TOPIC_TREE_VERSION,
    nodes: TOPIC_TREE_NODES.map((n) => ({ ...n })),
  };
}

/** Canonical catalog label if `name` matches a selectable node (case-insensitive). */
export function resolveSelectableTopicLabel(name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const node = TOPIC_TREE_NODES.find(
    (n) => n.selectable && n.label.toLowerCase() === needle,
  );
  return node?.label ?? null;
}

export function findNodeByLabel(name: string): TopicTreeNode | undefined {
  const needle = name.trim().toLowerCase();
  return TOPIC_TREE_NODES.find((n) => n.label.toLowerCase() === needle);
}

/** Breadcrumb labels from root to the node matching `name` (case-insensitive). */
export function topicPathLabels(name: string): string[] | null {
  const node = findNodeByLabel(name);
  if (!node) return null;
  const byId = new Map(TOPIC_TREE_NODES.map((n) => [n.id, n]));
  const path: string[] = [];
  let current: TopicTreeNode | undefined = node;
  while (current) {
    path.unshift(current.label);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
