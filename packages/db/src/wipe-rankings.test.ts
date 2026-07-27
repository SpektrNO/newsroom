import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import {
  articles,
  createDb,
  isUserDirty,
  user,
  userArticleEvaluations,
  userArticleScores,
  wipeUserRankings,
  type Database,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://newsroom:newsroom@localhost:5432/newsroom";

describe("wipeUserRankings", () => {
  let db: Database;
  const userId = `wipe-user-${randomUUID()}`;
  const articleNew = `wipe-art-new-${randomUUID()}`;
  const articleSaved = `wipe-art-saved-${randomUUID()}`;
  const articleMiss = `wipe-art-miss-${randomUUID()}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: "Wipe",
      email: `${userId}@test.local`,
      emailVerified: true,
      dirtyAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(articles).values([
      {
        id: articleNew,
        canonicalUrl: `https://fixture.example/w/${articleNew}`,
        title: "New",
        summary: null,
        author: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: articleSaved,
        canonicalUrl: `https://fixture.example/w/${articleSaved}`,
        title: "Saved",
        summary: null,
        author: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: articleMiss,
        canonicalUrl: `https://fixture.example/w/${articleMiss}`,
        title: "Miss",
        summary: null,
        author: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(userArticleScores).values([
      {
        id: randomUUID(),
        userId,
        articleId: articleNew,
        keywordScore: 0.5,
        aiScore: 0.5,
        finalRank: 0.5,
        status: "new",
        scoredAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        articleId: articleSaved,
        keywordScore: 0.5,
        aiScore: 0.5,
        finalRank: 0.5,
        status: "saved",
        scoredAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(userArticleEvaluations).values([
      {
        id: randomUUID(),
        userId,
        articleId: articleNew,
        hit: true,
        evaluatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        articleId: articleSaved,
        hit: true,
        evaluatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        articleId: articleMiss,
        hit: false,
        evaluatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  after(async () => {
    await db
      .delete(userArticleEvaluations)
      .where(eq(userArticleEvaluations.userId, userId));
    await db
      .delete(userArticleScores)
      .where(eq(userArticleScores.userId, userId));
    await db.delete(articles).where(eq(articles.id, articleNew));
    await db.delete(articles).where(eq(articles.id, articleSaved));
    await db.delete(articles).where(eq(articles.id, articleMiss));
    await db.delete(user).where(eq(user.id, userId));
  });

  it("keeps saved scores/evals, drops orphan evals, clears dirty", async () => {
    const result = await wipeUserRankings(db, userId);
    assert.equal(result.scoresDeleted, 1);
    assert.equal(result.evaluationsDeleted, 2);

    const scores = await db
      .select()
      .from(userArticleScores)
      .where(eq(userArticleScores.userId, userId));
    assert.equal(scores.length, 1);
    assert.equal(scores[0]?.status, "saved");

    const evals = await db
      .select()
      .from(userArticleEvaluations)
      .where(eq(userArticleEvaluations.userId, userId));
    assert.equal(evals.length, 1);
    assert.equal(evals[0]?.articleId, articleSaved);

    assert.equal(await isUserDirty(db, userId), false);
  });
});
