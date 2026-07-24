/**
 * Seed demo user + HN + example Substack subscription + example topic.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @newsroom/db seed
 *   SEED_USER_ID=<existing-better-auth-user-id> pnpm --filter @newsroom/db seed
 *
 * Example Substack feed: https://www.platformer.news/feed
 * Example topic: "AI & infra" (keywords that can match HN/Substack titles)
 */
import { and, eq, sql } from "drizzle-orm";
import { normalizeCanonicalUrl } from "@newsroom/sources";
import { createDb, sourceSubscriptions, topics, user } from "./index.js";

const DEMO_USER_ID = "seed-demo-user";
const DEMO_EMAIL = "demo@localhost";
const EXAMPLE_SUBSTACK_RSS = "https://www.platformer.news/feed";
const EXAMPLE_TOPIC_NAME = "AI & infra";
const EXAMPLE_TOPIC_KEYWORDS = [
  "ai",
  "llm",
  "openai",
  "postgres",
  "typescript",
];

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgres://newsroom:newsroom@localhost:5432/newsroom";
  const db = createDb(databaseUrl);
  const now = new Date();

  let userId = process.env.SEED_USER_ID?.trim();

  if (userId) {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!existing) {
      throw new Error(`SEED_USER_ID not found: ${userId}`);
    }
    console.log(`Using existing user ${userId}`);
  } else {
    await db
      .insert(user)
      .values({
        id: DEMO_USER_ID,
        name: "Newsroom Demo",
        email: DEMO_EMAIL,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: user.email,
        set: { updatedAt: now, name: "Newsroom Demo" },
      });
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, DEMO_EMAIL))
      .limit(1);
    userId = row?.id ?? DEMO_USER_ID;
    console.log(`Ensured seed user ${userId} (${DEMO_EMAIL})`);
  }

  const [hn] = await db
    .select({ id: sourceSubscriptions.id })
    .from(sourceSubscriptions)
    .where(
      and(
        eq(sourceSubscriptions.userId, userId),
        eq(sourceSubscriptions.sourceType, "hackernews"),
      ),
    )
    .limit(1);

  if (hn) {
    await db
      .update(sourceSubscriptions)
      .set({ enabled: true, config: { mode: "top" }, updatedAt: now })
      .where(eq(sourceSubscriptions.id, hn.id));
    console.log(`Updated HN subscription ${hn.id}`);
  } else {
    const id = crypto.randomUUID();
    await db.insert(sourceSubscriptions).values({
      id,
      userId,
      sourceType: "hackernews",
      config: { mode: "top" },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created HN subscription ${id}`);
  }

  const rssUrl = normalizeCanonicalUrl(EXAMPLE_SUBSTACK_RSS);
  const substackRows = await db
    .select()
    .from(sourceSubscriptions)
    .where(
      and(
        eq(sourceSubscriptions.userId, userId),
        eq(sourceSubscriptions.sourceType, "substack"),
      ),
    );

  const match = substackRows.find((r) => r.config?.rssUrl === rssUrl);

  if (match) {
    await db
      .update(sourceSubscriptions)
      .set({ enabled: true, config: { rssUrl }, updatedAt: now })
      .where(eq(sourceSubscriptions.id, match.id));
    console.log(`Updated Substack subscription ${match.id} (${rssUrl})`);
  } else {
    const id = crypto.randomUUID();
    await db.insert(sourceSubscriptions).values({
      id,
      userId,
      sourceType: "substack",
      config: { rssUrl },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created Substack subscription ${id} (${rssUrl})`);
  }

  const [existingTopic] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        eq(topics.userId, userId),
        sql`lower(${topics.name}) = lower(${EXAMPLE_TOPIC_NAME})`,
      ),
    )
    .limit(1);

  if (existingTopic) {
    await db
      .update(topics)
      .set({
        name: EXAMPLE_TOPIC_NAME,
        keywords: EXAMPLE_TOPIC_KEYWORDS,
        weight: 1,
        enabled: true,
        updatedAt: now,
      })
      .where(eq(topics.id, existingTopic.id));
    console.log(`Updated topic ${existingTopic.id} (${EXAMPLE_TOPIC_NAME})`);
  } else {
    const id = crypto.randomUUID();
    await db.insert(topics).values({
      id,
      userId,
      name: EXAMPLE_TOPIC_NAME,
      keywords: EXAMPLE_TOPIC_KEYWORDS,
      weight: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created topic ${id} (${EXAMPLE_TOPIC_NAME})`);
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
