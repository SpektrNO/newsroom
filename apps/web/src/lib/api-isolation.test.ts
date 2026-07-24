/**
 * Session-scoped topics/feed query isolation (same filters as API routes).
 * Requires Postgres.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import {
  articles,
  createDb,
  topics,
  user,
  userArticleScores,
  type Database,
} from "@newsroom/db";
import {
  deleteTopicForUser,
  getTopicForUser,
  listTopicsForUser,
} from "./topics-queries.js";
import {
  getScoreForUserArticle,
  updateScoreStatusForUser,
} from "./feed-queries.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://newsroom:newsroom@localhost:5432/newsroom";

describe("topics/feed session isolation", () => {
  let db: Database;
  const userA = `iso-a-${randomUUID()}`;
  const userB = `iso-b-${randomUUID()}`;
  const topicA = `iso-topic-a-${randomUUID()}`;
  const topicB = `iso-topic-b-${randomUUID()}`;
  const articleId = `iso-art-${randomUUID()}`;
  const scoreA = `iso-score-a-${randomUUID()}`;
  const canonicalUrl = `https://fixture.example/p/iso-${articleId}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values([
      {
        id: userA,
        name: "Iso A",
        email: `${userA}@test.local`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: userB,
        name: "Iso B",
        email: `${userB}@test.local`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(topics).values([
      {
        id: topicA,
        userId: userA,
        name: "Alpha",
        keywords: ["alpha"],
        weight: 1,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: topicB,
        userId: userB,
        name: "Beta",
        keywords: ["beta"],
        weight: 1,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(articles).values({
      id: articleId,
      canonicalUrl,
      title: "Isolation article",
      summary: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(userArticleScores).values({
      id: scoreA,
      userId: userA,
      articleId,
      keywordScore: 0.5,
      aiScore: 0.5,
      finalRank: 0.5,
      reason: "test",
      status: "new",
      scoredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  after(async () => {
    await db.delete(userArticleScores).where(eq(userArticleScores.userId, userA));
    await db.delete(articles).where(eq(articles.id, articleId));
    await db.delete(topics).where(eq(topics.id, topicA));
    await db.delete(topics).where(eq(topics.id, topicB));
    await db.delete(user).where(eq(user.id, userA));
    await db.delete(user).where(eq(user.id, userB));
  });

  it("lists only the session user's topics", async () => {
    const rows = await listTopicsForUser(db, userA);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, topicA);
  });

  it("cannot get or delete another user's topic", async () => {
    assert.equal(await getTopicForUser(db, userA, topicB), null);
    assert.equal(await deleteTopicForUser(db, userA, topicB), false);
    assert.ok(await getTopicForUser(db, userB, topicB));
  });

  it("cannot update feed status for another user's score", async () => {
    assert.equal(await getScoreForUserArticle(db, userB, articleId), null);
    assert.equal(
      await updateScoreStatusForUser(db, userB, articleId, "seen"),
      null,
    );
    const own = await updateScoreStatusForUser(db, userA, articleId, "saved");
    assert.equal(own?.status, "saved");
  });
});
