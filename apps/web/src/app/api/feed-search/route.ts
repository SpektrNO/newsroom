import { requireSessionUserId } from "@/lib/session";
import {
  langSearchApiKey,
  parseFeedSearchBody,
  searchFeedsViaLangSearch,
} from "@/lib/feed-search";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const apiKey = langSearchApiKey();
  if (!apiKey) {
    return Response.json(
      { error: "feed_search_not_configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }

  const parsed = parseFeedSearchBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const searched = await searchFeedsViaLangSearch({
    query: parsed.query,
    domainHint: parsed.domainHint,
    apiKey,
  });
  if (!searched.ok) {
    return Response.json({ error: "upstream" }, { status: 502 });
  }

  return Response.json({ results: searched.results });
}
