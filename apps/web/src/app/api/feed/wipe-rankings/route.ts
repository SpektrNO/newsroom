import { getDb, wipeUserRankings } from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const rate = checkRateLimit(`feed-wipe:${authResult.userId}`, {
    limit: 5,
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

  const result = await wipeUserRankings(getDb(), authResult.userId);
  return Response.json(result);
}
