import {
  getAiTokenUsageForDay,
  getDb,
  remainingRankAiBudget,
} from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const db = getDb();
  const [usage, rankAi] = await Promise.all([
    getAiTokenUsageForDay(db, authResult.userId),
    remainingRankAiBudget(db, authResult.userId),
  ]);
  return Response.json({
    day: usage.day,
    used: usage.used,
    limit: usage.limit,
    softLimit: usage.softLimit,
    byPurpose: usage.byPurpose,
    softExceeded: usage.softExceeded,
    hardExceeded: usage.hardExceeded,
    rankAi: {
      used: rankAi.used,
      dayLimit: rankAi.dayLimit,
      runLimit: rankAi.runLimit,
      remaining: rankAi.remaining,
      globalUsed: rankAi.globalUsed,
      globalLimit: rankAi.globalLimit,
    },
  });
}
