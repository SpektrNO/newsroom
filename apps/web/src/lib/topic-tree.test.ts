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
  it("exposes version 4 with required seed leaf", () => {
    const tree = getTopicTree();
    assert.equal(tree.version, TOPIC_TREE_VERSION);
    assert.equal(tree.version, 4);
    const infra = tree.nodes.find((n) => n.id === "tech.ai.infra");
    assert.ok(infra);
    assert.equal(infra.label, "AI & infra");
    assert.equal(infra.selectable, true);
    assert.equal(infra.parentId, "tech.ai");
  });

  it("includes science and culture leaves from catalog expansion", () => {
    assert.equal(
      resolveSelectableTopicLabel("Physics & mathematics"),
      "Physics & mathematics",
    );
    assert.equal(
      resolveSelectableTopicLabel("Space & matter"),
      "Space & matter",
    );
    assert.equal(
      resolveSelectableTopicLabel("Literature & poesy"),
      "Literature & poesy",
    );
    assert.equal(
      resolveSelectableTopicLabel("Philosophy & ideas"),
      "Philosophy & ideas",
    );
    assert.equal(resolveSelectableTopicLabel("Art & craft"), "Art & craft");
    assert.equal(
      resolveSelectableTopicLabel("Music & theatre"),
      "Music & theatre",
    );
    assert.equal(
      resolveSelectableTopicLabel("Comedy & entertainment"),
      "Comedy & entertainment",
    );
    assert.deepEqual(topicPathLabels("Literature & poesy"), [
      "Culture & Society",
      "Literature & poesy",
    ]);
    assert.deepEqual(topicPathLabels("Comedy & entertainment"), [
      "Culture & Society",
      "Comedy & entertainment",
    ]);
    assert.deepEqual(topicPathLabels("Art & craft"), [
      "Culture & Society",
      "Art & craft",
    ]);
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
