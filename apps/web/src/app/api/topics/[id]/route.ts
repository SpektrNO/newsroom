import { and, eq } from "drizzle-orm";
import { getDb, markUserPreferenceDirty, topics } from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import {
  isUniqueViolation,
  parseTopicPatchBody,
  toTopicJson,
} from "@/lib/topics";
import { deleteTopicForUser, getTopicForUser } from "@/lib/topics-queries";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const { id } = await context.params;

  const existing = await getTopicForUser(getDb(), authResult.userId, id);

  if (!existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_topic" }, { status: 400 });
  }

  const parsed = parseTopicPatchBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const updates: {
    name?: string;
    keywords?: string[];
    weight?: number;
    enabled?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (parsed.name !== undefined) updates.name = parsed.name;
  if (parsed.keywords !== undefined) updates.keywords = parsed.keywords;
  if (parsed.weight !== undefined) updates.weight = parsed.weight;
  if (parsed.enabled !== undefined) updates.enabled = parsed.enabled;

  try {
    const [row] = await getDb()
      .update(topics)
      .set(updates)
      .where(and(eq(topics.id, id), eq(topics.userId, authResult.userId)))
      .returning();

    if (!row) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    await markUserPreferenceDirty(getDb(), authResult.userId);

    return Response.json({
      topic: toTopicJson({
        id: row.id,
        name: row.name,
        keywords: row.keywords ?? [],
        weight: row.weight,
        enabled: row.enabled,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json({ error: "duplicate" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const { id } = await context.params;

  const deleted = await deleteTopicForUser(getDb(), authResult.userId, id);

  if (!deleted) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  await markUserPreferenceDirty(getDb(), authResult.userId);

  return new Response(null, { status: 204 });
}
