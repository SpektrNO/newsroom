import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BlueskyAdapter,
  mapFeedItem,
  parseAtPostUri,
  titleFromPostText,
} from "./bluesky.js";

const DID = "did:plc:author123";
const HANDLE = "jay.bsky.social";

const SAMPLE_AUTHOR_FEED = {
  feed: [
    {
      post: {
        uri: `at://${DID}/app.bsky.feed.post/original1`,
        author: {
          did: DID,
          handle: HANDLE,
          displayName: "Jay",
        },
        record: {
          $type: "app.bsky.feed.post",
          text: "Hello Bluesky\nSecond line of the post",
          createdAt: "2024-06-01T12:00:00.000Z",
        },
      },
    },
    {
      post: {
        uri: `at://${DID}/app.bsky.feed.post/quote1`,
        author: {
          did: DID,
          handle: HANDLE,
          displayName: "Jay",
        },
        record: {
          $type: "app.bsky.feed.post",
          text: "Quoting something interesting",
          createdAt: "2024-06-02T12:00:00.000Z",
        },
        embed: {
          $type: "app.bsky.embed.record#view",
          record: { uri: "at://did:plc:other/app.bsky.feed.post/x" },
        },
      },
    },
    {
      post: {
        uri: `at://${DID}/app.bsky.feed.post/reposttarget`,
        author: {
          did: "did:plc:other",
          handle: "other.bsky.social",
        },
        record: {
          text: "Someone else's post",
          createdAt: "2024-05-01T00:00:00.000Z",
        },
      },
      reason: {
        $type: "app.bsky.feed.defs#reasonRepost",
        by: { did: DID, handle: HANDLE },
      },
    },
    {
      post: {
        uri: `at://${DID}/app.bsky.feed.post/empty`,
        author: { did: DID, handle: HANDLE },
        record: { text: "   ", createdAt: "2024-06-03T00:00:00.000Z" },
      },
    },
  ],
};

describe("titleFromPostText / parseAtPostUri", () => {
  it("uses first line and truncates long titles", () => {
    assert.equal(titleFromPostText("Line one\nLine two"), "Line one");
    const long = "a".repeat(200);
    const titled = titleFromPostText(long);
    assert.equal(titled.length, 120);
    assert.ok(titled.endsWith("…"));
  });

  it("parses post AT URIs", () => {
    assert.deepEqual(
      parseAtPostUri(`at://${DID}/app.bsky.feed.post/abc123`),
      { did: DID, rkey: "abc123" },
    );
    assert.equal(parseAtPostUri("at://did:plc:x/app.bsky.feed.like/y"), null);
  });
});

describe("mapFeedItem", () => {
  it("skips pure reposts and empty text", () => {
    assert.equal(
      mapFeedItem(SAMPLE_AUTHOR_FEED.feed[2]!, HANDLE),
      null,
    );
    assert.equal(
      mapFeedItem(SAMPLE_AUTHOR_FEED.feed[3]!, HANDLE),
      null,
    );
  });
});

describe("BlueskyAdapter", () => {
  it("maps original + quote posts; skips repost and empty", async () => {
    let requested: string | undefined;
    const fetchMock: typeof fetch = async (input) => {
      requested = String(input);
      return new Response(JSON.stringify(SAMPLE_AUTHOR_FEED), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const adapter = new BlueskyAdapter(
      { handle: "@Jay.Bsky.Social" },
      { fetch: fetchMock, appViewUrl: "https://public.api.bsky.app" },
    );
    const articles = await adapter.fetchRecent();

    assert.ok(requested?.includes("app.bsky.feed.getAuthorFeed"));
    assert.ok(requested?.includes("filter=posts_no_replies"));
    assert.ok(requested?.includes(`actor=${encodeURIComponent(HANDLE)}`));

    assert.equal(articles.length, 2);

    const original = articles[0];
    assert.equal(original?.title, "Hello Bluesky");
    assert.equal(
      original?.summary,
      "Hello Bluesky\nSecond line of the post",
    );
    assert.equal(
      original?.url,
      `https://bsky.app/profile/${HANDLE}/post/original1`,
    );
    assert.equal(original?.externalId, `at://${DID}/app.bsky.feed.post/original1`);
    assert.equal(original?.author, "Jay");
    assert.equal(
      original?.publishedAt?.toISOString(),
      "2024-06-01T12:00:00.000Z",
    );

    const quote = articles[1];
    assert.equal(quote?.title, "Quoting something interesting");
    assert.equal(
      quote?.url,
      `https://bsky.app/profile/${HANDLE}/post/quote1`,
    );
  });

  it("prefers did as actor when present", async () => {
    let requested: string | undefined;
    const fetchMock: typeof fetch = async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ feed: [] }), { status: 200 });
    };

    const adapter = new BlueskyAdapter(
      { handle: HANDLE, did: DID },
      { fetch: fetchMock },
    );
    await adapter.fetchRecent();
    assert.ok(requested?.includes(`actor=${encodeURIComponent(DID)}`));
  });

  it("rejects empty handle", () => {
    assert.throws(
      () => new BlueskyAdapter({ handle: "  " }),
      /invalid_config/,
    );
  });
});
