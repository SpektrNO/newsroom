import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getTopicTree,
  resolveSelectableTopicLabel,
  TOPIC_TREE_NODES,
  TOPIC_TREE_VERSION,
  topicPathLabels,
} from "./topic-tree.js";

describe("topic tree catalog", () => {
  it("exposes version 1 with required seed leaf", () => {
    const tree = getTopicTree();
    assert.equal(tree.version, TOPIC_TREE_VERSION);
    assert.equal(tree.version, 1);
    const infra = tree.nodes.find((n) => n.id === "tech.ai.infra");
    assert.ok(infra);
    assert.equal(infra.label, "AI & infra");
    assert.equal(infra.selectable, true);
    assert.equal(infra.parentId, "tech.ai");
  });

  it("marks parents non-selectable and leaves selectable", () => {
    for (const node of TOPIC_TREE_NODES) {
      const hasChild = TOPIC_TREE_NODES.some((n) => n.parentId === node.id);
      if (hasChild) {
        assert.equal(
          node.selectable,
          false,
          `parent ${node.id} should not be selectable`,
        );
      }
    }
    assert.ok(TOPIC_TREE_NODES.some((n) => n.selectable));
  });

  it("resolves selectable labels case-insensitively", () => {
    assert.equal(resolveSelectableTopicLabel("ai & INFRA"), "AI & infra");
    assert.equal(resolveSelectableTopicLabel("Technology"), null);
    assert.equal(resolveSelectableTopicLabel("not-a-topic"), null);
  });

  it("builds breadcrumb paths", () => {
    assert.deepEqual(topicPathLabels("AI & infra"), [
      "Technology",
      "AI & Machine Learning",
      "AI & infra",
    ]);
    assert.equal(topicPathLabels("Legacy Name"), null);
  });
});
