import { requireSessionUserId } from "@/lib/session";
import { getFeedCatalog } from "@/lib/feed-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  return Response.json(getFeedCatalog());
}
