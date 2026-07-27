import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import {
  articleSources,
  articles,
  countUserAvailableArticles,
  countUserEvaluatedArticles,
  createDb,
  invalidatePreferenceEvaluations,
  markUserPreferenceDirty,
  sourceSubscriptions,
  upsertArticleEvaluation,
  user,
  userArticleEvaluations,
  userArticleScores,
  type Database,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://newsroom:newsroom@localhost:5432/newsroom";

describe("user_article_evaluations", () => {
  let db: Database;
  const userId = `eval-user-${randomUUID()}`;
  const subId = `eval-sub-${randomUUID()}`;
  const hitId = `eval-art-hit-${randomUUID()}`;
  const missId = `eval-art-miss-${randomUUID()}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: "Eval",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(sourceSubscriptions).values({
      id: subId,
      userId,
      sourceType: "hackernews",
      config: { mode: "top" },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(articles).values([
      {
        id: hitId,
        canonicalUrl: `https://fixture.example/p/${hitId}`,
        title: "Hit",
        summary: null,
        author: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: missId,
        canonicalUrl: `https://fixture.example/p/${missId}`,
        title: "Miss",
        summary: null,
        author: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(articleSources).values([
      {
        id: randomUUID(),
        articleId: hitId,
        sourceSubscriptionId: subId,
        sourceType: "hackernews",
        externalId: "1",
        fetchedAt: now,
      },
      {
        id: randomUUID(),
        articleId: missId,
        sourceSubscriptionId: subId,
        sourceType: "hackernews",
        externalId: "2",
        fetchedAt: now,
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
    await db.delete(articleSources).where(eq(articleSources.articleId, hitId));
    await db.delete(articleSources).where(eq(articleSources.articleId, missId));
    await db.delete(articles).where(eq(articles.id, hitId));
    await db.delete(articles).where(eq(articles.id, missId));
    await db
      .delete(sourceSubscriptions)
      .where(eq(sourceSubscriptions.id, subId));
    await db.delete(user).where(eq(user.id, userId));
  });

  it("upserts hit/miss and counts available vs evaluated", async () => {
    assert.equal(await countUserAvailableArticles(db, userId), 2);
    assert.equal(await countUserEvaluatedArticles(db, userId), 0);

    await upsertArticleEvaluation(db, {
      userId,
      articleId: hitId,
      hit: true,
    });
    await upsertArticleEvaluation(db, {
      userId,
      articleId: missId,
      hit: false,
    });

    assert.equal(await countUserEvaluatedArticles(db, userId), 2);

    await upsertArticleEvaluation(db, {
      userId,
      articleId: missId,
      hit: true,
    });
    const rows = await db
      .select()
      .from(userArticleEvaluations)
      .where(eq(userArticleEvaluations.userId, userId));
    const missRow = rows.find((r) => r.articleId === missId);
    assert.equal(missRow?.hit, true);
  });

  it("clears evaluations on preference dirty", async () => {
    await upsertArticleEvaluation(db, {
      userId,
      articleId: hitId,
      hit: true,
    });
    assert.ok((await countUserEvaluatedArticles(db, userId)) >= 1);

    await markUserPreferenceDirty(db, userId);
    assert.equal(await countUserEvaluatedArticles(db, userId), 0);
    assert.equal(await invalidatePreferenceEvaluations(db, userId), 0);
  });
});
