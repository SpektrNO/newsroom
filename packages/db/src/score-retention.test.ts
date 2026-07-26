import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import {
  articles,
  createDb,
  pruneUserArticleScores,
  resolveArticleRetention,
  resolveRankScoreRetention,
  user,
  userArticleScores,
  type Database,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://newsroom:newsroom@localhost:5432/newsroom";

describe("rank score retention", () => {
  let db: Database;
  const userId = `ret-user-${randomUUID()}`;
  const ids = {
    saved: `ret-art-saved-${randomUUID()}`,
    top: `ret-art-top-${randomUUID()}`,
    low: `ret-art-low-${randomUUID()}`,
    old: `ret-art-old-${randomUUID()}`,
    dismissed: `ret-art-dis-${randomUUID()}`,
  };

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db.insert(user).values({
      id: userId,
      name: "Retention",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(articles).values(
      Object.values(ids).map((id) => ({
        id,
        canonicalUrl: `https://fixture.example/p/${id}`,
        title: id,
        summary: null,
        author: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db.insert(userArticleScores).values([
      {
        id: randomUUID(),
        userId,
        articleId: ids.saved,
        keywordScore: 0.1,
        aiScore: 0.1,
        finalRank: 0.05,
        status: "saved",
        scoredAt: old,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        articleId: ids.top,
        keywordScore: 0.9,
        aiScore: 0.9,
        finalRank: 0.9,
        status: "new",
        scoredAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        articleId: ids.low,
        keywordScore: 0.2,
        aiScore: 0.2,
        finalRank: 0.2,
        status: "seen",
        scoredAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        articleId: ids.old,
        keywordScore: 0.8,
        aiScore: 0.8,
        finalRank: 0.85,
        status: "new",
        scoredAt: old,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        userId,
        articleId: ids.dismissed,
        keywordScore: 0.1,
        aiScore: null,
        finalRank: 0.1,
        status: "dismissed",
        scoredAt: old,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  after(async () => {
    await db
      .delete(userArticleScores)
      .where(eq(userArticleScores.userId, userId));
    for (const id of Object.values(ids)) {
      await db.delete(articles).where(eq(articles.id, id));
    }
    await db.delete(user).where(eq(user.id, userId));
  });

  it("parses retention env defaults", () => {
    assert.deepEqual(resolveRankScoreRetention({} as NodeJS.ProcessEnv), {
      ttlDays: 30,
      keepTopN: 500,
    });
  });

  it("keeps saved; prunes old dismissed; applies TTL and top-N to new/seen", async () => {
    const result = await pruneUserArticleScores(db, {
      userId,
      config: { ttlDays: 30, keepTopN: 1 },
    });
    assert.ok(result.deleted >= 2);

    const rows = await db
      .select()
      .from(userArticleScores)
      .where(eq(userArticleScores.userId, userId));
    const byArticle = new Map(rows.map((r) => [r.articleId, r.status]));
    assert.equal(byArticle.get(ids.saved), "saved");
    assert.equal(byArticle.get(ids.top), "new");
    assert.equal(byArticle.has(ids.dismissed), false);
    assert.equal(byArticle.has(ids.old), false);
    // low is outside top-1 → deleted even if fresh
    assert.equal(byArticle.has(ids.low), false);
  });
});

describe("article retention", () => {
  let db: Database;
  const userId = `art-ret-${randomUUID()}`;
  const oldSaved = `art-old-saved-${randomUUID()}`;
  const oldGone = `art-old-gone-${randomUUID()}`;
  const fresh = `art-fresh-${randomUUID()}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    await db.insert(user).values({
      id: userId,
      name: "ArtRet",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(articles).values([
      {
        id: oldSaved,
        canonicalUrl: `https://fixture.example/p/${oldSaved}`,
        title: "old saved",
        summary: null,
        author: null,
        publishedAt: old,
        createdAt: old,
        updatedAt: now,
      },
      {
        id: oldGone,
        canonicalUrl: `https://fixture.example/p/${oldGone}`,
        title: "old gone",
        summary: null,
        author: null,
        publishedAt: old,
        createdAt: old,
        updatedAt: now,
      },
      {
        id: fresh,
        canonicalUrl: `https://fixture.example/p/${fresh}`,
        title: "fresh",
        summary: null,
        author: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(userArticleScores).values({
      id: randomUUID(),
      userId,
      articleId: oldSaved,
      keywordScore: 0.5,
      aiScore: 0.5,
      finalRank: 0.5,
      status: "saved",
      scoredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  after(async () => {
    await db
      .delete(userArticleScores)
      .where(eq(userArticleScores.userId, userId));
    for (const id of [oldSaved, oldGone, fresh]) {
      await db.delete(articles).where(eq(articles.id, id));
    }
    await db.delete(user).where(eq(user.id, userId));
  });

  it("defaults ARTICLE_TTL_DAYS to 90", () => {
    assert.deepEqual(resolveArticleRetention({} as NodeJS.ProcessEnv), {
      ttlDays: 90,
    });
  });

  it("deletes old articles but keeps saved bookmarks", async () => {
    const { pruneOldArticles } = await import("./index.js");
    const result = await pruneOldArticles(db, {
      config: { ttlDays: 90 },
    });
    assert.ok(result.deleted >= 1);

    const remaining = await db.select({ id: articles.id }).from(articles);
    const ids = new Set(remaining.map((r) => r.id));
    assert.equal(ids.has(oldSaved), true);
    assert.equal(ids.has(oldGone), false);
    assert.equal(ids.has(fresh), true);
  });
});
