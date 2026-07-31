/**
 * Seed demo user + HN + example Substack subscription + example topic.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @newsroom/db seed
 *   SEED_USER_ID=<existing-better-auth-user-id> pnpm --filter @newsroom/db seed
 *
 * Default demo login (when SEED_USER_ID unset):
 *   email: demo@example.com
 *   password: newsroom-demo  (override with SEED_DEMO_PASSWORD)
 *
 * Example Substack feed: https://www.platformer.news/feed
 * Example topic: "AI & infra" (keywords that can match HN/Substack titles)
 */
import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { normalizeCanonicalUrl } from "@newsroom/sources";
import {
  account,
  createDb,
  sourceSubscriptions,
  topics,
  user,
} from "./index.js";

const DEMO_USER_ID = "seed-demo-user";
const DEMO_EMAIL = "demo@example.com";
/** Pre-auth-valid email used by older seeds; migrated to DEMO_EMAIL. */
const LEGACY_DEMO_EMAIL = "demo@localhost";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD?.trim() || "newsroom-demo";
const EXAMPLE_SUBSTACK_RSS = "https://www.platformer.news/feed";
const EXAMPLE_TOPIC_NAME = "AI & infra";
const EXAMPLE_TOPIC_KEYWORDS = [
  "ai",
  "llm",
  "openai",
  "postgres",
  "typescript",
];

async function ensureDemoCredential(
  db: ReturnType<typeof createDb>,
  userId: string,
  now: Date,
): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [existing] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential")),
    )
    .limit(1);

  if (existing) {
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: now })
      .where(eq(account.id, existing.id));
    return;
  }

  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  });
}

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
    // Migrate legacy seed email that Better Auth rejects (INVALID_EMAIL).
    await db
      .update(user)
      .set({ email: DEMO_EMAIL, updatedAt: now, name: "Newsroom Demo" })
      .where(eq(user.email, LEGACY_DEMO_EMAIL));

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
        set: { updatedAt: now, name: "Newsroom Demo", emailVerified: true },
      });
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, DEMO_EMAIL))
      .limit(1);
    userId = row?.id ?? DEMO_USER_ID;
    await ensureDemoCredential(db, userId, now);
    console.log(
      `Ensured seed user ${userId} (${DEMO_EMAIL}) with password login`,
    );
  }

  const [hn] = await db
    .select({ id: sourceSubscriptions.id })
    .from(sourceSubscriptions)
    .where(
      and(
        eq(sourceSubscriptions.userId, userId),
        eq(sourceSubscriptions.adapter, "hackernews"),
      ),
    )
    .limit(1);

  if (hn) {
    await db
      .update(sourceSubscriptions)
      .set({
        enabled: true,
        category: "community",
        adapter: "hackernews",
        config: { mode: "top" },
        updatedAt: now,
      })
      .where(eq(sourceSubscriptions.id, hn.id));
    console.log(`Updated HN subscription ${hn.id}`);
  } else {
    const id = crypto.randomUUID();
    await db.insert(sourceSubscriptions).values({
      id,
      userId,
      category: "community",
      adapter: "hackernews",
      config: { mode: "top" },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created HN subscription ${id}`);
  }

  const rssUrl = normalizeCanonicalUrl(EXAMPLE_SUBSTACK_RSS);
  const rssRows = await db
    .select()
    .from(sourceSubscriptions)
    .where(
      and(
        eq(sourceSubscriptions.userId, userId),
        eq(sourceSubscriptions.adapter, "rss"),
      ),
    );

  const match = rssRows.find((r) => r.config?.rssUrl === rssUrl);

  if (match) {
    await db
      .update(sourceSubscriptions)
      .set({
        enabled: true,
        category: "website",
        adapter: "rss",
        config: { rssUrl },
        updatedAt: now,
      })
      .where(eq(sourceSubscriptions.id, match.id));
    console.log(`Updated RSS subscription ${match.id} (${rssUrl})`);
  } else {
    const id = crypto.randomUUID();
    await db.insert(sourceSubscriptions).values({
      id,
      userId,
      category: "website",
      adapter: "rss",
      config: { rssUrl },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created RSS subscription ${id} (${rssUrl})`);
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
  if (!process.env.SEED_USER_ID?.trim()) {
    console.log(`Demo sign-in: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
