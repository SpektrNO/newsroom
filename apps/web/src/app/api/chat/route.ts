import { adviseTopics, OllamaProvider } from "@newsroom/ai";
import {
  canSpendAiTokens,
  getDb,
  getAiTokenUsageForDay,
  recordAiTokenUsage,
} from "@newsroom/db";
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

  const db = getDb();
  const allowed = await canSpendAiTokens(db, authResult.userId);
  if (!allowed) {
    return Response.json({ error: "token_budget_exceeded" }, { status: 429 });
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

  const topics = await listTopicsForUser(db, authResult.userId);
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

    if (advised.usage) {
      await recordAiTokenUsage(db, {
        userId: authResult.userId,
        purpose: "chat",
        usage: advised.usage,
      });
    }

    const usageStatus = await getAiTokenUsageForDay(db, authResult.userId);

    return Response.json({
      reply: advised.reply,
      suggestions: markSuggestionsInCatalog(
        advised.suggestions,
        selectableLabels,
      ),
      tokens: advised.usage
        ? {
            promptTokens: advised.usage.promptTokens,
            completionTokens: advised.usage.completionTokens,
            totalTokens: advised.usage.totalTokens,
            estimated: Boolean(advised.usage.estimated),
          }
        : undefined,
      aiUsage: {
        used: usageStatus.used,
        limit: usageStatus.limit,
        softExceeded: usageStatus.softExceeded,
        hardExceeded: usageStatus.hardExceeded,
      },
    });
  } catch (err) {
    console.error("[newsroom] POST /api/chat failed", err);
    return Response.json({ error: "ai_unavailable" }, { status: 503 });
  }
}
