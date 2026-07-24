/**
 * Integration: mocked AiProvider → user_article_scores rows.
 * Requires Postgres (defaults to local Compose DATABASE_URL).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import type { AiProvider } from "@newsroom/ai";
import {
  articleSources,
  articles,
  createDb,
  sourceSubscriptions,
  topics,
  user,
  userArticleScores,
  type Database,
} from "@newsroom/db";
import { runRank } from "./rank.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://newsroom:newsroom@localhost:5432/newsroom";

describe("runRank", () => {
  let db: Database;
  const userId = `rank-user-${randomUUID()}`;
  const otherUserId = `rank-other-${randomUUID()}`;
  const subId = `rank-sub-${randomUUID()}`;
  const topicId = `rank-topic-${randomUUID()}`;
  const articleId = `rank-art-${randomUUID()}`;
  const otherArticleId = `rank-art-other-${randomUUID()}`;
  const canonicalUrl = `https://fixture.example/p/rank-${articleId}`;
  const otherCanonical = `https://fixture.example/p/rank-${otherArticleId}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();

    await db.insert(user).values([
      {
        id: userId,
        name: "Rank Test",
        email: `${userId}@test.local`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherUserId,
        name: "Rank Other",
        email: `${otherUserId}@test.local`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.insert(sourceSubscriptions).values({
      id: subId,
      userId,
      sourceType: "hackernews",
      config: { mode: "top" },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(topics).values({
      id: topicId,
      userId,
      name: "AI infra",
      keywords: ["llm", "postgres"],
      weight: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(articles).values([
      {
        id: articleId,
        canonicalUrl,
        title: "Local LLM with Postgres",
        summary: "How to run inference",
        author: "tester",
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherArticleId,
        canonicalUrl: otherCanonical,
        title: "Cooking pasta",
        summary: "No match here",
        author: "chef",
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.insert(articleSources).values([
      {
        id: randomUUID(),
        articleId,
        sourceSubscriptionId: subId,
        sourceType: "hackernews",
        externalId: "1",
        fetchedAt: now,
      },
      {
        id: randomUUID(),
        articleId: otherArticleId,
        sourceSubscriptionId: subId,
        sourceType: "hackernews",
        externalId: "2",
        fetchedAt: now,
      },
    ]);
  });

  after(async () => {
    await db
      .delete(userArticleScores)
      .where(eq(userArticleScores.userId, userId));
    await db.delete(articleSources).where(eq(articleSources.articleId, articleId));
    await db
      .delete(articleSources)
      .where(eq(articleSources.articleId, otherArticleId));
    await db.delete(articles).where(eq(articles.id, articleId));
    await db.delete(articles).where(eq(articles.id, otherArticleId));
    await db.delete(topics).where(eq(topics.id, topicId));
    await db
      .delete(sourceSubscriptions)
      .where(eq(sourceSubscriptions.id, subId));
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(user).where(eq(user.id, otherUserId));
  });

  it("writes ≥1 user_article_scores row for keyword hits with mocked AI", async () => {
    const provider: AiProvider = {
      async complete() {
        return {
          model: "fake",
          text: JSON.stringify([
            {
              articleId,
              aiScore: 0.88,
              reason: "Matches LLM + Postgres topic",
              nearDuplicateOfArticleId: null,
            },
          ]),
        };
      },
      async health() {
        return true;
      },
    };

    const result = await runRank(db, {
      userId,
      provider,
      batchSize: 20,
    });

    assert.ok(result.scored >= 1);
    assert.ok(result.aiBatches >= 1);

    const scores = await db
      .select()
      .from(userArticleScores)
      .where(
        and(
          eq(userArticleScores.userId, userId),
          eq(userArticleScores.articleId, articleId),
        ),
      );

    assert.equal(scores.length, 1);
    assert.ok((scores[0]?.keywordScore ?? 0) > 0);
    assert.equal(scores[0]?.aiScore, 0.88);
    assert.ok((scores[0]?.finalRank ?? 0) > 0);
    assert.match(scores[0]?.reason ?? "", /LLM|Postgres|llm|postgres/i);

    const miss = await db
      .select()
      .from(userArticleScores)
      .where(
        and(
          eq(userArticleScores.userId, userId),
          eq(userArticleScores.articleId, otherArticleId),
        ),
      );
    assert.equal(miss.length, 0);

    const leaked = await db
      .select()
      .from(userArticleScores)
      .where(eq(userArticleScores.userId, otherUserId));
    assert.equal(leaked.length, 0);
  });
});
