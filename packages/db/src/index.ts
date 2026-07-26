import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

let singleton: Database | undefined;

/** Shared app DB client (lazy). Prefer createDb() in workers/tests. */
export function getDb(): Database {
  if (!singleton) {
    singleton = createDb();
  }
  return singleton;
}

export * from "./schema/index.js";
export {
  FEED_ACTIVE_WINDOW_MS,
  markUserDirty,
  markUsersDirty,
  clearUserDirty,
  touchFeedActivity,
  invalidatePreferenceScores,
  markUserPreferenceDirty,
  isUserDirty,
  listDirtyRankUserIds,
} from "./rank-dirty.js";
export {
  recordAiTokenUsage,
  getAiTokenUsageForDay,
  canSpendAiTokens,
  resolveAiTokenDailyLimit,
  resolveAiTokenDailySoftLimit,
  utcDayString,
  type AiTokenUsageInput,
  type AiTokenBudgetStatus,
} from "./ai-usage.js";
