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
  not,
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
  parseFeedExcludeTopicIds,
  parseFeedLimit,
  parseFeedOrder,
  parseFeedSearchQuery,
  parseFeedSort,
  parseFeedSourceFilters,
  parseFeedSourceId,
  parseFeedStatusFilter,
  parseFeedTopicIds,
  passesTopicSelection,
  toFeedItemJson,
  parseFeedSearchTokens,
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

/** Article is linked to one of the allowed source categories for this user (or orphan). */
function articleHasSourceCategories(userId: string, categories: string[]): SQL {
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
          inArray(articleSources.category, categories),
          or(
            isNull(sourceSubscriptions.userId),
            eq(sourceSubscriptions.userId, userId),
          ),
        ),
      ),
  );
}

/** Article is linked to a specific subscription owned by this user. */
function articleHasSourceSubscription(userId: string, sourceId: string): SQL {
  return exists(
    getDb()
      .select({ id: articleSources.id })
      .from(articleSources)
      .innerJoin(
        sourceSubscriptions,
        eq(sourceSubscriptions.id, articleSources.sourceSubscriptionId),
      )
      .where(
        and(
          eq(articleSources.articleId, userArticleScores.articleId),
          eq(articleSources.sourceSubscriptionId, sourceId),
          eq(sourceSubscriptions.userId, userId),
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
  // Ranked time = last completed rank pass for this user (even if 0 new
  // score rows). Fall back to max(scored_at) for users with scores but no
  // completed rank jobs left in `jobs`.
  const [[ingestRow], [jobRankRow], [scoreRankRow]] = await Promise.all([
    db
      .select({ at: sql<Date | string | null>`max(${jobs.finishedAt})` })
      .from(jobs)
      .where(and(eq(jobs.type, "ingest"), eq(jobs.status, "completed"))),
    db
      .select({ at: sql<Date | string | null>`max(${jobs.finishedAt})` })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, "rank"),
          eq(jobs.status, "completed"),
          sql`(${jobs.payload}->>'userId') = ${userId}`,
        ),
      ),
    db
      .select({
        at: sql<Date | string | null>`max(${userArticleScores.scoredAt})`,
      })
      .from(userArticleScores)
      .where(eq(userArticleScores.userId, userId)),
  ]);

  return {
    lastIngestAt: toIsoOrNull(ingestRow?.at ?? null),
    lastRankedAt: toIsoOrNull(
      laterTimestamp(jobRankRow?.at ?? null, scoreRankRow?.at ?? null),
    ),
  };
}

/** Prefer the later of two DB timestamps; nulls ignored. */
function laterTimestamp(
  a: Date | string | null,
  b: Date | string | null,
): Date | string | null {
  const ta = a == null ? Number.NaN : new Date(a).getTime();
  const tb = b == null ? Number.NaN : new Date(b).getTime();
  if (Number.isNaN(ta) && Number.isNaN(tb)) return null;
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return ta >= tb ? a : b;
}

/**
 * Include tokens: AND of (token in title|summary|reason).
 * Exclude tokens (`-word`): AND of (token in none of those fields).
 */
function feedSearchConditions(searchQuery: string): SQL[] {
  const { include, exclude } = parseFeedSearchTokens(searchQuery);
  const conditions: SQL[] = [];

  for (const token of include) {
    const pattern = `%${escapeIlikePattern(token)}%`;
    conditions.push(
      or(
        ilike(articles.title, pattern),
        ilike(articles.summary, pattern),
        ilike(userArticleScores.reason, pattern),
      )!,
    );
  }

  for (const token of exclude) {
    const pattern = `%${escapeIlikePattern(token)}%`;
    // NULL fields do not contain the token (match client haystack coalesce).
    conditions.push(
      not(
        or(
          ilike(articles.title, pattern),
          and(isNotNull(articles.summary), ilike(articles.summary, pattern)),
          and(
            isNotNull(userArticleScores.reason),
            ilike(userArticleScores.reason, pattern),
          ),
        )!,
      ),
    );
  }

  return conditions;
}

async function loadFeedCounts(args: {
  userId: string;
  statusFilter: UserArticleScoreStatus | null;
  topicIds: string[] | null;
  excludeTopicIds: string[] | null;
  topicKeywords: string[] | null;
  topicInheritedKeywords: string[] | null;
  excludeTopicKeywords: string[] | null;
  excludeTopicInheritedKeywords: string[] | null;
  sourceFilter: string[] | null;
  sourceId: string | null;
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
      : inArray(userArticleScores.status, ["new", "seen"]);
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
      ? articleHasSourceCategories(args.userId, args.sourceFilter)
      : null;
  const sourceIdCond =
    args.sourceId !== null
      ? articleHasSourceSubscription(args.userId, args.sourceId)
      : null;
  const scoredWhere = and(
    baseWhere,
    ...(recency ? [recency] : []),
    ...searchConds,
    ...(sourceCond ? [sourceCond] : []),
    ...(sourceIdCond ? [sourceIdCond] : []),
  )!;

  const needsTopicScan =
    (args.topicIds !== null && args.topicIds.length > 0) ||
    (args.excludeTopicIds !== null && args.excludeTopicIds.length > 0);

  // Recency (+ search/source) are SQL; topic still needs an app scan.
  if (!needsTopicScan) {
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
    excludeTopicIds: args.excludeTopicIds,
    topicKeywords: args.topicKeywords,
    topicInheritedKeywords: args.topicInheritedKeywords,
    excludeTopicKeywords: args.excludeTopicKeywords,
    excludeTopicInheritedKeywords: args.excludeTopicInheritedKeywords,
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
  const excludeTopicIdsRaw = parseFeedExcludeTopicIds(url);
  const sourceFilters = parseFeedSourceFilters(url);
  const sourceIdRaw = parseFeedSourceId(url.searchParams.get("sourceId"));
  const statusFilter = parseFeedStatusFilter(url.searchParams.get("status"));
  const searchQuery = parseFeedSearchQuery(url.searchParams.get("q"));
  const sort = parseFeedSort(url.searchParams.get("sort"));
  const order = parseFeedOrder(url.searchParams.get("order"));

  if (
    topicIds === "invalid" ||
    excludeTopicIdsRaw === "invalid" ||
    sourceFilters === "invalid" ||
    sourceIdRaw === "invalid" ||
    statusFilter === "invalid" ||
    searchQuery === "invalid" ||
    sort === "invalid" ||
    order === "invalid"
  ) {
    return Response.json({ error: "invalid_filter" }, { status: 400 });
  }

  // Exclude wins on overlap (client should not send both for the same id).
  const excludeSet = new Set(excludeTopicIdsRaw);
  const selectedTopicIds = topicIds.filter((id) => !excludeSet.has(id));
  const excludedTopicIds = excludeTopicIdsRaw;
  const feedSort: FeedSort = sort;
  const feedOrder: FeedOrder = order;
  const sourceFilter = sourceFilters.length > 0 ? sourceFilters : null;
  let sourceId: string | null = sourceIdRaw;
  if (sourceId !== null) {
    const [owned] = await getDb()
      .select({ id: sourceSubscriptions.id })
      .from(sourceSubscriptions)
      .where(
        and(
          eq(sourceSubscriptions.id, sourceId),
          eq(sourceSubscriptions.userId, authResult.userId),
        ),
      )
      .limit(1);
    if (!owned) {
      return Response.json({ error: "invalid_filter" }, { status: 400 });
    }
  }

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
  async function loadTopicKeywordSets(ids: string[]): Promise<
    | { ok: true; keywords: string[]; inherited: string[] }
    | { ok: false }
  > {
    if (ids.length === 0) {
      return { ok: true, keywords: [], inherited: [] };
    }
    const topicRows = await getDb()
      .select()
      .from(topics)
      .where(
        and(eq(topics.userId, authResult.userId), inArray(topics.id, ids)),
      );
    if (topicRows.length !== ids.length) return { ok: false };
    const keywords: string[] = [];
    const inherited: string[] = [];
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
        inherited.push(kw.trim());
      }
    }
    return { ok: true, keywords, inherited };
  }

  const includeKw = await loadTopicKeywordSets(selectedTopicIds);
  if (!includeKw.ok) {
    return Response.json({ error: "invalid_filter" }, { status: 400 });
  }
  const excludeKw = await loadTopicKeywordSets(excludedTopicIds);
  if (!excludeKw.ok) {
    return Response.json({ error: "invalid_filter" }, { status: 400 });
  }
  const topicKeywords = includeKw.keywords;
  const topicInheritedKeywords = includeKw.inherited;
  const excludeTopicKeywords = excludeKw.keywords;
  const excludeTopicInheritedKeywords = excludeKw.inherited;

  const conditions: SQL[] = [
    eq(userArticleScores.userId, authResult.userId),
    statusFilter !== null
      ? eq(userArticleScores.status, statusFilter)
      : inArray(userArticleScores.status, ["new", "seen"]),
  ];
  const listRecency = feedRecencyCondition();
  if (listRecency) conditions.push(listRecency);

  if (searchQuery !== null) {
    conditions.push(...feedSearchConditions(searchQuery));
  }

  // Source allow-list in SQL so sparse types (e.g. Bluesky) are not lost when
  // they sit below the previous top-N over-fetch window.
  if (sourceFilter !== null) {
    conditions.push(articleHasSourceCategories(authResult.userId, sourceFilter));
  }
  if (sourceId !== null) {
    conditions.push(articleHasSourceSubscription(authResult.userId, sourceId));
  }

  // Topic filter still needs an app-layer pass (matchedTopicIds + legacy keyword).
  const needsTopicAppFilter =
    selectedTopicIds.length > 0 || excludedTopicIds.length > 0;

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
      excludeTopicIds: excludedTopicIds.length > 0 ? excludedTopicIds : null,
      topicKeywords,
      topicInheritedKeywords,
      excludeTopicKeywords,
      excludeTopicInheritedKeywords,
      sourceFilter,
      sourceId,
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
    return passesTopicSelection({
      matchedTopicIds: row.matchedTopicIds,
      title: row.title,
      summary: row.summary,
      showTitle: row.showTitle,
      includeIds: selectedTopicIds,
      excludeIds: excludedTopicIds,
      includeKeywords: topicKeywords,
      includeInheritedKeywords: topicInheritedKeywords,
      excludeKeywords: excludeTopicKeywords,
      excludeInheritedKeywords: excludeTopicInheritedKeywords,
    });
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
      category: articleSources.category,
      adapter: articleSources.adapter,
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
      category: row.category,
      adapter: row.adapter,
      externalId: row.externalId,
      label: feedSourceSubscriptionLabel(row.adapter, row.config),
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
