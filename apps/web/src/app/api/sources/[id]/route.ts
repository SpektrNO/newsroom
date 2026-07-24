import { and, eq } from "drizzle-orm";
import { getDb, sourceSubscriptions } from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import {
  isUniqueViolation,
  parsePatchBody,
  toSourceJson,
} from "@/lib/sources";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const { id } = await context.params;

  const [existing] = await getDb()
    .select()
    .from(sourceSubscriptions)
    .where(
      and(
        eq(sourceSubscriptions.id, id),
        eq(sourceSubscriptions.userId, authResult.userId),
      ),
    )
    .limit(1);

  if (!existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_config" }, { status: 400 });
  }

  const parsed = parsePatchBody(body, existing.sourceType);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const updates: {
    enabled?: boolean;
    config?: typeof existing.config;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (parsed.enabled !== undefined) {
    updates.enabled = parsed.enabled;
  }
  if (parsed.config !== undefined) {
    updates.config = parsed.config;
  }

  try {
    const [row] = await getDb()
      .update(sourceSubscriptions)
      .set(updates)
      .where(
        and(
          eq(sourceSubscriptions.id, id),
          eq(sourceSubscriptions.userId, authResult.userId),
        ),
      )
      .returning();

    if (!row) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    return Response.json({
      source: toSourceJson({
        id: row.id,
        sourceType: row.sourceType,
        config: row.config ?? {},
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

  const deleted = await getDb()
    .delete(sourceSubscriptions)
    .where(
      and(
        eq(sourceSubscriptions.id, id),
        eq(sourceSubscriptions.userId, authResult.userId),
      ),
    )
    .returning({ id: sourceSubscriptions.id });

  if (deleted.length === 0) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
