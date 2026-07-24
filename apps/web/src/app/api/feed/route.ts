import { and, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import {
  articleSources,
  articles,
  getDb,
  sourceSubscriptions,
  topics,
  userArticleScores,
} from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  parseFeedLimit,
  parseFeedSourceFilter,
  passesTopicFilter,
  toFeedItemJson,
  type FeedSourceJson,
} from "@/lib/feed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const url = new URL(request.url);
  const limit = parseFeedLimit(url.searchParams.get("limit"));
  const cursorRaw = url.searchParams.get("cursor");
  const topicId = url.searchParams.get("topic");
  const sourceFilter = parseFeedSourceFilter(url.searchParams.get("source"));

  if (sourceFilter === "invalid") {
    return Response.json({ error: "invalid_filter" }, { status: 400 });
  }

  let cursor: { finalRank: number; articleId: string } | null = null;
  if (cursorRaw) {
    cursor = decodeFeedCursor(cursorRaw);
    if (!cursor) {
      return Response.json({ error: "invalid_cursor" }, { status: 400 });
    }
  }

  let topicKeywords: string[] | null = null;
  if (topicId) {
    const [topic] = await getDb()
      .select()
      .from(topics)
      .where(
        and(eq(topics.id, topicId), eq(topics.userId, authResult.userId)),
      )
      .limit(1);
    if (!topic) {
      return Response.json({ error: "invalid_filter" }, { status: 400 });
    }
    topicKeywords = topic.keywords ?? [];
  }

  const conditions = [
    eq(userArticleScores.userId, authResult.userId),
    ne(userArticleScores.status, "dismissed"),
  ];

  if (cursor) {
    conditions.push(
      or(
        lt(userArticleScores.finalRank, cursor.finalRank),
        and(
          eq(userArticleScores.finalRank, cursor.finalRank),
          lt(userArticleScores.articleId, cursor.articleId),
        ),
      )!,
    );
  }

  // Over-fetch when filtering by topic/source in app layer.
  const fetchLimit =
    topicKeywords !== null || sourceFilter !== null ? Math.min(200, limit * 10) : limit + 1;

  const scoreRows = await getDb()
    .select({
      articleId: userArticleScores.articleId,
      title: articles.title,
      summary: articles.summary,
      canonicalUrl: articles.canonicalUrl,
      author: articles.author,
      publishedAt: articles.publishedAt,
      keywordScore: userArticleScores.keywordScore,
      aiScore: userArticleScores.aiScore,
      finalRank: userArticleScores.finalRank,
      reason: userArticleScores.reason,
      nearDuplicateOfArticleId: userArticleScores.nearDuplicateOfArticleId,
      status: userArticleScores.status,
      scoredAt: userArticleScores.scoredAt,
    })
    .from(userArticleScores)
    .innerJoin(articles, eq(articles.id, userArticleScores.articleId))
    .where(and(...conditions))
    .orderBy(desc(userArticleScores.finalRank), desc(userArticleScores.articleId))
    .limit(fetchLimit);

  if (scoreRows.length === 0) {
    return Response.json({ items: [], nextCursor: null });
  }

  const articleIds = scoreRows.map((r) => r.articleId);

  const sourceRows = await getDb()
    .select({
      articleId: articleSources.articleId,
      sourceType: articleSources.sourceType,
      externalId: articleSources.externalId,
      subscriptionUserId: sourceSubscriptions.userId,
    })
    .from(articleSources)
    .leftJoin(
      sourceSubscriptions,
      eq(sourceSubscriptions.id, articleSources.sourceSubscriptionId),
    )
    .where(inArray(articleSources.articleId, articleIds));

  const sourcesByArticle = new Map<string, FeedSourceJson[]>();
  const sourceTypesByArticle = new Map<string, Set<string>>();

  for (const row of sourceRows) {
    // Prefer sources linked to this user's subscription, or orphan/shared links.
    if (
      row.subscriptionUserId !== null &&
      row.subscriptionUserId !== authResult.userId
    ) {
      continue;
    }
    const list = sourcesByArticle.get(row.articleId) ?? [];
    list.push({
      sourceType: row.sourceType,
      externalId: row.externalId,
    });
    sourcesByArticle.set(row.articleId, list);

    const types = sourceTypesByArticle.get(row.articleId) ?? new Set();
    types.add(row.sourceType);
    sourceTypesByArticle.set(row.articleId, types);
  }

  const filtered = [];
  for (const row of scoreRows) {
    if (
      topicKeywords !== null &&
      !passesTopicFilter(row.title, row.summary, topicKeywords)
    ) {
      continue;
    }
    if (sourceFilter !== null) {
      const types = sourceTypesByArticle.get(row.articleId);
      if (!types?.has(sourceFilter)) continue;
    }
    filtered.push(row);
    if (filtered.length >= limit + 1) break;
  }

  const page = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeFeedCursor({
          finalRank: last.finalRank,
          articleId: last.articleId,
        })
      : null;

  return Response.json({
    items: page.map((row) =>
      toFeedItemJson({
        articleId: row.articleId,
        title: row.title,
        summary: row.summary,
        canonicalUrl: row.canonicalUrl,
        author: row.author,
        publishedAt: row.publishedAt,
        keywordScore: row.keywordScore,
        aiScore: row.aiScore,
        finalRank: row.finalRank,
        reason: row.reason,
        nearDuplicateOfArticleId: row.nearDuplicateOfArticleId,
        status: row.status,
        scoredAt: row.scoredAt,
        sources: sourcesByArticle.get(row.articleId) ?? [],
      }),
    ),
    nextCursor,
  });
}
