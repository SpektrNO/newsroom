import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof createDb>;

const DEFAULT_POOL_MAX = 5;

export function createDb(
  connectionString = process.env.DATABASE_URL,
  options: { max?: number } = {},
) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const max = options.max ?? DEFAULT_POOL_MAX;
  const client = postgres(connectionString, { max });
  return drizzle(client, { schema });
}

const globalForDb = globalThis as typeof globalThis & {
  __newsroomDb?: Database;
};

/** Shared app DB client (lazy). Survives Next.js HMR; prefer createDb() in workers/tests. */
export function getDb(): Database {
  if (!globalForDb.__newsroomDb) {
    globalForDb.__newsroomDb = createDb();
  }
  return globalForDb.__newsroomDb;
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
  wipeUserRankings,
  isUserDirty,
  listDirtyRankUserIds,
  type WipeUserRankingsResult,
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
export {
  resolveRankAiLimits,
  getRankAiArticlesForDay,
  getGlobalRankAiArticlesForDay,
  recordRankAiArticles,
  remainingRankAiBudget,
  type RankAiLimits,
  type RankAiBudgetStatus,
} from "./rank-ai.js";
export {
  resolveRankScoreRetention,
  resolveArticleRetention,
  pruneUserArticleScores,
  pruneOldArticles,
  pruneRetention,
  type RankScoreRetentionConfig,
  type ArticleRetentionConfig,
  type PruneScoresResult,
  type PruneArticlesResult,
} from "./score-retention.js";
export {
  FEED_MAX_AGE_DAYS,
  feedMaxAgeCutoff,
  resolveFeedMaxAgeDays,
} from "./feed-window.js";
export {
  upsertArticleEvaluation,
  invalidatePreferenceEvaluations,
  pruneUserArticleEvaluations,
  countUserAvailableArticles,
  countUserEvaluatedArticles,
  type UpsertEvaluationInput,
  type PruneEvaluationsResult,
} from "./article-evaluations.js";
export {
  RANK_MODEL_TIERS,
  getUserRankModelTier,
  setUserRankModelTier,
  type RankModelTier,
} from "./rank-model-tier.js";
export {
  SCORE_KEEP_POLICIES,
  clampScoreKeepTopN,
  getUserScoreKeepSettings,
  isScoreKeepPolicy,
  setUserScoreKeepSettings,
  type ScoreKeepPolicy,
  type UserScoreKeepSettings,
} from "./score-keep-settings.js";
export {
  getUserAiCredentialMeta,
  upsertUserAiCredential,
  clearUserAiCredential,
  loadUserAiCredentialSecret,
  parseUserAiCredentialProvider,
  isByokConfigured,
  resolveAiCredentialsKey,
  userAiCredentialProviders,
  type UserAiCredentialMeta,
  type UserAiCredentialProvider,
} from "./ai-credentials.js";
