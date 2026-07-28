/**
 * Integration: mocked AiProvider → user_article_scores rows.
 * Requires Postgres (defaults to local Compose DATABASE_URL).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import type { AiProvider } from "@newsroom/ai";
import {
  articleSources,
  articles,
  createDb,
  jobs,
  sourceSubscriptions,
  topics,
  user,
  userArticleEvaluations,
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

    await db
      .delete(userArticleScores)
      .where(eq(userArticleScores.userId, userId));
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(user).where(eq(user.id, otherUserId));

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
              articleId: "r0",
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
    assert.ok(result.evaluated >= 2);
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
    // Mock AI response above has no confirmedTopicIds → falls back to the
    // full keyword-matched candidate set (this topic).
    assert.deepEqual(scores[0]?.matchedTopicIds, [topicId]);

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

    const evals = await db
      .select()
      .from(userArticleEvaluations)
      .where(eq(userArticleEvaluations.userId, userId));
    assert.equal(evals.length, 2);
    const byArticle = new Map(evals.map((e) => [e.articleId, e.hit]));
    assert.equal(byArticle.get(articleId), true);
    assert.equal(byArticle.get(otherArticleId), false);

    const leaked = await db
      .select()
      .from(userArticleScores)
      .where(eq(userArticleScores.userId, otherUserId));
    assert.equal(leaked.length, 0);
  });

  it("skips idle dirty users unless --all-dirty / allDirty", async () => {
    const provider: AiProvider = {
      async complete() {
        return { model: "fake", text: "[]" };
      },
      async health() {
        return true;
      },
    };

    await db
      .update(user)
      .set({ dirtyAt: new Date(), lastFeedAt: null })
      .where(eq(user.id, userId));

    const skipped = await runRank(db, { provider, batchSize: 20 });
    assert.equal(skipped.users, 0);

    const forced = await runRank(db, {
      provider,
      batchSize: 20,
      allDirty: true,
    });
    assert.ok(forced.users >= 1);

    const [row] = await db
      .select({ dirtyAt: user.dirtyAt })
      .from(user)
      .where(eq(user.id, userId));
    assert.equal(row?.dirtyAt, null);
  });
});

describe("per-user rank jobs", () => {
  let db: Database;
  const userA = `q-user-a-${randomUUID()}`;
  const userB = `q-user-b-${randomUUID()}`;
  const topicA = `q-topic-a-${randomUUID()}`;
  const topicB = `q-topic-b-${randomUUID()}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values([
      {
        id: userA,
        name: "Queue A",
        email: `${userA}@test.local`,
        emailVerified: true,
        dirtyAt: now,
        lastFeedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: userB,
        name: "Queue B",
        email: `${userB}@test.local`,
        emailVerified: true,
        dirtyAt: now,
        lastFeedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(topics).values([
      {
        id: topicA,
        userId: userA,
        name: "Topic A",
        keywords: ["alpha"],
        weight: 1,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: topicB,
        userId: userB,
        name: "Topic B",
        keywords: ["beta"],
        weight: 1,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  after(async () => {
    await db.execute(sql`
      DELETE FROM jobs
      WHERE type = 'rank'
        AND (
          payload->>'userId' = ${userA}
          OR payload->>'userId' = ${userB}
        )
    `);
    await db.delete(topics).where(eq(topics.userId, userA));
    await db.delete(topics).where(eq(topics.userId, userB));
    await db.delete(user).where(eq(user.id, userA));
    await db.delete(user).where(eq(user.id, userB));
  });

  it("enqueues one open job per user and coalesces duplicates", async () => {
    const {
      ensureNextRankJob,
      enqueueRankJobsForEligibleUsers,
    } = await import("./rank.js");

    await db.execute(sql`
      DELETE FROM jobs
      WHERE type = 'rank'
        AND (
          payload->>'userId' = ${userA}
          OR payload->>'userId' = ${userB}
        )
    `);

    await ensureNextRankJob(db, { userId: userA });
    await ensureNextRankJob(db, { userId: userA });
    await ensureNextRankJob(db, { userId: userB });

    const open = (
      await db
        .select({ id: jobs.id, payload: jobs.payload })
        .from(jobs)
        .where(and(eq(jobs.type, "rank"), eq(jobs.status, "pending")))
    ).filter((r) => {
      const uid = r.payload?.userId;
      return uid === userA || uid === userB;
    });

    const userIds = open
      .map((r) =>
        typeof r.payload?.userId === "string" ? r.payload.userId : null,
      )
      .filter(Boolean)
      .sort();
    assert.deepEqual(userIds, [userA, userB].sort());

    const n = await enqueueRankJobsForEligibleUsers(db, { allDirty: true });
    assert.ok(n >= 2);

    const still = (
      await db
        .select({ id: jobs.id, payload: jobs.payload })
        .from(jobs)
        .where(and(eq(jobs.type, "rank"), eq(jobs.status, "pending")))
    ).filter((r) => {
      const uid = r.payload?.userId;
      return uid === userA || uid === userB;
    });
    assert.equal(still.length, open.length);
  });

  it("fails processRankJob without userId", async () => {
    const { processRankJob } = await import("./rank.js");
    const id = randomUUID();
    await db.insert(jobs).values({
      id,
      type: "rank",
      status: "pending",
      payload: {},
      scheduledAt: new Date(),
      attempts: 0,
      createdAt: new Date(),
    });
    // Mark running so unique index doesn't care (no userId).
    await db.update(jobs).set({ status: "running" }).where(eq(jobs.id, id));

    const result = await processRankJob(db, id);
    assert.deepEqual(result.errors, ["missing_userId"]);

    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    assert.equal(row?.status, "failed");
  });
});

describe("invalidatePreferenceScores", () => {
  let db: Database;
  const userId = `pref-user-${randomUUID()}`;
  const articleNew = `pref-art-new-${randomUUID()}`;
  const articleSaved = `pref-art-saved-${randomUUID()}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: "Pref",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(articles).values([
      {
        id: articleNew,
        canonicalUrl: `https://fixture.example/p/${articleNew}`,
        title: "New",
        summary: null,
        author: null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: articleSaved,
        canonicalUrl: `https://fixture.example/p/${articleSaved}`,
        title: "Saved",
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
  });

  after(async () => {
    await db
      .delete(userArticleScores)
      .where(eq(userArticleScores.userId, userId));
    await db.delete(articles).where(eq(articles.id, articleNew));
    await db.delete(articles).where(eq(articles.id, articleSaved));
    await db.delete(user).where(eq(user.id, userId));
  });

  it("deletes new/seen scores and keeps saved", async () => {
    const { invalidatePreferenceScores } = await import("@newsroom/db");
    const n = await invalidatePreferenceScores(db, userId);
    assert.equal(n, 1);
    const rows = await db
      .select()
      .from(userArticleScores)
      .where(eq(userArticleScores.userId, userId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "saved");
  });
});

describe("runRank matchedTopicIds narrowing", () => {
  let db: Database;
  const userId = `rank-confirm-user-${randomUUID()}`;
  const subId = `rank-confirm-sub-${randomUUID()}`;
  const topicAiId = `rank-confirm-topic-ai-${randomUUID()}`;
  const topicMatterId = `rank-confirm-topic-matter-${randomUUID()}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: "Confirm Test",
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
    // Both topics keyword-hit the same article title so the AI has two
    // candidates to narrow between.
    await db.insert(topics).values([
      {
        id: topicAiId,
        userId,
        name: "AI infra",
        keywords: ["ai"],
        weight: 1,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: topicMatterId,
        userId,
        name: "Space matter",
        keywords: ["matter"],
        weight: 1,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  after(async () => {
    await db.delete(userArticleScores).where(eq(userArticleScores.userId, userId));
    await db
      .delete(userArticleEvaluations)
      .where(eq(userArticleEvaluations.userId, userId));
    await db.delete(topics).where(eq(topics.userId, userId));
    await db
      .delete(sourceSubscriptions)
      .where(eq(sourceSubscriptions.id, subId));
    await db.delete(user).where(eq(user.id, userId));
  });

  async function insertArticle(title: string) {
    const articleId = `rank-confirm-art-${randomUUID()}`;
    const now = new Date();
    await db.insert(articles).values({
      id: articleId,
      canonicalUrl: `https://fixture.example/p/${articleId}`,
      title,
      summary: null,
      author: "tester",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(articleSources).values({
      id: randomUUID(),
      articleId,
      sourceSubscriptionId: subId,
      sourceType: "hackernews",
      externalId: articleId,
      fetchedAt: now,
    });
    return articleId;
  }

  it("narrows matchedTopicIds to the topic the AI actually confirms", async () => {
    const articleId = await insertArticle("Does free will matter for AI agents");

    // Resolve the "AI infra" topic's short ref from the prompt itself, so
    // the test doesn't depend on topic array ordering.
    const provider: AiProvider = {
      async complete({ prompt }) {
        const match = prompt.match(/topics: (\[.*\])\n/);
        const topicsParsed = match?.[1]
          ? (JSON.parse(match[1]) as Array<{ id?: string; name: string }>)
          : [];
        const aiTopic = topicsParsed.find((t) => t.name === "AI infra");
        return {
          model: "fake",
          text: JSON.stringify([
            {
              articleId: "r0",
              aiScore: 0.7,
              reason: "Genuinely about AI agents, not physics",
              confirmedTopicIds: aiTopic?.id ? [aiTopic.id] : [],
            },
          ]),
        };
      },
      async health() {
        return true;
      },
    };

    await runRank(db, { userId, provider, batchSize: 20 });

    const [score] = await db
      .select()
      .from(userArticleScores)
      .where(
        and(
          eq(userArticleScores.userId, userId),
          eq(userArticleScores.articleId, articleId),
        ),
      );
    assert.deepEqual(score?.matchedTopicIds, [topicAiId]);
  });

  it("keeps the full keyword-matched set when the AI batch fails", async () => {
    const articleId = await insertArticle("Does free will matter for AI agents too");

    const provider: AiProvider = {
      async complete() {
        return { model: "fake", text: "not json at all" };
      },
      async health() {
        return true;
      },
    };

    await runRank(db, { userId, provider, batchSize: 20 });

    const [score] = await db
      .select()
      .from(userArticleScores)
      .where(
        and(
          eq(userArticleScores.userId, userId),
          eq(userArticleScores.articleId, articleId),
        ),
      );
    assert.equal(score?.aiScore, null);
    const matched = [...(score?.matchedTopicIds ?? [])].sort();
    assert.deepEqual(matched, [topicAiId, topicMatterId].sort());
  });
});
