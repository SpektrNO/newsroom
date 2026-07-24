import { and, desc, eq } from "drizzle-orm";
import { type Database, topics } from "@newsroom/db";

export async function listTopicsForUser(db: Database, userId: string) {
  return db
    .select()
    .from(topics)
    .where(eq(topics.userId, userId))
    .orderBy(desc(topics.updatedAt));
}

export async function getTopicForUser(
  db: Database,
  userId: string,
  topicId: string,
) {
  const [row] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function deleteTopicForUser(
  db: Database,
  userId: string,
  topicId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(topics)
    .where(and(eq(topics.id, topicId), eq(topics.userId, userId)))
    .returning({ id: topics.id });
  return deleted.length > 0;
}
