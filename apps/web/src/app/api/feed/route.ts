import { inheritedKeywordsForTopicName } from "@newsroom/ai";
import { and, desc, eq, ilike, inArray, lt, ne, or, sql } from "drizzle-orm";
import {
  articleSources,
  articles,
  countUserAvailableArticles,
  countUserEvaluatedArticles,
  getDb,
  isUserDirty,
  jobs,
  sourceSubscriptions,
  topics,
  touchFeedActivity,
  userArticleScores,
  type UserArticleScoreStatus,
} from "@newsroom/db";
import { ensureNextRankJob } from "@newsroom/worker/rank";
import { requireSessionUserId } from "@/lib/session";
import {
  countMatchingFeedRows,
  decodeFeedCursor,
  encodeFeedCursor,
  escapeIlikePattern,
  matchesTopicIds,
  parseFeedLimit,
  parseFeedSearchQuery,
  parseFeedSourceFilter,
  parseFeedStatusFilter,
  parseFeedTopicIds,
  passesTopicFilter,
  toFeedItemJson,
  tokenizeFeedSearch,
  type FeedSourceJson,
} from "@/lib/feed";

export const dynamic = "force-dynamic";

/** Cap for in-app topic/source matching when counting (personal-scale feed). */
const MATCH_COUNT_SCAN_LIMIT = 2000;

async function loadPipelineTimes(userId: string): Promise<{
  lastIngestAt: string | null;
  lastRankedAt: string | null;
}> {
  const db = getDb();
  const [[ingestRow], [rankRow]] = await Promise.all([
    db
      .select({ at: sql<Date | string | null>`max(${jobs.finishedAt})` })
      .from(jobs)
      .where(and(eq(jobs.type, "ingest"), eq(jobs.status, "completed"))),
    db
      .select({
        at: sql<Date | string | null>`max(${userArticleScores.scoredAt})`,
      })
      .from(userArticleScores)
      .where(eq(userArticleScores.userId, userId)),
  ]);

  return {
    lastIngestAt: toIsoOrNull(ingestRow?.at ?? null),
    lastRankedAt: toIsoOrNull(rankRow?.at ?? null),
  };
}

async function loadSourceTypesForUser(
  userId: string,
  articleIds: string[],
): Promise<Map<string, Set<string>>> {
  const sourceTypesByArticle = new Map<string, Set<string>>();
  if (articleIds.length === 0) return sourceTypesByArticle;

  const sourceRows = await getDb()
    .select({
      articleId: articleSources.articleId,
      sourceType: articleSources.sourceType,
      subscriptionUserId: sourceSubscriptions.userId,
    })
    .from(articleSources)
    .leftJoin(
      sourceSubscriptions,
      eq(sourceSubscriptions.id, articleSources.sourceSubscriptionId),
    )
    .where(inArray(articleSources.articleId, articleIds));

  for (const row of sourceRows) {
    if (
      row.subscriptionUserId !== null &&
      row.subscriptionUserId !== userId
    ) {
      continue;
    }
    const types = sourceTypesByArticle.get(row.articleId) ?? new Set();
    types.add(row.sourceType);
    sourceTypesByArticle.set(row.articleId, types);
  }
  return sourceTypesByArticle;
}

/** AND of ILIKE token matches across title / summary / reason. */
function feedSearchConditions(searchQuery: string) {
  return tokenizeFeedSearch(searchQuery).map((token) => {
    const pattern = `%${escapeIlikePattern(token)}%`;
    return or(
      ilike(articles.title, pattern),
      ilike(articles.summary, pattern),
      ilike(userArticleScores.reason, pattern),
    )!;
  });
}

async function loadFeedCounts(args: {
  userId: string;
  statusFilter: UserArticleScoreStatus | null;
  topicIds: string[] | null;
  topicKeywords: string[] | null;
  topicInheritedKeywords: string[] | null;
  sourceFilter: string | null;
  searchQuery: string | null;
}): Promise<{
  matchedCount: number;
  totalCount: number;
  rankedCount: number;
  evaluatedCount: number;
  articlesCount: number;
}> {
  const db = getDb();
  const statusCondition =
    args.statusFilter !== null
      ? eq(userArticleScores.status, args.statusFilter)
      : ne(userArticleScores.status, "dismissed");
  const baseWhere = and(
    eq(userArticleScores.userId, args.userId),
    statusCondition,
  );

  const [[totalRow], evaluatedCount, articlesCount] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userArticleScores)
      .where(baseWhere),
    countUserEvaluatedArticles(db, args.userId),
    countUserAvailableArticles(db, args.userId),
  ]);
  const totalCount = Number(totalRow?.n ?? 0);
  const rankedCount = totalCount;

  if (
    args.topicIds === null &&
    args.sourceFilter === null &&
    args.searchQuery === null
  ) {
    return {
      matchedCount: totalCount,
      totalCount,
      rankedCount,
      evaluatedCount,
      articlesCount,
    };
  }

  const searchConds =
    args.searchQuery !== null ? feedSearchConditions(args.searchQuery) : [];
  const scoredWhere =
    searchConds.length > 0 ? and(baseWhere, ...searchConds) : baseWhere;

  // Search alone can be counted in SQL; topic/source still need an app scan.
  if (args.topicIds === null && args.sourceFilter === null) {
    const [matchedRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(userArticleScores)
      .innerJoin(articles, eq(articles.id, userArticleScores.articleId))
      .where(scoredWhere);
    return {
      matchedCount: Number(matchedRow?.n ?? 0),
      totalCount,
      rankedCount,
      evaluatedCount,
      articlesCount,
    };
  }

  const scanRows = await db
    .select({
      articleId: userArticleScores.articleId,
      title: articles.title,
      summary: articles.summary,
      showTitle: articles.showTitle,
      reason: userArticleScores.reason,
      matchedTopicIds: userArticleScores.matchedTopicIds,
    })
    .from(userArticleScores)
    .innerJoin(articles, eq(articles.id, userArticleScores.articleId))
    .where(scoredWhere)
    .limit(MATCH_COUNT_SCAN_LIMIT);

  const sourceTypesByArticle =
    args.sourceFilter !== null
      ? await loadSourceTypesForUser(
          args.userId,
          scanRows.map((r) => r.articleId),
        )
      : new Map<string, Set<string>>();

  const matchedCount = countMatchingFeedRows(scanRows, {
    topicIds: args.topicIds,
    topicKeywords: args.topicKeywords,
    topicInheritedKeywords: args.topicInheritedKeywords,
    sourceFilter: args.sourceFilter,
    // Search already applied in SQL.
    searchQuery: null,
    sourceTypesByArticle,
  });

  return {
    matchedCount,
    totalCount,
    rankedCount,
    evaluatedCount,
    articlesCount,
  };
}

function toIsoOrNull(value: Date | string | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(request: Request) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  await touchFeedActivity(getDb(), authResult.userId);
  const needsRank = await isUserDirty(getDb(), authResult.userId);
  if (needsRank) {
    await ensureNextRankJob(getDb(), {
      userId: authResult.userId,
      delayMs: 0,
    });
  }

  const url = new URL(request.url);
  const limit = parseFeedLimit(url.searchParams.get("limit"));
  const cursorRaw = url.searchParams.get("cursor");
  const topicIds = parseFeedTopicIds(url);
  const sourceFilter = parseFeedSourceFilter(url.searchParams.get("source"));
  const statusFilter = parseFeedStatusFilter(url.searchParams.get("status"));
  const searchQuery = parseFeedSearchQuery(url.searchParams.get("q"));

  if (
    topicIds === "invalid" ||
    sourceFilter === "invalid" ||
    statusFilter === "invalid" ||
    searchQuery === "invalid"
  ) {
    return Response.json({ error: "invalid_filter" }, { status: 400 });
  }

  let cursor: { finalRank: number; articleId: string } | null = null;
  if (cursorRaw) {
    cursor = decodeFeedCursor(cursorRaw);
    if (!cursor) {
      return Response.json({ error: "invalid_cursor" }, { status: 400 });
    }
  }

  // Kept separate (not flattened) — inherited/ancestor keywords must never
  // count as a primary match on their own, only as a weak boost once a
  // topic's own keyword has already matched. See scoreKeywordMatch.
  let topicKeywords: string[] | null = null;
  let topicInheritedKeywords: string[] | null = null;
  if (topicIds.length > 0) {
    const topicRows = await getDb()
      .select()
      .from(topics)
      .where(
        and(
          eq(topics.userId, authResult.userId),
          inArray(topics.id, topicIds),
        ),
      );
    if (topicRows.length !== topicIds.length) {
      return Response.json({ error: "invalid_filter" }, { status: 400 });
    }
    const keywords: string[] = [];
    const inheritedKeywords: string[] = [];
    const seenKw = new Set<string>();
    const seenInherited = new Set<string>();
    for (const topic of topicRows) {
      for (const kw of topic.keywords ?? []) {
        const key = kw.trim().toLowerCase();
        if (!key || seenKw.has(key)) continue;
        seenKw.add(key);
        keywords.push(kw.trim());
      }
      for (const kw of inheritedKeywordsForTopicName(topic.name)) {
        const key = kw.trim().toLowerCase();
        if (!key || seenInherited.has(key)) continue;
        seenInherited.add(key);
        inheritedKeywords.push(kw.trim());
      }
    }
    topicKeywords = keywords;
    topicInheritedKeywords = inheritedKeywords;
  }

  const conditions = [
    eq(userArticleScores.userId, authResult.userId),
    statusFilter !== null
      ? eq(userArticleScores.status, statusFilter)
      : ne(userArticleScores.status, "dismissed"),
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

  if (searchQuery !== null) {
    conditions.push(...feedSearchConditions(searchQuery));
  }

  // Over-fetch when filtering by topic/source in app layer (search is SQL).
  const needsAppFilter = topicKeywords !== null || sourceFilter !== null;
  const fetchLimit = needsAppFilter ? Math.min(200, limit * 10) : limit + 1;

  const [scoreRows, pipeline, counts] = await Promise.all([
    getDb()
      .select({
        articleId: userArticleScores.articleId,
        title: articles.title,
        summary: articles.summary,
        canonicalUrl: articles.canonicalUrl,
        author: articles.author,
        publishedAt: articles.publishedAt,
        showTitle: articles.showTitle,
        durationSeconds: articles.durationSeconds,
        enclosureUrl: articles.enclosureUrl,
        keywordScore: userArticleScores.keywordScore,
        aiScore: userArticleScores.aiScore,
        finalRank: userArticleScores.finalRank,
        reason: userArticleScores.reason,
        nearDuplicateOfArticleId: userArticleScores.nearDuplicateOfArticleId,
        status: userArticleScores.status,
        scoredAt: userArticleScores.scoredAt,
        matchedTopicIds: userArticleScores.matchedTopicIds,
      })
      .from(userArticleScores)
      .innerJoin(articles, eq(articles.id, userArticleScores.articleId))
      .where(and(...conditions))
      .orderBy(desc(userArticleScores.finalRank), desc(userArticleScores.articleId))
      .limit(fetchLimit),
    loadPipelineTimes(authResult.userId),
    loadFeedCounts({
      userId: authResult.userId,
      statusFilter,
      topicIds: topicIds.length > 0 ? topicIds : null,
      topicKeywords,
      topicInheritedKeywords,
      sourceFilter,
      searchQuery,
    }),
  ]);

  if (scoreRows.length === 0) {
    return Response.json({
      items: [],
      nextCursor: null,
      lastIngestAt: pipeline.lastIngestAt,
      lastRankedAt: pipeline.lastRankedAt,
      matchedCount: counts.matchedCount,
      totalCount: counts.totalCount,
      rankedCount: counts.rankedCount,
      evaluatedCount: counts.evaluatedCount,
      articlesCount: counts.articlesCount,
      needsRank,
    });
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
    if (topicIds.length > 0) {
      const verdict = matchesTopicIds(row.matchedTopicIds, topicIds);
      if (verdict === "no-match") continue;
      // Pre-migration row (matchedTopicIds not yet populated) — fall back
      // to a live keyword re-check until it's naturally re-ranked.
      if (
        verdict === "unknown" &&
        !passesTopicFilter(
          row.title,
          row.summary,
          topicKeywords ?? [],
          topicInheritedKeywords ?? undefined,
          row.showTitle,
        )
      ) {
        continue;
      }
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
        showTitle: row.showTitle,
        durationSeconds: row.durationSeconds,
        enclosureUrl: row.enclosureUrl,
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
    lastIngestAt: pipeline.lastIngestAt,
    lastRankedAt: pipeline.lastRankedAt,
    matchedCount: counts.matchedCount,
    totalCount: counts.totalCount,
    rankedCount: counts.rankedCount,
    evaluatedCount: counts.evaluatedCount,
    articlesCount: counts.articlesCount,
    needsRank,
  });
}
