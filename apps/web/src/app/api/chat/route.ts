import { adviseTopics, OllamaProvider } from "@newsroom/ai";
import { getDb } from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import { listTopicsForUser } from "@/lib/topics-queries";
import { getTopicTree } from "@/lib/topic-tree";
import {
  markSuggestionsInCatalog,
  parseChatRequestBody,
} from "@/lib/chat";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const rate = checkRateLimit(`chat:${authResult.userId}`);
  if (!rate.ok) {
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "retry-after": String(rate.retryAfterSec) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_chat" }, { status: 400 });
  }

  const parsed = parseChatRequestBody(body);
  if (!parsed.ok) {
    return Response.json({ error: "invalid_chat" }, { status: 400 });
  }

  const tree = getTopicTree();
  const selectableLabels = tree.nodes
    .filter((n) => n.selectable)
    .map((n) => n.label);

  const topics = await listTopicsForUser(getDb(), authResult.userId);
  const following = topics.map((t) => ({
    name: t.name,
    keywords: t.keywords ?? [],
  }));

  const provider = new OllamaProvider();
  try {
    const healthy = await provider.health();
    if (!healthy) {
      return Response.json({ error: "ai_unavailable" }, { status: 503 });
    }

    const advised = await adviseTopics(provider, {
      catalogLabels: selectableLabels,
      following,
      messages: parsed.messages,
    });

    return Response.json({
      reply: advised.reply,
      suggestions: markSuggestionsInCatalog(
        advised.suggestions,
        selectableLabels,
      ),
    });
  } catch (err) {
    console.error("[newsroom] POST /api/chat failed", err);
    return Response.json({ error: "ai_unavailable" }, { status: 503 });
  }
}
