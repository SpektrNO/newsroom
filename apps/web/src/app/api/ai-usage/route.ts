import { getAiTokenUsageForDay, getDb } from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const usage = await getAiTokenUsageForDay(getDb(), authResult.userId);
  return Response.json({
    day: usage.day,
    used: usage.used,
    limit: usage.limit,
    softLimit: usage.softLimit,
    byPurpose: usage.byPurpose,
    softExceeded: usage.softExceeded,
    hardExceeded: usage.hardExceeded,
  });
}
