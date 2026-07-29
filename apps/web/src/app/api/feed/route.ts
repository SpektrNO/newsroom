import { inheritedKeywordsForTopicName } from "@newsroom/ai";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  articleSources,
  articles,
  countUserAvailableArticles,
  countUserEvaluatedArticles,
  feedMaxAgeCutoff,
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
  feedCursorFromRow,
  feedSourceSubscriptionLabel,
  matchesTopicIds,
  parseFeedLimit,
  parseFeedOrder,
  parseFeedSearchQuery,
  parseFeedSort,
  parseFeedSourceFilters,
  parseFeedStatusFilter,
  parseFeedTopicIds,
  passesTopicFilter,
  toFeedItemJson,
  tokenizeFeedSearch,
  type FeedCursor,
  type FeedOrder,
  type FeedSort,
  type FeedSourceJson,
} from "@/lib/feed";

export const dynamic = "force-dynamic";

/** Cap for in-app topic matching when counting (personal-scale feed). */
const MATCH_COUNT_SCAN_LIMIT = 2000;
/** Batch size when walking ranked rows for topic app-filter. */
const APP_FILTER_BATCH = 100;
/** Safety cap so a sparse topic filter cannot scan the entire score table. */
const APP_FILTER_MAX_SCAN = 5000;

/** Article is linked to one of the allowed source types for this user (or orphan). */
function articleHasSourceTypes(userId: string, sourceTypes: string[]): SQL {
  return exists(
    getDb()
      .select({ id: articleSources.id })
      .from(articleSources)
      .leftJoin(
        sourceSubscriptions,
        eq(sourceSubscriptions.id, articleSources.sourceSubscriptionId),
      )
      .where(
        and(
          eq(articleSources.articleId, userArticleScores.articleId),
          inArray(articleSources.sourceType, sourceTypes),
          or(
            isNull(sourceSubscriptions.userId),
            eq(sourceSubscriptions.userId, userId),
          ),
        ),
      ),
  );
}

function feedCursorCondition(cursor: FeedCursor): SQL {
  const idCmp =
    cursor.order === "desc"
      ? lt(userArticleScores.articleId, cursor.articleId)
      : gt(userArticleScores.articleId, cursor.articleId);

  if (cursor.sort === "score") {
    const key = cursor.key ?? 0;
    const keyCmp =
      cursor.order === "desc"
        ? lt(userArticleScores.finalRank, key)
        : gt(userArticleScores.finalRank, key);
    const keyEq = eq(userArticleScores.finalRank, key);
    return or(keyCmp, and(keyEq, idCmp))!;
  }

  // Date sort uses NULLS LAST in both directions.
  if (cursor.key === null) {
    return and(isNull(articles.publishedAt), idCmp)!;
  }

  const keyDate = new Date(cursor.key);
  if (cursor.order === "desc") {
    // Include IS NULL so the nulls-last tail is reachable after non-null dates.
    return or(
      and(isNotNull(articles.publishedAt), lt(articles.publishedAt, keyDate)),
      and(eq(articles.publishedAt, keyDate), idCmp),
      isNull(articles.publishedAt),
    )!;
  }
  return or(
    and(isNotNull(articles.publishedAt), gt(articles.publishedAt, keyDate)),
    and(eq(articles.publishedAt, keyDate), idCmp),
    isNull(articles.publishedAt),
  )!;
}

function feedOrderBy(sort: FeedSort, order: FeedOrder): SQL[] {
  if (sort === "score") {
    return order === "desc"
      ? [desc(userArticleScores.finalRank), desc(userArticleScores.articleId)]
      : [asc(userArticleScores.finalRank), asc(userArticleScores.articleId)];
  }
  // NULLS LAST so undated articles stay at the end for both asc and desc.
  return order === "desc"
    ? [
        sql`${articles.publishedAt} DESC NULLS LAST`,
        desc(userArticleScores.articleId),
      ]
    : [
        sql`${articles.publishedAt} ASC NULLS LAST`,
        asc(userArticleScores.articleId),
      ];
}

/** Hide items older than ARTICLE_TTL_DAYS (published_at, else created_at). */
function feedRecencyCondition(
  cutoff: Date | null = feedMaxAgeCutoff(),
): SQL | undefined {
  if (!cutoff) return undefined;
  // Pass ISO text — postgres.js rejects bare Date through this sql/gte path.
  return sql`COALESCE(${articles.publishedAt}, ${articles.createdAt}) >= ${cutoff.toISOString()}::timestamptz`;
}

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
  sourceFilter: string[] | null;
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

  // Same window as article GC / rank candidates (`ARTICLE_TTL_DAYS`).
  const ageCutoff = feedMaxAgeCutoff();
  const ageOpts = ageCutoff ? { notBefore: ageCutoff } : undefined;
  const recency = feedRecencyCondition(ageCutoff);
  const [[totalRow], evaluatedCount, articlesCount] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userArticleScores)
      .innerJoin(articles, eq(articles.id, userArticleScores.articleId))
      .where(and(baseWhere, ...(recency ? [recency] : []))),
    countUserEvaluatedArticles(db, args.userId, ageOpts),
    countUserAvailableArticles(db, args.userId, ageOpts),
  ]);
  const totalCount = Number(totalRow?.n ?? 0);
  const rankedCount = totalCount;

  const searchConds =
    args.searchQuery !== null ? feedSearchConditions(args.searchQuery) : [];
  const sourceCond =
    args.sourceFilter !== null && args.sourceFilter.length > 0
      ? articleHasSourceTypes(args.userId, args.sourceFilter)
      : null;
  const scoredWhere = and(
    baseWhere,
    ...(recency ? [recency] : []),
    ...searchConds,
    ...(sourceCond ? [sourceCond] : []),
  )!;

  // Recency (+ search/source) are SQL; topic still needs an app scan.
  if (args.topicIds === null) {
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

  const matchedCount = countMatchingFeedRows(scanRows, {
    topicIds: args.topicIds,
    topicKeywords: args.topicKeywords,
    topicInheritedKeywords: args.topicInheritedKeywords,
    // Source + recency already applied in SQL.
    sourceFilter: null,
    searchQuery: null,
    sourceTypesByArticle: new Map(),
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
  const sourceFilters = parseFeedSourceFilters(url);
  const statusFilter = parseFeedStatusFilter(url.searchParams.get("status"));
  const searchQuery = parseFeedSearchQuery(url.searchParams.get("q"));
  const sort = parseFeedSort(url.searchParams.get("sort"));
  const order = parseFeedOrder(url.searchParams.get("order"));

  if (
    topicIds === "invalid" ||
    sourceFilters === "invalid" ||
    statusFilter === "invalid" ||
    searchQuery === "invalid" ||
    sort === "invalid" ||
    order === "invalid"
  ) {
    return Response.json({ error: "invalid_filter" }, { status: 400 });
  }

  const selectedTopicIds: string[] = topicIds;
  const feedSort: FeedSort = sort;
  const feedOrder: FeedOrder = order;
  const sourceFilter = sourceFilters.length > 0 ? sourceFilters : null;

  let cursor: FeedCursor | null = null;
  if (cursorRaw) {
    cursor = decodeFeedCursor(cursorRaw);
    if (!cursor || cursor.sort !== feedSort || cursor.order !== feedOrder) {
      return Response.json({ error: "invalid_cursor" }, { status: 400 });
    }
  }

  // Kept separate (not flattened) — inherited/ancestor keywords must never
  // count as a primary match on their own, only as a weak boost once a
  // topic's own keyword has already matched. See scoreKeywordMatch.
  let topicKeywords: string[] | null = null;
  let topicInheritedKeywords: string[] | null = null;
  if (selectedTopicIds.length > 0) {
    const topicRows = await getDb()
      .select()
      .from(topics)
      .where(
        and(
          eq(topics.userId, authResult.userId),
          inArray(topics.id, selectedTopicIds),
        ),
      );
    if (topicRows.length !== selectedTopicIds.length) {
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

  const conditions: SQL[] = [
    eq(userArticleScores.userId, authResult.userId),
    statusFilter !== null
      ? eq(userArticleScores.status, statusFilter)
      : ne(userArticleScores.status, "dismissed"),
  ];
  const listRecency = feedRecencyCondition();
  if (listRecency) conditions.push(listRecency);

  if (searchQuery !== null) {
    conditions.push(...feedSearchConditions(searchQuery));
  }

  // Source allow-list in SQL so sparse types (e.g. Bluesky) are not lost when
  // they sit below the previous top-N over-fetch window.
  if (sourceFilter !== null) {
    conditions.push(articleHasSourceTypes(authResult.userId, sourceFilter));
  }

  // Topic filter still needs an app-layer pass (matchedTopicIds + legacy keyword).
  const needsTopicAppFilter = selectedTopicIds.length > 0;

  const scoreSelect = {
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
  };

  const [pipeline, counts] = await Promise.all([
    loadPipelineTimes(authResult.userId),
    loadFeedCounts({
      userId: authResult.userId,
      statusFilter,
      topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : null,
      topicKeywords,
      topicInheritedKeywords,
      sourceFilter,
      searchQuery,
    }),
  ]);

  type FeedScoreRow = {
    articleId: string;
    title: string;
    summary: string | null;
    canonicalUrl: string;
    author: string | null;
    publishedAt: Date | null;
    showTitle: string | null;
    durationSeconds: number | null;
    enclosureUrl: string | null;
    keywordScore: number;
    aiScore: number | null;
    finalRank: number;
    reason: string | null;
    nearDuplicateOfArticleId: string | null;
    status: string;
    scoredAt: Date;
    matchedTopicIds: string[] | null;
  };

  async function fetchScoreBatch(
    batchCursor: FeedCursor | null,
    batchLimit: number,
  ): Promise<FeedScoreRow[]> {
    const where = and(
      ...conditions,
      ...(batchCursor ? [feedCursorCondition(batchCursor)] : []),
    )!;
    return getDb()
      .select(scoreSelect)
      .from(userArticleScores)
      .innerJoin(articles, eq(articles.id, userArticleScores.articleId))
      .where(where)
      .orderBy(...feedOrderBy(feedSort, feedOrder))
      .limit(batchLimit);
  }

  function passesTopicAppFilter(row: FeedScoreRow): boolean {
    if (selectedTopicIds.length === 0) return true;
    const verdict = matchesTopicIds(row.matchedTopicIds, selectedTopicIds);
    if (verdict === "no-match") return false;
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
      return false;
    }
    return true;
  }

  const filtered: FeedScoreRow[] = [];
  if (!needsTopicAppFilter) {
    const scoreRows = await fetchScoreBatch(cursor, limit + 1);
    filtered.push(...scoreRows);
  } else {
    // Walk ranked rows in batches until we fill a page — a single over-fetch
    // misses matches that sit below the window (same bug source filters had).
    let batchCursor = cursor;
    let scanned = 0;
    while (filtered.length < limit + 1 && scanned < APP_FILTER_MAX_SCAN) {
      const scoreRows = await fetchScoreBatch(batchCursor, APP_FILTER_BATCH);
      if (scoreRows.length === 0) break;
      scanned += scoreRows.length;
      const last = scoreRows[scoreRows.length - 1]!;
      batchCursor = feedCursorFromRow(last, feedSort, feedOrder);
      for (const row of scoreRows) {
        if (!passesTopicAppFilter(row)) continue;
        filtered.push(row);
        if (filtered.length >= limit + 1) break;
      }
      if (scoreRows.length < APP_FILTER_BATCH) break;
    }
  }

  if (filtered.length === 0) {
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

  const page = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const articleIds = page.map((r) => r.articleId);

  const sourceRows = await getDb()
    .select({
      articleId: articleSources.articleId,
      sourceType: articleSources.sourceType,
      externalId: articleSources.externalId,
      subscriptionUserId: sourceSubscriptions.userId,
      config: sourceSubscriptions.config,
    })
    .from(articleSources)
    .leftJoin(
      sourceSubscriptions,
      eq(sourceSubscriptions.id, articleSources.sourceSubscriptionId),
    )
    .where(inArray(articleSources.articleId, articleIds));

  const sourcesByArticle = new Map<string, FeedSourceJson[]>();

  for (const row of sourceRows) {
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
      label: feedSourceSubscriptionLabel(row.sourceType, row.config),
    });
    sourcesByArticle.set(row.articleId, list);
  }

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeFeedCursor(feedCursorFromRow(last, feedSort, feedOrder))
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
