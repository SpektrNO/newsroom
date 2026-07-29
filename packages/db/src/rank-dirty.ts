import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { user } from "./schema/auth.js";
import {
  userArticleEvaluations,
  userArticleScores,
} from "./schema/ranking.js";
import { invalidatePreferenceEvaluations } from "./article-evaluations.js";

/** Recent feed activity window for dirty ∩ active rank (30 minutes). */
export const FEED_ACTIVE_WINDOW_MS = 30 * 60 * 1000;

export async function markUserDirty(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .update(user)
    .set({ dirtyAt: new Date() })
    .where(eq(user.id, userId));
}

export async function markUsersDirty(
  db: Database,
  userIds: string[],
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  await db
    .update(user)
    .set({ dirtyAt: new Date() })
    .where(inArray(user.id, unique));
}

export async function clearUserDirty(
  db: Database,
  userId: string,
): Promise<void> {
  await db.update(user).set({ dirtyAt: null }).where(eq(user.id, userId));
}

export async function touchFeedActivity(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .update(user)
    .set({ lastFeedAt: new Date() })
    .where(eq(user.id, userId));
}

/**
 * Drop keyword/AI shortlist rows (new/seen).
 * Preserve saved / dismissed status rows.
 * Used by explicit wipe — not by topic preference changes.
 */
export async function invalidatePreferenceScores(
  db: Database,
  userId: string,
): Promise<number> {
  const deleted = await db
    .delete(userArticleScores)
    .where(
      and(
        eq(userArticleScores.userId, userId),
        inArray(userArticleScores.status, ["new", "seen"]),
      ),
    )
    .returning({ id: userArticleScores.id });
  return deleted.length;
}

/**
 * Mark dirty and clear keyword-miss evaluations only.
 * Keeps scored hits (and hit evaluations) so the feed is not wiped when
 * topics/keywords change — earlier misses can still become hits under new prefs.
 */
export async function markUserPreferenceDirty(
  db: Database,
  userId: string,
): Promise<void> {
  await invalidatePreferenceEvaluations(db, userId);
  await markUserDirty(db, userId);
}

export type WipeUserRankingsResult = {
  scoresDeleted: number;
  evaluationsDeleted: number;
};

/**
 * Wipe ranked feed rows for a user without auto re-rank.
 * Keeps saved/dismissed scores (+ their evaluations); clears dirtyAt.
 */
export async function wipeUserRankings(
  db: Database,
  userId: string,
): Promise<WipeUserRankingsResult> {
  const scoresDeleted = await invalidatePreferenceScores(db, userId);

  const deletedEvals = await db
    .delete(userArticleEvaluations)
    .where(
      and(
        eq(userArticleEvaluations.userId, userId),
        sql`NOT EXISTS (
          SELECT 1 FROM ${userArticleScores} AS s
          WHERE s.user_id = ${userArticleEvaluations.userId}
            AND s.article_id = ${userArticleEvaluations.articleId}
        )`,
      ),
    )
    .returning({ id: userArticleEvaluations.id });

  await clearUserDirty(db, userId);

  return {
    scoresDeleted,
    evaluationsDeleted: deletedEvals.length,
  };
}

export async function isUserDirty(
  db: Database,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ dirtyAt: user.dirtyAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.dirtyAt != null;
}

/** Dirty users with optional activity gate (last_feed_at within window). */
export async function listDirtyRankUserIds(
  db: Database,
  options: { allDirty?: boolean; onlyUserId?: string } = {},
): Promise<string[]> {
  if (options.onlyUserId) {
    return [options.onlyUserId];
  }

  const conditions = [isNotNull(user.dirtyAt)];
  if (!options.allDirty) {
    conditions.push(
      sql`${user.lastFeedAt} IS NOT NULL AND ${user.lastFeedAt} > NOW() - (${FEED_ACTIVE_WINDOW_MS}::bigint * INTERVAL '1 millisecond')`,
    );
  }

  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(...conditions));
  return rows.map((r) => r.id);
}
