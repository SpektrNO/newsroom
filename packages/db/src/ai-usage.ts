import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { aiTokenDaily, type AiTokenPurpose } from "./schema/ai-usage.js";

export type AiTokenUsageInput = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiTokenBudgetStatus = {
  day: string;
  used: number;
  limit: number;
  softLimit: number;
  byPurpose: Record<AiTokenPurpose, number>;
  softExceeded: boolean;
  hardExceeded: boolean;
};

const DEFAULT_DAILY_LIMIT = 200_000;

/** UTC calendar day `YYYY-MM-DD`. */
export function utcDayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function resolveAiTokenDailyLimit(
  raw = process.env.AI_TOKEN_DAILY_LIMIT,
): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DAILY_LIMIT;
  return Math.floor(n);
}

export function resolveAiTokenDailySoftLimit(
  hard = resolveAiTokenDailyLimit(),
  raw = process.env.AI_TOKEN_DAILY_SOFT_LIMIT,
): number {
  if (raw !== undefined && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.min(hard, Math.floor(n));
  }
  return Math.floor(hard * 0.8);
}

function clampNonNegInt(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Upsert-add usage into today’s rollup for purpose. */
export async function recordAiTokenUsage(
  db: Database,
  args: {
    userId: string;
    purpose: AiTokenPurpose;
    usage: AiTokenUsageInput;
    day?: string;
  },
): Promise<void> {
  const day = args.day ?? utcDayString();
  const promptTokens = clampNonNegInt(args.usage.promptTokens);
  const completionTokens = clampNonNegInt(args.usage.completionTokens);
  const totalTokens = clampNonNegInt(
    args.usage.totalTokens || promptTokens + completionTokens,
  );
  if (totalTokens === 0 && promptTokens === 0 && completionTokens === 0) {
    return;
  }

  await db
    .insert(aiTokenDaily)
    .values({
      userId: args.userId,
      day,
      purpose: args.purpose,
      promptTokens,
      completionTokens,
      totalTokens,
    })
    .onConflictDoUpdate({
      target: [aiTokenDaily.userId, aiTokenDaily.day, aiTokenDaily.purpose],
      set: {
        promptTokens: sql`${aiTokenDaily.promptTokens} + ${promptTokens}`,
        completionTokens: sql`${aiTokenDaily.completionTokens} + ${completionTokens}`,
        totalTokens: sql`${aiTokenDaily.totalTokens} + ${totalTokens}`,
      },
    });
}

export async function getAiTokenUsageForDay(
  db: Database,
  userId: string,
  day = utcDayString(),
): Promise<AiTokenBudgetStatus> {
  const rows = await db
    .select()
    .from(aiTokenDaily)
    .where(and(eq(aiTokenDaily.userId, userId), eq(aiTokenDaily.day, day)));

  const byPurpose: Record<AiTokenPurpose, number> = {
    rank: 0,
    chat: 0,
    other: 0,
  };
  let used = 0;
  for (const row of rows) {
    const purpose = row.purpose as AiTokenPurpose;
    const total = Number(row.totalTokens ?? 0);
    if (purpose in byPurpose) {
      byPurpose[purpose] = total;
    }
    used += total;
  }

  const limit = resolveAiTokenDailyLimit();
  const softLimit = resolveAiTokenDailySoftLimit(limit);
  return {
    day,
    used,
    limit,
    softLimit,
    byPurpose,
    softExceeded: used >= softLimit && softLimit > 0,
    hardExceeded: used >= limit && limit > 0,
  };
}

/** True when the user may spend more tokens today (under hard limit). */
export async function canSpendAiTokens(
  db: Database,
  userId: string,
): Promise<boolean> {
  const status = await getAiTokenUsageForDay(db, userId);
  if (status.limit <= 0) return true; // 0 = unlimited
  return !status.hardExceeded;
}
