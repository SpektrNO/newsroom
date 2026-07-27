import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { userArticleEvaluations } from "./schema/ranking.js";

export type UpsertEvaluationInput = {
  userId: string;
  articleId: string;
  hit: boolean;
};

/** Record that we keyword-checked this article (hit or miss). */
export async function upsertArticleEvaluation(
  db: Database,
  input: UpsertEvaluationInput,
): Promise<void> {
  const now = new Date();
  await db
    .insert(userArticleEvaluations)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      articleId: input.articleId,
      hit: input.hit,
      evaluatedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        userArticleEvaluations.userId,
        userArticleEvaluations.articleId,
      ],
      set: {
        hit: input.hit,
        evaluatedAt: now,
        updatedAt: now,
      },
    });
}

/** Drop evaluation markers so preference changes re-check keywords. */
export async function invalidatePreferenceEvaluations(
  db: Database,
  userId: string,
): Promise<number> {
  const deleted = await db
    .delete(userArticleEvaluations)
    .where(eq(userArticleEvaluations.userId, userId))
    .returning({ id: userArticleEvaluations.id });
  return deleted.length;
}

export type PruneEvaluationsResult = {
  deleted: number;
};

/** Delete evaluations older than TTL (same clock as score TTL by default). */
export async function pruneUserArticleEvaluations(
  db: Database,
  options: {
    userId?: string;
    ttlDays: number;
  },
): Promise<PruneEvaluationsResult> {
  if (options.ttlDays <= 0) {
    return { deleted: 0 };
  }
  const cutoff = new Date(
    Date.now() - options.ttlDays * 24 * 60 * 60 * 1000,
  );
  const where = options.userId
    ? and(
        eq(userArticleEvaluations.userId, options.userId),
        lt(userArticleEvaluations.evaluatedAt, cutoff),
      )
    : lt(userArticleEvaluations.evaluatedAt, cutoff);
  const deleted = await db
    .delete(userArticleEvaluations)
    .where(where!)
    .returning({ id: userArticleEvaluations.id });
  return { deleted: deleted.length };
}

/** Distinct articles available via the user's enabled subscriptions. */
export async function countUserAvailableArticles(
  db: Database,
  userId: string,
): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`
    SELECT COUNT(DISTINCT a.id)::int AS n
    FROM articles AS a
    INNER JOIN article_sources AS s ON s.article_id = a.id
    INNER JOIN source_subscriptions AS sub
      ON sub.id = s.source_subscription_id
    WHERE sub.user_id = ${userId}
      AND sub.enabled = true
  `);
  const rows = result as unknown as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

/** Evaluations for articles still linked to the user's enabled subscriptions. */
export async function countUserEvaluatedArticles(
  db: Database,
  userId: string,
): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`
    SELECT COUNT(DISTINCT e.article_id)::int AS n
    FROM user_article_evaluations AS e
    INNER JOIN article_sources AS s ON s.article_id = e.article_id
    INNER JOIN source_subscriptions AS sub
      ON sub.id = s.source_subscription_id
    WHERE e.user_id = ${userId}
      AND sub.user_id = ${userId}
      AND sub.enabled = true
  `);
  const rows = result as unknown as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}
