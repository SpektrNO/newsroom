import { createAiProviderForUser, resolveModelForTier } from "@newsroom/ai";
import {
  getDb,
  getUserRankModelTier,
  loadUserAiCredentialSecret,
  topics,
} from "@newsroom/db";
import { and, eq } from "drizzle-orm";
import { runRank } from "@newsroom/worker/rank";
import { requireSessionUserId } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Ranking batches against Ollama can take several minutes. */
export const maxDuration = 300;

export async function POST() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const rate = checkRateLimit(`feed-rank:${authResult.userId}`, {
    limit: 2,
    windowMs: 5 * 60_000,
  });
  if (!rate.ok) {
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "retry-after": String(rate.retryAfterSec) },
      },
    );
  }

  const db = getDb();
  const enabledTopics = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(eq(topics.userId, authResult.userId), eq(topics.enabled, true)),
    )
    .limit(1);

  if (enabledTopics.length === 0) {
    return Response.json({ error: "no_topics" }, { status: 400 });
  }

  try {
    const tier = await getUserRankModelTier(db, authResult.userId);
    if (tier !== "none") {
      const byok = await loadUserAiCredentialSecret(db, authResult.userId);
      const provider = createAiProviderForUser({
        byok,
        model: resolveModelForTier(tier, byok?.provider),
      });
      const healthy = await provider.health();
      if (!healthy) {
        return Response.json({ error: "ai_unavailable" }, { status: 503 });
      }
    }

    // No explicit provider — runRank resolves this user's tier/model itself.
    const result = await runRank(db, { userId: authResult.userId });
    // runRank prunes this user's score rows after a successful pass.

    const allAiFailed =
      result.aiBatches > 0 &&
      result.aiBatchFailures === result.aiBatches &&
      result.errors.includes("ollama_unreachable_all_batches");

    if (allAiFailed) {
      return Response.json({ error: "ai_unavailable" }, { status: 503 });
    }

    return Response.json({
      scored: result.scored,
      evaluated: result.evaluated,
      aiScored: result.aiScored,
      aiSkipped: result.aiSkipped,
      users: result.users,
      aiBatches: result.aiBatches,
      aiBatchFailures: result.aiBatchFailures,
    });
  } catch (err) {
    console.error("[newsroom] POST /api/feed/rank failed", err);
    return Response.json({ error: "ai_unavailable" }, { status: 503 });
  }
}
