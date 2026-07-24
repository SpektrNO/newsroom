import { getDb, topics } from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import {
  isUniqueViolation,
  parseTopicCreateBody,
  toTopicJson,
} from "@/lib/topics";
import { listTopicsForUser } from "@/lib/topics-queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const rows = await listTopicsForUser(getDb(), authResult.userId);

  return Response.json({
    topics: rows.map((row) =>
      toTopicJson({
        id: row.id,
        name: row.name,
        keywords: row.keywords ?? [],
        weight: row.weight,
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
    return Response.json({ error: "invalid_topic" }, { status: 400 });
  }

  const parsed = parseTopicCreateBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = new Date();

  try {
    const [row] = await getDb()
      .insert(topics)
      .values({
        id,
        userId: authResult.userId,
        name: parsed.name,
        keywords: parsed.keywords,
        weight: parsed.weight,
        enabled: parsed.enabled,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!row) {
      return Response.json({ error: "invalid_topic" }, { status: 400 });
    }

    return Response.json(
      {
        topic: toTopicJson({
          id: row.id,
          name: row.name,
          keywords: row.keywords ?? [],
          weight: row.weight,
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
