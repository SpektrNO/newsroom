import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSubredditName } from "./reddit-subreddit.js";

describe("normalizeSubredditName", () => {
  it("normalizes common inputs", () => {
    assert.equal(normalizeSubredditName("MachineLearning"), "machinelearning");
    assert.equal(normalizeSubredditName("r/rust"), "rust");
  });
});
