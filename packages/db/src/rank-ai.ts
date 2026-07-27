import { eq, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { rankAiDaily } from "./schema/rank-ai.js";
import { utcDayString } from "./ai-usage.js";

const DEFAULT_PER_RUN = 60;
/** 0 = unlimited — daily cost is governed by AI_TOKEN_DAILY_LIMIT. */
const DEFAULT_PER_DAY = 0;

export type RankAiLimits = {
  perRun: number;
  perDay: number;
  /** 0 = unlimited */
  globalPerDay: number;
};

export type RankAiBudgetStatus = {
  day: string;
  used: number;
  dayLimit: number;
  runLimit: number;
  remaining: number;
  globalUsed: number;
  globalLimit: number;
};

function parseNonNegInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function resolveRankAiLimits(
  env: NodeJS.ProcessEnv = process.env,
): RankAiLimits {
  return {
    perRun: parseNonNegInt(env.RANK_AI_MAX_PER_RUN, DEFAULT_PER_RUN),
    perDay: parseNonNegInt(env.RANK_AI_MAX_PER_DAY, DEFAULT_PER_DAY),
    globalPerDay: parseNonNegInt(env.RANK_AI_MAX_GLOBAL_PER_DAY, 0),
  };
}

export async function getRankAiArticlesForDay(
  db: Database,
  userId: string,
  day = utcDayString(),
): Promise<number> {
  const [row] = await db
    .select({ n: rankAiDaily.articlesScored })
    .from(rankAiDaily)
    .where(
      sql`${rankAiDaily.userId} = ${userId} AND ${rankAiDaily.day} = ${day}`,
    )
    .limit(1);
  return Number(row?.n ?? 0);
}

export async function getGlobalRankAiArticlesForDay(
  db: Database,
  day = utcDayString(),
): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`coalesce(sum(${rankAiDaily.articlesScored}), 0)::int`,
    })
    .from(rankAiDaily)
    .where(eq(rankAiDaily.day, day));
  return Number(row?.n ?? 0);
}

export async function recordRankAiArticles(
  db: Database,
  args: { userId: string; count: number; day?: string },
): Promise<void> {
  const count = Math.max(0, Math.floor(args.count));
  if (count === 0) return;
  const day = args.day ?? utcDayString();

  await db
    .insert(rankAiDaily)
    .values({
      userId: args.userId,
      day,
      articlesScored: count,
    })
    .onConflictDoUpdate({
      target: [rankAiDaily.userId, rankAiDaily.day],
      set: {
        articlesScored: sql`${rankAiDaily.articlesScored} + ${count}`,
      },
    });
}

/**
 * How many more articles may receive AI scores this run for the user,
 * considering day + run + optional global caps (`0` limit = unlimited).
 */
export async function remainingRankAiBudget(
  db: Database,
  userId: string,
  limits = resolveRankAiLimits(),
): Promise<RankAiBudgetStatus> {
  const day = utcDayString();
  const used = await getRankAiArticlesForDay(db, userId, day);
  const globalUsed = await getGlobalRankAiArticlesForDay(db, day);

  let remaining = Number.POSITIVE_INFINITY;
  if (limits.perDay > 0) {
    remaining = Math.min(remaining, Math.max(0, limits.perDay - used));
  }
  if (limits.perRun > 0) {
    remaining = Math.min(remaining, limits.perRun);
  }
  if (limits.globalPerDay > 0) {
    remaining = Math.min(
      remaining,
      Math.max(0, limits.globalPerDay - globalUsed),
    );
  }
  if (!Number.isFinite(remaining)) {
    // All unlimited — still apply a sane in-memory ceiling via perRun default path
    remaining = limits.perRun > 0 ? limits.perRun : Number.MAX_SAFE_INTEGER;
  }

  return {
    day,
    used,
    dayLimit: limits.perDay,
    runLimit: limits.perRun,
    remaining: Math.floor(remaining),
    globalUsed,
    globalLimit: limits.globalPerDay,
  };
}
