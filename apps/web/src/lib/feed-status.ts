import { eq, inArray } from "drizzle-orm";
import type { UserArticleScoreStatus } from "@newsroom/db";
import {
  articleSources,
  articles,
  getDb,
  sourceSubscriptions,
} from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import { toFeedItemJson, type FeedSourceJson } from "@/lib/feed";
import { updateScoreStatusForUser } from "@/lib/feed-queries";

export async function updateFeedStatusResponse(
  articleId: string,
  status: UserArticleScoreStatus,
): Promise<Response> {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const updated = await updateScoreStatusForUser(
    getDb(),
    authResult.userId,
    articleId,
    status,
  );

  if (!updated) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const [article] = await getDb()
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!article) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const sourceRows = await getDb()
    .select({
      sourceType: articleSources.sourceType,
      externalId: articleSources.externalId,
      subscriptionUserId: sourceSubscriptions.userId,
    })
    .from(articleSources)
    .leftJoin(
      sourceSubscriptions,
      eq(sourceSubscriptions.id, articleSources.sourceSubscriptionId),
    )
    .where(inArray(articleSources.articleId, [articleId]));

  const sources: FeedSourceJson[] = [];
  for (const row of sourceRows) {
    if (
      row.subscriptionUserId !== null &&
      row.subscriptionUserId !== authResult.userId
    ) {
      continue;
    }
    sources.push({
      sourceType: row.sourceType,
      externalId: row.externalId,
    });
  }

  return Response.json({
    item: toFeedItemJson({
      articleId: updated.articleId,
      title: article.title,
      summary: article.summary,
      canonicalUrl: article.canonicalUrl,
      author: article.author,
      publishedAt: article.publishedAt,
      showTitle: article.showTitle,
      durationSeconds: article.durationSeconds,
      enclosureUrl: article.enclosureUrl,
      keywordScore: updated.keywordScore,
      aiScore: updated.aiScore,
      finalRank: updated.finalRank,
      reason: updated.reason,
      nearDuplicateOfArticleId: updated.nearDuplicateOfArticleId,
      status: updated.status,
      scoredAt: updated.scoredAt,
      sources,
    }),
  });
}
