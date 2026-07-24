import { and, eq } from "drizzle-orm";
import type { UserArticleScoreStatus } from "@newsroom/db";
import { type Database, userArticleScores } from "@newsroom/db";

export async function getScoreForUserArticle(
  db: Database,
  userId: string,
  articleId: string,
) {
  const [row] = await db
    .select()
    .from(userArticleScores)
    .where(
      and(
        eq(userArticleScores.userId, userId),
        eq(userArticleScores.articleId, articleId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateScoreStatusForUser(
  db: Database,
  userId: string,
  articleId: string,
  status: UserArticleScoreStatus,
) {
  const now = new Date();
  const [updated] = await db
    .update(userArticleScores)
    .set({ status, updatedAt: now })
    .where(
      and(
        eq(userArticleScores.userId, userId),
        eq(userArticleScores.articleId, articleId),
      ),
    )
    .returning();
  return updated ?? null;
}
