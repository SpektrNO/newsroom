/**
 * Integration: mocked adapter HTTP → upsert articles + article_sources.
 * Requires Postgres (defaults to local Compose DATABASE_URL).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  articleSources,
  articles,
  createDb,
  sourceSubscriptions,
  user,
  type Database,
} from "@newsroom/db";
import { runIngest } from "./ingest.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://newsroom:newsroom@localhost:5432/newsroom";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Fixture Feed</title>
    <item>
      <title>Ingest Fixture Story</title>
      <link>https://fixture.example/p/ingest-test</link>
      <guid>fixture-guid-1</guid>
      <description>Fixture summary</description>
    </item>
  </channel>
</rss>`;

describe("runIngest", () => {
  let db: Database;
  const userId = `test-user-${randomUUID()}`;
  const subId = `test-sub-${randomUUID()}`;
  const canonicalUrl = "https://fixture.example/p/ingest-test";

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: "Ingest Test",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(sourceSubscriptions).values({
      id: subId,
      userId,
      sourceType: "substack",
      config: { rssUrl: "https://fixture.example/feed" },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  after(async () => {
    await db
      .delete(sourceSubscriptions)
      .where(eq(sourceSubscriptions.id, subId));
    await db.delete(articles).where(eq(articles.canonicalUrl, canonicalUrl));
    await db.delete(user).where(eq(user.id, userId));
  });

  it("upserts at least one article and article_sources row", async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("hacker-news.firebaseio.com")) {
        if (url.includes("topstories") || url.includes("newstories")) {
          return new Response("[]", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("null", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(SAMPLE_RSS, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });
    };

    const result = await runIngest(db, { fetch: fetchMock });
    assert.ok(result.succeeded >= 1);
    assert.ok(result.articlesUpserted >= 1);

    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.canonicalUrl, canonicalUrl))
      .limit(1);

    assert.ok(article);
    assert.equal(article.title, "Ingest Fixture Story");

    const [link] = await db
      .select()
      .from(articleSources)
      .where(
        and(
          eq(articleSources.articleId, article.id),
          eq(articleSources.sourceSubscriptionId, subId),
        ),
      )
      .limit(1);

    assert.ok(link);
    assert.equal(link.sourceType, "substack");
    assert.equal(link.externalId, "fixture-guid-1");
  });
});
