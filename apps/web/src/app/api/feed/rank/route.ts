import { OllamaProvider } from "@newsroom/ai";
import { getDb, topics } from "@newsroom/db";
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

  const provider = new OllamaProvider();
  try {
    const healthy = await provider.health();
    if (!healthy) {
      return Response.json({ error: "ai_unavailable" }, { status: 503 });
    }

    const result = await runRank(db, {
      userId: authResult.userId,
      provider,
    });

    const allAiFailed =
      result.aiBatches > 0 &&
      result.aiBatchFailures === result.aiBatches &&
      result.errors.includes("ollama_unreachable_all_batches");

    if (allAiFailed) {
      return Response.json({ error: "ai_unavailable" }, { status: 503 });
    }

    return Response.json({
      scored: result.scored,
      users: result.users,
      aiBatches: result.aiBatches,
      aiBatchFailures: result.aiBatchFailures,
    });
  } catch (err) {
    console.error("[newsroom] POST /api/feed/rank failed", err);
    return Response.json({ error: "ai_unavailable" }, { status: 503 });
  }
}
