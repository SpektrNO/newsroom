import {
  getDb,
  getUserScoreKeepSettings,
  setUserScoreKeepSettings,
} from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import { parseScoreKeepBody } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const settings = await getUserScoreKeepSettings(getDb(), authResult.userId);
  return Response.json(settings);
}

export async function PATCH(request: Request) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_score_keep" }, { status: 400 });
  }

  const parsed = parseScoreKeepBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const db = getDb();
  await setUserScoreKeepSettings(db, authResult.userId, {
    keepTopN: parsed.keepTopN,
    policy: parsed.policy,
  });

  return Response.json({
    keepTopN: parsed.keepTopN,
    policy: parsed.policy,
  });
}
