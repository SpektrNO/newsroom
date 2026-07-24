import { updateFeedStatusResponse } from "@/lib/feed-status";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return updateFeedStatusResponse(id, "saved");
}
