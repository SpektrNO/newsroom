import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  combineFinalRank,
  extractKeywordReason,
  OllamaProvider,
  rankArticleBatch,
  resolveModelForTier,
  scoreKeywordMatch,
  withInheritedCatalogKeywords,
  type AiProvider,
} from "@newsroom/ai";
import {
  type Database,
  articleSources,
  articles,
  canSpendAiTokens,
  clearUserDirty,
  feedMaxAgeCutoff,
  getUserRankModelTier,
  jobs,
  listDirtyRankUserIds,
  pruneUserArticleScores,
  recordAiTokenUsage,
  recordRankAiArticles,
  remainingRankAiBudget,
  sourceSubscriptions,
  topics,
  upsertArticleEvaluation,
  userArticleEvaluations,
  userArticleScores,
} from "@newsroom/db";
import { completeJob } from "./jobs.js";

export const CANDIDATE_CAP_PER_USER = 200;
const DEFAULT_BATCH_SIZE = 30;

export type RankResult = {
  users: number;
  scored: number;
  evaluated: number;
  /** Articles that received an AI score this run. */
  aiScored: number;
  /** Shortlist hits left keyword-only (AI day/run/token budget). */
  aiSkipped: number;
  aiBatches: number;
  aiBatchFailures: number;
  errors: string[];
};

export function resolveRankBatchSize(
  raw = process.env.RANK_BATCH_SIZE,
): number {
  const n = raw === undefined || raw === "" ? DEFAULT_BATCH_SIZE : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_BATCH_SIZE;
  return Math.min(50, Math.max(20, Math.floor(n)));
}

function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i++) {
    if (
      typeof cur === "object" &&
      cur !== null &&
      "code" in cur &&
      (cur as { code: unknown }).code === "23505"
    ) {
      return true;
    }
    cur =
      typeof cur === "object" && cur !== null && "cause" in cur
        ? (cur as { cause: unknown }).cause
        : null;
  }
  return false;
}

/**
 * Ensure one pending/running rank job for this user (per-user single-flight).
 * Requires `userId` — global rank jobs are not created.
 */
export async function ensureNextRankJob(
  db: Database,
  options: { userId: string; delayMs?: number },
): Promise<void> {
  const userId = options.userId.trim();
  if (!userId) {
    throw new Error("ensureNextRankJob requires userId");
  }

  const open = await db.execute<{ id: string }>(sql`
    SELECT id FROM jobs
    WHERE type = 'rank'
      AND status IN ('pending', 'running')
      AND payload->>'userId' = ${userId}
    LIMIT 1
  `);
  const openRows = open as unknown as Array<{ id: string }>;
  if (openRows[0]?.id) return;

  try {
    await db.insert(jobs).values({
      id: crypto.randomUUID(),
      type: "rank",
      status: "pending",
      payload: { userId },
      scheduledAt: new Date(Date.now() + (options.delayMs ?? 0)),
      attempts: 0,
      createdAt: new Date(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return;
    throw err;
  }
}

/**
 * Enqueue one rank job per dirty∩active user with enabled topics
 * (`allDirty` skips the activity gate).
 */
export async function enqueueRankJobsForEligibleUsers(
  db: Database,
  options: { allDirty?: boolean; delayMs?: number } = {},
): Promise<number> {
  const userIds = await loadEligibleUsers(db, { allDirty: options.allDirty });
  for (const id of userIds) {
    await ensureNextRankJob(db, {
      userId: id,
      delayMs: options.delayMs ?? 0,
    });
  }
  return userIds.length;
}

/** Enqueue due-now rank job(s): one user, or all eligible users. */
export async function enqueueRankNow(
  db: Database,
  options: { userId?: string; allDirty?: boolean } = {},
): Promise<void> {
  if (options.userId) {
    await ensureNextRankJob(db, { userId: options.userId, delayMs: 0 });
    return;
  }
  await enqueueRankJobsForEligibleUsers(db, {
    allDirty: options.allDirty,
    delayMs: 0,
  });
}

export async function claimNextRankJob(
  db: Database,
): Promise<{ id: string } | null> {
  const result = await db.execute<{ id: string }>(sql`
    UPDATE jobs
    SET
      status = 'running',
      started_at = NOW(),
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending'
        AND type = 'rank'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);

  const rows = result as unknown as Array<{ id: string }>;
  const first = rows[0];
  return first?.id ? { id: String(first.id) } : null;
}

/**
 * Claim next due job among ingest and rank (earliest scheduled_at).
 */
export async function claimNextWorkerJob(
  db: Database,
): Promise<{ id: string; type: "ingest" | "rank" } | null> {
  const result = await db.execute<{ id: string; type: string }>(sql`
    UPDATE jobs
    SET
      status = 'running',
      started_at = NOW(),
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending'
        AND type IN ('ingest', 'rank')
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, type
  `);

  const rows = result as unknown as Array<{ id: string; type: string }>;
  const first = rows[0];
  if (!first?.id) return null;
  const type = first.type === "rank" ? "rank" : "ingest";
  return { id: String(first.id), type };
}

async function loadEligibleUsers(
  db: Database,
  options: { userId?: string; allDirty?: boolean } = {},
): Promise<string[]> {
  if (options.userId) {
    const userTopics = await loadUserTopics(db, options.userId);
    return userTopics.length > 0 ? [options.userId] : [];
  }

  const dirtyIds = await listDirtyRankUserIds(db, {
    allDirty: options.allDirty === true,
  });
  if (dirtyIds.length === 0) return [];

  const rows = await db
    .selectDistinct({ userId: topics.userId })
    .from(topics)
    .where(
      and(eq(topics.enabled, true), inArray(topics.userId, dirtyIds)),
    );

  return rows.map((r) => r.userId);
}

async function loadUserTopics(db: Database, userId: string) {
  return db
    .select()
    .from(topics)
    .where(and(eq(topics.userId, userId), eq(topics.enabled, true)));
}

async function loadCandidateArticles(db: Database, userId: string) {
  const subIds = await db
    .select({ id: sourceSubscriptions.id })
    .from(sourceSubscriptions)
    .where(
      and(
        eq(sourceSubscriptions.userId, userId),
        eq(sourceSubscriptions.enabled, true),
      ),
    );

  if (subIds.length === 0) return [];

  const ids = subIds.map((s) => s.id);

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      showTitle: articles.showTitle,
      updatedAt: articles.updatedAt,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      scoreId: userArticleScores.id,
      aiScore: userArticleScores.aiScore,
      scoredAt: userArticleScores.scoredAt,
      status: userArticleScores.status,
      keywordScore: userArticleScores.keywordScore,
      reason: userArticleScores.reason,
      matchedTopicIds: userArticleScores.matchedTopicIds,
      evaluationId: userArticleEvaluations.id,
      evaluationHit: userArticleEvaluations.hit,
      evaluatedAt: userArticleEvaluations.evaluatedAt,
    })
    .from(articles)
    .innerJoin(articleSources, eq(articleSources.articleId, articles.id))
    .leftJoin(
      userArticleScores,
      and(
        eq(userArticleScores.articleId, articles.id),
        eq(userArticleScores.userId, userId),
      ),
    )
    .leftJoin(
      userArticleEvaluations,
      and(
        eq(userArticleEvaluations.articleId, articles.id),
        eq(userArticleEvaluations.userId, userId),
      ),
    )
    .where(
      and(
        inArray(articleSources.sourceSubscriptionId, ids),
        // Skip stale corpus (old podcasts, etc.) — same window as the feed.
        sql`coalesce(${articles.publishedAt}, ${articles.createdAt}) >= ${feedMaxAgeCutoff().toISOString()}::timestamptz`,
      ),
    )
    .orderBy(
      // Never-evaluated first, then stale vs article content — so we walk the
      // corpus instead of thrashing needs-AI hits on the newest slice.
      sql`(${userArticleEvaluations.id} IS NULL) DESC`,
      sql`(${userArticleEvaluations.evaluatedAt} < ${articles.updatedAt}) DESC`,
      desc(sql`coalesce(${articles.publishedAt}, ${articles.createdAt})`),
    )
    .limit(CANDIDATE_CAP_PER_USER * 5);

  // Dedupe articles (multiple source links) and filter need-eval / need-AI.
  const seen = new Set<string>();
  const out: typeof rows = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);

    const evalFresh =
      row.evaluationId != null &&
      row.evaluatedAt != null &&
      row.evaluatedAt >= row.updatedAt;
    const scoreFresh =
      row.scoreId != null &&
      row.scoredAt != null &&
      row.scoredAt >= row.updatedAt;

    // Fresh keyword miss → skip (already considered).
    if (evalFresh && row.evaluationHit === false) continue;

    // Fully scored hit with AI → skip.
    if (evalFresh && row.evaluationHit === true && scoreFresh && row.aiScore !== null) {
      continue;
    }

    // Need keyword eval, or need to finish AI on a hit.
    const needsKeywordEval = !evalFresh;
    const needsAiFinish =
      evalFresh &&
      row.evaluationHit === true &&
      (!row.scoreId || row.aiScore === null || !scoreFresh);

    if (!needsKeywordEval && !needsAiFinish) continue;

    out.push(row);
    if (out.length >= CANDIDATE_CAP_PER_USER) break;
  }
  return out;
}

async function upsertKeywordScore(
  db: Database,
  args: {
    userId: string;
    articleId: string;
    keywordScore: number;
    reason: string | null;
    matchedTopicIds: string[];
    existingStatus: string | null;
    existingId: string | null;
  },
): Promise<void> {
  const now = new Date();
  const finalRank = combineFinalRank(args.keywordScore, null);

  if (args.existingId) {
    await db
      .update(userArticleScores)
      .set({
        keywordScore: args.keywordScore,
        finalRank,
        reason: args.reason,
        matchedTopicIds: args.matchedTopicIds,
        aiScore: null,
        scoredAt: now,
        updatedAt: now,
        // do not reset status
      })
      .where(eq(userArticleScores.id, args.existingId));
    return;
  }

  await db
    .insert(userArticleScores)
    .values({
      id: crypto.randomUUID(),
      userId: args.userId,
      articleId: args.articleId,
      keywordScore: args.keywordScore,
      aiScore: null,
      finalRank,
      reason: args.reason,
      matchedTopicIds: args.matchedTopicIds,
      nearDuplicateOfArticleId: null,
      status: "new",
      scoredAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userArticleScores.userId, userArticleScores.articleId],
      set: {
        keywordScore: args.keywordScore,
        finalRank,
        reason: args.reason,
        matchedTopicIds: args.matchedTopicIds,
        aiScore: null,
        scoredAt: now,
        updatedAt: now,
      },
    });
}

async function applyAiScores(
  db: Database,
  userId: string,
  batch: Array<{
    articleId: string;
    keywordScore: number;
  }>,
  ranked: Array<{
    articleId: string;
    aiScore: number;
    reason: string;
    nearDuplicateOfArticleId?: string | null;
    confirmedTopicIds: string[];
  }>,
): Promise<number> {
  const byId = new Map(ranked.map((r) => [r.articleId, r]));
  const known = new Set(batch.map((b) => b.articleId));
  let updated = 0;
  const now = new Date();

  for (const item of batch) {
    const ai = byId.get(item.articleId);
    if (!ai) continue;

    let nearDup = ai.nearDuplicateOfArticleId ?? null;
    if (nearDup && !known.has(nearDup)) {
      // Only accept peers from this batch; ignore invalid ids.
      nearDup = null;
    }

    const finalRank = combineFinalRank(item.keywordScore, ai.aiScore);

    try {
      await db
        .update(userArticleScores)
        .set({
          aiScore: ai.aiScore,
          reason: ai.reason,
          nearDuplicateOfArticleId: nearDup,
          matchedTopicIds: ai.confirmedTopicIds,
          finalRank,
          scoredAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(userArticleScores.userId, userId),
            eq(userArticleScores.articleId, item.articleId),
          ),
        );
      updated += 1;
    } catch {
      // FK / parse edge: clear near-dup and retry once without it.
      await db
        .update(userArticleScores)
        .set({
          aiScore: ai.aiScore,
          reason: ai.reason,
          nearDuplicateOfArticleId: null,
          matchedTopicIds: ai.confirmedTopicIds,
          finalRank,
          scoredAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(userArticleScores.userId, userId),
            eq(userArticleScores.articleId, item.articleId),
          ),
        );
      updated += 1;
    }
  }
  return updated;
}

export async function runRank(
  db: Database,
  options: {
    userId?: string;
    allDirty?: boolean;
    provider?: AiProvider;
    batchSize?: number;
  } = {},
): Promise<RankResult> {
  const batchSize = options.batchSize ?? resolveRankBatchSize();
  console.log(
    `[newsroom-worker] rank pass starting batch=${batchSize} (OLLAMA_TIMEOUT_MS default 300000 if unset)`,
  );
  const result: RankResult = {
    users: 0,
    scored: 0,
    evaluated: 0,
    aiScored: 0,
    aiSkipped: 0,
    aiBatches: 0,
    aiBatchFailures: 0,
    errors: [],
  };

  const userIds = await loadEligibleUsers(db, {
    userId: options.userId,
    allDirty: options.allDirty,
  });
  result.users = userIds.length;

  let anyBatchOk = false;

  for (const userId of userIds) {
    try {
      const userTopics = await loadUserTopics(db, userId);
      if (userTopics.length === 0) continue;

      const keywordTopics = userTopics.map((t) =>
        withInheritedCatalogKeywords({
          id: t.id,
          name: t.name,
          keywords: t.keywords ?? [],
          weight: t.weight,
        }),
      );

      const candidates = await loadCandidateArticles(db, userId);
      const shortlist: Array<{
        articleId: string;
        title: string;
        summary: string | null;
        showTitle: string | null;
        keywordScore: number;
        matchedTopicIds: string[];
        keywordReason: string | null;
      }> = [];

      for (const cand of candidates) {
        const evalFresh =
          cand.evaluationId != null &&
          cand.evaluatedAt != null &&
          cand.evaluatedAt >= cand.updatedAt;

        // Already keyword-checked hit awaiting AI — don't re-count as scored.
        if (evalFresh && cand.evaluationHit === true) {
          shortlist.push({
            articleId: cand.id,
            title: cand.title,
            summary: cand.summary,
            showTitle: cand.showTitle,
            keywordScore: cand.keywordScore ?? 0,
            matchedTopicIds: cand.matchedTopicIds ?? [],
            keywordReason: extractKeywordReason(cand.reason),
          });
          continue;
        }

        const match = scoreKeywordMatch(
          cand.title,
          cand.summary,
          keywordTopics,
          cand.showTitle,
        );
        result.evaluated += 1;
        await upsertArticleEvaluation(db, {
          userId,
          articleId: cand.id,
          hit: match.hit,
        });
        if (!match.hit) continue;

        await upsertKeywordScore(db, {
          userId,
          articleId: cand.id,
          keywordScore: match.keywordScore,
          reason: match.reason,
          matchedTopicIds: match.matchedTopicIds,
          existingStatus: cand.status,
          existingId: cand.scoreId,
        });
        result.scored += 1;
        shortlist.push({
          articleId: cand.id,
          title: cand.title,
          summary: cand.summary,
          showTitle: cand.showTitle,
          keywordScore: match.keywordScore,
          matchedTopicIds: match.matchedTopicIds,
          keywordReason: match.reason,
        });
      }

      // "none" tier forces keyword-only ranking: skip AI entirely, no budget spent.
      const tier = await getUserRankModelTier(db, userId);
      const provider: AiProvider | null =
        tier === "none"
          ? null
          : options.provider ??
            new OllamaProvider({
              model: resolveModelForTier(tier === "standard" ? "standard" : "fast"),
            });

      // AI pass: cap by run/day/global article budget, then token hard cap.
      const remainingBudget =
        provider != null ? (await remainingRankAiBudget(db, userId)).remaining : 0;
      const needingAi = shortlist.slice(0, Math.max(0, remainingBudget));
      const deferredByArticleCap = shortlist.length - needingAi.length;
      if (deferredByArticleCap > 0) {
        result.aiSkipped += deferredByArticleCap;
        result.errors.push(
          tier === "none"
            ? `${userId}:rank_model_tier_none:${deferredByArticleCap}`
            : `${userId}:rank_ai_budget_keyword_only:${deferredByArticleCap}`,
        );
        console.warn(
          tier === "none"
            ? `[newsroom-worker] rank model tier "none" for ${userId}: ${shortlist.length} article(s) stay keyword-only`
            : `[newsroom-worker] rank AI article budget for ${userId}: scoring ${needingAi.length}/${shortlist.length} (remaining=${remainingBudget})`,
        );
      }

      let aiArticlesThisUser = 0;
      let aiQueued = 0;

      for (let i = 0; i < needingAi.length; i += batchSize) {
        const allowed = await canSpendAiTokens(db, userId);
        if (!allowed) {
          result.aiSkipped += needingAi.length - aiQueued;
          result.errors.push(`${userId}:token_budget_exceeded_skip_ai`);
          console.warn(
            `[newsroom-worker] token budget exceeded for ${userId}; keyword-only for remaining batches`,
          );
          break;
        }

        const chunk = needingAi.slice(i, i + batchSize);
        aiQueued += chunk.length;
        result.aiBatches += 1;
        try {
          // needingAi is only non-empty when provider != null (see remainingBudget above).
          const ranked = await rankArticleBatch(provider as AiProvider, {
            topics: keywordTopics.map((t) => ({
              id: t.id,
              name: t.name ?? "",
              keywords: t.keywords,
              weight: t.weight,
            })),
            articles: chunk.map((c) => ({
              articleId: c.articleId,
              title: c.title,
              summary: c.summary,
              showTitle: c.showTitle,
              candidateTopicIds: c.matchedTopicIds,
              keywordReason: c.keywordReason,
            })),
          });
          if (ranked.usage) {
            await recordAiTokenUsage(db, {
              userId,
              purpose: "rank",
              usage: ranked.usage,
            });
          }
          if (ranked.items.length === 0 && chunk.length > 0) {
            result.aiBatchFailures += 1;
            result.aiSkipped += chunk.length;
            result.errors.push(`${userId}:empty_or_unparseable_ai_batch`);
          } else {
            anyBatchOk = true;
            await applyAiScores(
              db,
              userId,
              chunk.map((c) => ({
                articleId: c.articleId,
                keywordScore: c.keywordScore,
              })),
              ranked.items,
            );
            aiArticlesThisUser += ranked.items.length;
            const missed = chunk.length - ranked.items.length;
            if (missed > 0) result.aiSkipped += missed;
          }
        } catch (err) {
          result.aiBatchFailures += 1;
          result.aiSkipped += chunk.length;
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`${userId}:ai:${message}`);
          console.error(
            `[newsroom-worker] rank AI batch failed for user ${userId}:`,
            message,
          );
        }
      }

      if (aiArticlesThisUser > 0) {
        result.aiScored += aiArticlesThisUser;
        await recordRankAiArticles(db, {
          userId,
          count: aiArticlesThisUser,
        });
      }

      await clearUserDirty(db, userId);
      try {
        const pruned = await pruneUserArticleScores(db, { userId });
        if (pruned.deleted > 0) {
          console.log(
            `[newsroom-worker] pruned ${pruned.deleted} score row(s) for ${userId}`,
          );
        }
      } catch (pruneErr) {
        const message =
          pruneErr instanceof Error ? pruneErr.message : String(pruneErr);
        result.errors.push(`${userId}:prune:${message}`);
        console.error(
          `[newsroom-worker] score prune failed for ${userId}:`,
          message,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${userId}:${message}`);
      console.error(
        `[newsroom-worker] rank failed for user ${userId}:`,
        message,
      );
    }
  }

  if (
    result.aiBatches > 0 &&
    result.aiBatchFailures === result.aiBatches &&
    !anyBatchOk
  ) {
    // All AI batches failed (e.g. Ollama unreachable).
    result.errors.push("ollama_unreachable_all_batches");
  }

  return result;
}

export async function processRankJob(
  db: Database,
  jobId: string,
  options: {
    provider?: AiProvider;
    batchSize?: number;
    allDirty?: boolean;
  } = {},
): Promise<RankResult> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const payload = (job?.payload ?? {}) as { userId?: string };
  const userId =
    typeof payload.userId === "string" ? payload.userId.trim() : "";

  if (!userId) {
    const empty: RankResult = {
      users: 0,
      scored: 0,
      evaluated: 0,
      aiScored: 0,
      aiSkipped: 0,
      aiBatches: 0,
      aiBatchFailures: 0,
      errors: ["missing_userId"],
    };
    await completeJob(db, jobId, {
      status: "failed",
      lastError: "missing_userId",
    });
    return empty;
  }

  const result = await runRank(db, {
    userId,
    allDirty: options.allDirty,
    provider: options.provider,
    batchSize: options.batchSize,
  });

  const allAiFailed =
    result.aiBatches > 0 && result.aiBatchFailures === result.aiBatches;

  await completeJob(db, jobId, {
    status: allAiFailed ? "failed" : "completed",
    lastError: result.errors.length > 0 ? result.errors.join("; ") : null,
  });

  return result;
}
