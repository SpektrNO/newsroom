import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSubredditName } from "./reddit-subreddit.js";
import {
  RedditAdapter,
  mapListingChild,
} from "./reddit.js";

const SAMPLE_LISTING = {
  data: {
    children: [
      {
        kind: "t3",
        data: {
          id: "abc123",
          name: "t3_abc123",
          title: "Interesting link post",
          selftext: "",
          url: "https://example.com/article",
          domain: "example.com",
          permalink: "/r/programming/comments/abc123/interesting_link_post/",
          author: "alice",
          created_utc: 1_700_000_000,
        },
      },
      {
        kind: "t3",
        data: {
          id: "self1",
          name: "t3_self1",
          title: "Self post",
          selftext: "Body of the self post for ranking.",
          url: "https://www.reddit.com/r/programming/comments/self1/self_post/",
          permalink: "/r/programming/comments/self1/self_post/",
          author: "bob",
          created_utc: 1_700_000_100,
        },
      },
      {
        kind: "t3",
        data: {
          id: "gone",
          name: "t3_gone",
          title: "Removed",
          selftext: "",
          permalink: "/r/programming/comments/gone/removed/",
          author: "carol",
          removed_by_category: "moderator",
          created_utc: 1_700_000_200,
        },
      },
      {
        kind: "t3",
        data: {
          id: "empty",
          name: "t3_empty",
          title: "   ",
          permalink: "/r/programming/comments/empty/x/",
          author: "dave",
          created_utc: 1_700_000_300,
        },
      },
      {
        kind: "t3",
        data: {
          id: "deleted_author",
          name: "t3_deleted_author",
          title: "[deleted]",
          permalink: "/r/programming/comments/deleted_author/x/",
          author: "[deleted]",
          created_utc: 1_700_000_400,
        },
      },
    ],
  },
};

describe("normalizeSubredditName", () => {
  it("strips r/ and lowercases", () => {
    assert.equal(normalizeSubredditName("r/Programming"), "programming");
    assert.equal(normalizeSubredditName("/r/LocalFirst/"), "localfirst");
  });

  it("rejects invalid names", () => {
    assert.throws(() => normalizeSubredditName(""));
    assert.throws(() => normalizeSubredditName("a"));
    assert.throws(() => normalizeSubredditName("has spaces"));
    assert.throws(() => normalizeSubredditName("all"));
  });
});

describe("mapListingChild", () => {
  it("maps link and self posts; skips removed/empty/deleted", () => {
    const link = mapListingChild(SAMPLE_LISTING.data.children[0]!, "programming");
    assert.ok(link);
    assert.equal(link.title, "Interesting link post");
    assert.equal(link.author, "u/alice");
    assert.equal(link.externalId, "t3_abc123");
    assert.ok(link.url.includes("reddit.com"));
    assert.ok(link.summary?.includes("example.com"));

    const self = mapListingChild(SAMPLE_LISTING.data.children[1]!, "programming");
    assert.ok(self);
    assert.equal(self.summary, "Body of the self post for ranking.");

    assert.equal(
      mapListingChild(SAMPLE_LISTING.data.children[2]!, "programming"),
      null,
    );
    assert.equal(
      mapListingChild(SAMPLE_LISTING.data.children[3]!, "programming"),
      null,
    );
    assert.equal(
      mapListingChild(SAMPLE_LISTING.data.children[4]!, "programming"),
      null,
    );
  });
});

describe("RedditAdapter", () => {
  it("fetches public listing with User-Agent", async () => {
    const calls: Array<{ url: string; headers: Headers | undefined }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        url: String(input),
        headers: init?.headers ? new Headers(init.headers) : undefined,
      });
      return new Response(JSON.stringify(SAMPLE_LISTING), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const adapter = new RedditAdapter(
      { subreddit: "r/Programming" },
      {
        fetch: fetchMock,
        userAgent: "newsroom-test/1.0",
        listingBaseUrl: "https://www.reddit.com",
      },
    );
    const articles = await adapter.fetchRecent();
    assert.equal(articles.length, 2);
    assert.ok(calls[0]!.url.includes("/r/programming/new.json"));
    assert.equal(calls[0]!.headers?.get("user-agent"), "newsroom-test/1.0");
  });

  it("uses OAuth when client credentials are set", async () => {
    const urls: string[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("access_token")) {
        return new Response(
          JSON.stringify({ access_token: "tok", token_type: "bearer" }),
          { status: 200 },
        );
      }
      const auth = new Headers(init?.headers).get("authorization");
      assert.equal(auth, "Bearer tok");
      return new Response(JSON.stringify(SAMPLE_LISTING), { status: 200 });
    };

    const adapter = new RedditAdapter(
      { subreddit: "programming" },
      {
        fetch: fetchMock,
        clientId: "cid",
        clientSecret: "sec",
        tokenUrl: "https://www.reddit.com/api/v1/access_token",
        listingBaseUrl: "https://oauth.reddit.com",
      },
    );
    const articles = await adapter.fetchRecent();
    assert.equal(articles.length, 2);
    assert.ok(urls[0]!.includes("access_token"));
    assert.ok(urls[1]!.includes("/r/programming/new"));
    assert.ok(!urls[1]!.includes(".json"));
  });

  it("falls back to RSS when public JSON returns 403", async () => {
    const urls: string[] = [];
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>funny</title>
  <entry>
    <author><name>/u/alice</name></author>
    <id>t3_abc99</id>
    <link href="https://www.reddit.com/r/funny/comments/abc99/a_joke_about_memes/"/>
    <updated>2024-06-01T12:00:00Z</updated>
    <title>A joke about memes</title>
    <content type="html">funny post body</content>
  </entry>
</feed>`;
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes(".json")) {
        return new Response("blocked", { status: 403 });
      }
      return new Response(rssXml, {
        status: 200,
        headers: { "content-type": "application/atom+xml" },
      });
    };

    const adapter = new RedditAdapter(
      { subreddit: "funny" },
      {
        fetch: fetchMock,
        userAgent: "newsroom-test/1.0",
        listingBaseUrl: "https://www.reddit.com",
      },
    );
    const articles = await adapter.fetchRecent();
    assert.equal(articles.length, 1);
    assert.equal(articles[0]!.title, "A joke about memes");
    assert.ok(urls.some((u) => u.includes(".json")));
    assert.ok(urls.some((u) => u.includes("/r/funny/.rss")));
  });
});
