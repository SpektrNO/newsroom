import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { userArticleScores } from "./schema/ranking.js";
import { pruneUserArticleEvaluations } from "./article-evaluations.js";
import {
  getUserScoreKeepSettings,
  type ScoreKeepPolicy,
} from "./score-keep-settings.js";

const DEFAULT_TTL_DAYS = 30;
const DEFAULT_KEEP_TOP_N = 500;
const DEFAULT_ARTICLE_TTL_DAYS = 90;

export type RankScoreRetentionConfig = {
  /** Delete new/seen/dismissed older than this many days. `0` = no age prune. */
  ttlDays: number;
  /** Keep at most this many new/seen per user. `0` = no keep-N prune. */
  keepTopN: number;
  /**
   * Keep-N overflow policy. Default `rank` (lowest final_rank first).
   * `age` keeps newest by scored_at.
   */
  policy?: ScoreKeepPolicy;
};

export type ArticleRetentionConfig = {
  /** Delete ingested articles older than this many days. `0` = disabled. */
  ttlDays: number;
};

export type PruneScoresResult = {
  deleted: number;
  users: number;
  evaluationsDeleted?: number;
};

export type PruneArticlesResult = {
  deleted: number;
};

function parseNonNegInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function resolveRankScoreRetention(
  env: NodeJS.ProcessEnv = process.env,
): RankScoreRetentionConfig {
  return {
    ttlDays: parseNonNegInt(env.RANK_SCORE_TTL_DAYS, DEFAULT_TTL_DAYS),
    keepTopN: parseNonNegInt(env.RANK_SCORE_KEEP_TOP_N, DEFAULT_KEEP_TOP_N),
    policy: "rank",
  };
}

export function resolveArticleRetention(
  env: NodeJS.ProcessEnv = process.env,
): ArticleRetentionConfig {
  return {
    ttlDays: parseNonNegInt(env.ARTICLE_TTL_DAYS, DEFAULT_ARTICLE_TTL_DAYS),
  };
}

async function resolvePruneConfig(
  db: Database,
  options: {
    userId?: string;
    config?: RankScoreRetentionConfig;
  },
): Promise<RankScoreRetentionConfig> {
  if (options.config) {
    return {
      ttlDays: options.config.ttlDays,
      keepTopN: options.config.keepTopN,
      policy: options.config.policy ?? "rank",
    };
  }
  const env = resolveRankScoreRetention();
  if (!options.userId) {
    return env;
  }
  const userKeep = await getUserScoreKeepSettings(db, options.userId);
  return {
    ttlDays: env.ttlDays,
    keepTopN: userKeep.keepTopN,
    policy: userKeep.policy,
  };
}

/**
 * Prune `user_article_scores` for one user or all users.
 * - Always keep `saved`.
 * - Delete `dismissed` older than TTL (when ttlDays > 0).
 * - Delete `new`/`seen` that are older than TTL **or** outside keep-N
 *   (by final_rank or scored_at per policy).
 * - Also prune stale evaluation markers with the same TTL.
 *
 * When `userId` is omitted and `config` is omitted, keep-N uses each user's
 * Settings (`score_keep_top_n` / `score_keep_policy`); TTL stays env-wide.
 */
export async function pruneUserArticleScores(
  db: Database,
  options: {
    userId?: string;
    config?: RankScoreRetentionConfig;
  } = {},
): Promise<PruneScoresResult> {
  const usePerUserKeep =
    options.userId == null && options.config == null;

  const config = await resolvePruneConfig(db, options);
  if (!usePerUserKeep && config.ttlDays <= 0 && config.keepTopN <= 0) {
    return { deleted: 0, users: 0, evaluationsDeleted: 0 };
  }

  const userFilter = options.userId
    ? sql`AND user_id = ${options.userId}`
    : sql``;

  let deleted = 0;

  if (config.ttlDays > 0) {
    const cutoff = new Date(
      Date.now() - config.ttlDays * 24 * 60 * 60 * 1000,
    );
    const dismissedWhere = options.userId
      ? and(
          eq(userArticleScores.userId, options.userId),
          eq(userArticleScores.status, "dismissed"),
          lt(userArticleScores.scoredAt, cutoff),
        )
      : and(
          eq(userArticleScores.status, "dismissed"),
          lt(userArticleScores.scoredAt, cutoff),
        );
    const dismissed = await db
      .delete(userArticleScores)
      .where(dismissedWhere!)
      .returning({ id: userArticleScores.id });
    deleted += dismissed.length;
  }

  const shouldKeepN =
    usePerUserKeep || config.keepTopN > 0 || config.ttlDays > 0;
  if (shouldKeepN) {
    if (usePerUserKeep) {
      const result = await db.execute<{ id: string }>(sql`
        WITH ranked AS (
          SELECT
            s.id,
            s.scored_at,
            u.score_keep_top_n AS keep_n,
            row_number() OVER (
              PARTITION BY s.user_id
              ORDER BY
                CASE
                  WHEN u.score_keep_policy = 'age' THEN EXTRACT(EPOCH FROM s.scored_at)
                  ELSE s.final_rank
                END DESC,
                s.article_id DESC
            ) AS rn
          FROM user_article_scores AS s
          INNER JOIN "user" AS u ON u.id = s.user_id
          WHERE s.status IN ('new', 'seen')
        ),
        doomed AS (
          SELECT id FROM ranked
          WHERE
            (
              ${config.ttlDays} > 0
              AND scored_at < NOW() - (${config.ttlDays}::bigint * INTERVAL '1 day')
            )
            OR (
              keep_n > 0
              AND rn > keep_n
            )
        )
        DELETE FROM user_article_scores AS u
        USING doomed AS d
        WHERE u.id = d.id
        RETURNING u.id
      `);
      const rows = result as unknown as Array<{ id: string }>;
      deleted += rows.length;
    } else {
      const policy = config.policy ?? "rank";
      const result =
        policy === "age"
          ? await db.execute<{ id: string }>(sql`
        WITH ranked AS (
          SELECT
            id,
            scored_at,
            row_number() OVER (
              PARTITION BY user_id
              ORDER BY scored_at DESC, article_id DESC
            ) AS rn
          FROM user_article_scores
          WHERE status IN ('new', 'seen')
          ${userFilter}
        ),
        doomed AS (
          SELECT id FROM ranked
          WHERE
            (
              ${config.ttlDays} > 0
              AND scored_at < NOW() - (${config.ttlDays}::bigint * INTERVAL '1 day')
            )
            OR (
              ${config.keepTopN} > 0
              AND rn > ${config.keepTopN}
            )
        )
        DELETE FROM user_article_scores AS u
        USING doomed AS d
        WHERE u.id = d.id
        RETURNING u.id
      `)
          : await db.execute<{ id: string }>(sql`
        WITH ranked AS (
          SELECT
            id,
            scored_at,
            row_number() OVER (
              PARTITION BY user_id
              ORDER BY final_rank DESC, article_id DESC
            ) AS rn
          FROM user_article_scores
          WHERE status IN ('new', 'seen')
          ${userFilter}
        ),
        doomed AS (
          SELECT id FROM ranked
          WHERE
            (
              ${config.ttlDays} > 0
              AND scored_at < NOW() - (${config.ttlDays}::bigint * INTERVAL '1 day')
            )
            OR (
              ${config.keepTopN} > 0
              AND rn > ${config.keepTopN}
            )
        )
        DELETE FROM user_article_scores AS u
        USING doomed AS d
        WHERE u.id = d.id
        RETURNING u.id
      `);
      const rows = result as unknown as Array<{ id: string }>;
      deleted += rows.length;
    }
  }

  const evalPrune = await pruneUserArticleEvaluations(db, {
    userId: options.userId,
    ttlDays: config.ttlDays,
  });

  return {
    deleted,
    users: options.userId ? 1 : 0,
    evaluationsDeleted: evalPrune.deleted,
  };
}

/**
 * Delete shared `articles` older than TTL (by `COALESCE(published_at, created_at)`).
 * Never deletes an article that any user has **saved** (bookmarks survive).
 * Cascades to `article_sources`, scores, and evaluations via FK.
 */
export async function pruneOldArticles(
  db: Database,
  options: { config?: ArticleRetentionConfig } = {},
): Promise<PruneArticlesResult> {
  const config = options.config ?? resolveArticleRetention();
  if (config.ttlDays <= 0) {
    return { deleted: 0 };
  }

  const result = await db.execute<{ id: string }>(sql`
    DELETE FROM articles AS a
    WHERE COALESCE(a.published_at, a.created_at)
      < NOW() - (${config.ttlDays}::bigint * INTERVAL '1 day')
      AND NOT EXISTS (
        SELECT 1
        FROM user_article_scores AS s
        WHERE s.article_id = a.id
          AND s.status = 'saved'
      )
    RETURNING a.id
  `);
  const rows = result as unknown as Array<{ id: string }>;
  return { deleted: rows.length };
}

/** Score prune then article prune (CLI / ops retention pass). */
export async function pruneRetention(
  db: Database,
): Promise<{ scores: PruneScoresResult; articles: PruneArticlesResult }> {
  const scores = await pruneUserArticleScores(db);
  const articleRows = await pruneOldArticles(db);
  return { scores, articles: articleRows };
}
