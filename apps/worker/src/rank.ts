import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  combineFinalRank,
  OllamaProvider,
  rankArticleBatch,
  scoreKeywordMatch,
  type AiProvider,
} from "@newsroom/ai";
import {
  type Database,
  articleSources,
  articles,
  jobs,
  sourceSubscriptions,
  topics,
  userArticleScores,
} from "@newsroom/db";
import { completeJob } from "./ingest.js";

export const CANDIDATE_CAP_PER_USER = 200;
const DEFAULT_BATCH_SIZE = 30;

export type RankResult = {
  users: number;
  scored: number;
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

/** Ensure a single pending/running rank exists (single-flight). */
export async function ensureNextRankJob(
  db: Database,
  options: { userId?: string; delayMs?: number } = {},
): Promise<void> {
  const open = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, "rank"),
        or(eq(jobs.status, "pending"), eq(jobs.status, "running")),
      ),
    )
    .limit(1);

  if (open.length > 0) return;

  const payload: Record<string, unknown> = {};
  if (options.userId) payload.userId = options.userId;

  await db.insert(jobs).values({
    id: crypto.randomUUID(),
    type: "rank",
    status: "pending",
    payload,
    scheduledAt: new Date(Date.now() + (options.delayMs ?? 0)),
    attempts: 0,
    createdAt: new Date(),
  });
}

/** Enqueue a rank job due immediately if none pending due now. */
export async function enqueueRankNow(
  db: Database,
  options: { userId?: string } = {},
): Promise<string> {
  const existing = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, "rank"),
        or(eq(jobs.status, "pending"), eq(jobs.status, "running")),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0].id;

  const id = crypto.randomUUID();
  const payload: Record<string, unknown> = {};
  if (options.userId) payload.userId = options.userId;

  await db.insert(jobs).values({
    id,
    type: "rank",
    status: "pending",
    payload,
    scheduledAt: new Date(),
    attempts: 0,
    createdAt: new Date(),
  });
  return id;
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
  onlyUserId?: string,
): Promise<string[]> {
  const conditions = [eq(topics.enabled, true)];
  if (onlyUserId) conditions.push(eq(topics.userId, onlyUserId));

  const rows = await db
    .selectDistinct({ userId: topics.userId })
    .from(topics)
    .where(and(...conditions));

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
      updatedAt: articles.updatedAt,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      scoreId: userArticleScores.id,
      aiScore: userArticleScores.aiScore,
      scoredAt: userArticleScores.scoredAt,
      status: userArticleScores.status,
      keywordScore: userArticleScores.keywordScore,
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
    .where(inArray(articleSources.sourceSubscriptionId, ids))
    .orderBy(
      desc(sql`coalesce(${articles.publishedAt}, ${articles.createdAt})`),
    )
    .limit(CANDIDATE_CAP_PER_USER * 3);

  // Dedupe articles (multiple source links) and filter need-score.
  const seen = new Set<string>();
  const out: typeof rows = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);

    const needsScore =
      !row.scoreId ||
      row.aiScore === null ||
      (row.scoredAt !== null && row.scoredAt < row.updatedAt);

    if (!needsScore) continue;
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
    provider?: AiProvider;
    batchSize?: number;
  } = {},
): Promise<RankResult> {
  const provider = options.provider ?? new OllamaProvider();
  const batchSize = options.batchSize ?? resolveRankBatchSize();
  if (!options.provider) {
    console.log(
      `[newsroom-worker] Ollama model=${process.env.OLLAMA_MODEL ?? "llama3.2"} batch=${batchSize} (OLLAMA_TIMEOUT_MS default 300000 if unset)`,
    );
  }
  const result: RankResult = {
    users: 0,
    scored: 0,
    aiBatches: 0,
    aiBatchFailures: 0,
    errors: [],
  };

  const userIds = await loadEligibleUsers(db, options.userId);
  result.users = userIds.length;

  let anyBatchOk = false;

  for (const userId of userIds) {
    try {
      const userTopics = await loadUserTopics(db, userId);
      if (userTopics.length === 0) continue;

      const keywordTopics = userTopics.map((t) => ({
        id: t.id,
        name: t.name,
        keywords: t.keywords ?? [],
        weight: t.weight,
      }));

      const candidates = await loadCandidateArticles(db, userId);
      const shortlist: Array<{
        articleId: string;
        title: string;
        summary: string | null;
        keywordScore: number;
      }> = [];

      for (const cand of candidates) {
        const match = scoreKeywordMatch(
          cand.title,
          cand.summary,
          keywordTopics,
        );
        if (!match.hit) continue;

        await upsertKeywordScore(db, {
          userId,
          articleId: cand.id,
          keywordScore: match.keywordScore,
          reason: match.reason,
          existingStatus: cand.status,
          existingId: cand.scoreId,
        });
        result.scored += 1;
        shortlist.push({
          articleId: cand.id,
          title: cand.title,
          summary: cand.summary,
          keywordScore: match.keywordScore,
        });
      }

      // AI pass: items needing ai_score (just shortlisted or previously keyword-only).
      const needingAi = shortlist;

      for (let i = 0; i < needingAi.length; i += batchSize) {
        const chunk = needingAi.slice(i, i + batchSize);
        result.aiBatches += 1;
        try {
          const ranked = await rankArticleBatch(provider, {
            topics: keywordTopics.map((t) => ({
              name: t.name ?? "",
              keywords: t.keywords,
              weight: t.weight,
            })),
            articles: chunk.map((c) => ({
              articleId: c.articleId,
              title: c.title,
              summary: c.summary,
            })),
          });
          if (ranked.length === 0 && chunk.length > 0) {
            result.aiBatchFailures += 1;
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
              ranked,
            );
          }
        } catch (err) {
          result.aiBatchFailures += 1;
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`${userId}:ai:${message}`);
          console.error(
            `[newsroom-worker] rank AI batch failed for user ${userId}:`,
            message,
          );
        }
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
  options: { provider?: AiProvider; batchSize?: number } = {},
): Promise<RankResult> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  const payload = (job?.payload ?? {}) as { userId?: string };
  const result = await runRank(db, {
    userId: typeof payload.userId === "string" ? payload.userId : undefined,
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
