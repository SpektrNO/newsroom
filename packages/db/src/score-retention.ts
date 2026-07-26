import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { userArticleScores } from "./schema/ranking.js";

const DEFAULT_TTL_DAYS = 30;
const DEFAULT_KEEP_TOP_N = 500;

export type RankScoreRetentionConfig = {
  /** Delete new/seen/dismissed older than this many days. `0` = no age prune. */
  ttlDays: number;
  /** Keep at most this many new/seen by final_rank per user. `0` = no top-N prune. */
  keepTopN: number;
};

export type PruneScoresResult = {
  deleted: number;
  users: number;
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
  };
}

/**
 * Prune `user_article_scores` for one user or all users.
 * - Always keep `saved`.
 * - Delete `dismissed` older than TTL (when ttlDays > 0).
 * - Delete `new`/`seen` that are older than TTL **or** outside top-N by final_rank.
 */
export async function pruneUserArticleScores(
  db: Database,
  options: {
    userId?: string;
    config?: RankScoreRetentionConfig;
  } = {},
): Promise<PruneScoresResult> {
  const config = options.config ?? resolveRankScoreRetention();
  if (config.ttlDays <= 0 && config.keepTopN <= 0) {
    return { deleted: 0, users: 0 };
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

  if (config.ttlDays > 0 || config.keepTopN > 0) {
    const result = await db.execute<{ id: string }>(sql`
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

  return {
    deleted,
    users: options.userId ? 1 : 0,
  };
}
