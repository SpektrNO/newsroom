import { requireSessionUserId } from "@/lib/session";
import { getTopicTree } from "@/lib/topic-tree";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  return Response.json(getTopicTree());
}
