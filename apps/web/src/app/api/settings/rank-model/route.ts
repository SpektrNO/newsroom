import {
  getDb,
  getUserRankModelTier,
  markUserPreferenceDirty,
  setUserRankModelTier,
} from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import { parseRankModelTierBody } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const tier = await getUserRankModelTier(getDb(), authResult.userId);
  return Response.json({ tier });
}

export async function PATCH(request: Request) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_tier" }, { status: 400 });
  }

  const parsed = parseRankModelTierBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const db = getDb();
  await setUserRankModelTier(db, authResult.userId, parsed.tier);
  await markUserPreferenceDirty(db, authResult.userId);

  return Response.json({ tier: parsed.tier });
}
