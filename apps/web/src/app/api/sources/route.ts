import { eq } from "drizzle-orm";
import { getDb, markUserDirty, sourceSubscriptions } from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import {
  isUniqueViolation,
  parseCreateBody,
  toSourceJson,
} from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const rows = await getDb()
    .select()
    .from(sourceSubscriptions)
    .where(eq(sourceSubscriptions.userId, authResult.userId));

  return Response.json({
    sources: rows.map((row) =>
      toSourceJson({
        id: row.id,
        sourceType: row.sourceType,
        config: row.config ?? {},
        enabled: row.enabled,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    ),
  });
}

export async function POST(request: Request) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_config" }, { status: 400 });
  }

  const parsed = parseCreateBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = new Date();

  try {
    const [row] = await getDb()
      .insert(sourceSubscriptions)
      .values({
        id,
        userId: authResult.userId,
        sourceType: parsed.sourceType,
        config: parsed.config,
        enabled: parsed.enabled,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!row) {
      return Response.json({ error: "invalid_config" }, { status: 400 });
    }

    await markUserDirty(getDb(), authResult.userId);

    return Response.json(
      {
        source: toSourceJson({
          id: row.id,
          sourceType: row.sourceType,
          config: row.config ?? {},
          enabled: row.enabled,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }),
      },
      { status: 201 },
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json({ error: "duplicate" }, { status: 409 });
    }
    throw err;
  }
}
