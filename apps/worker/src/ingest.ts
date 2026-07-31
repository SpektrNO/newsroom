import { and, eq, lte, or, sql } from "drizzle-orm";
import {
  type Database,
  articleSources,
  articles,
  jobs,
  markUsersDirty,
  sourceSubscriptions,
  type SourceSubscriptionConfig,
} from "@newsroom/db";
import {
  createSourceAdapter,
  hashArticleContent,
  normalizeCanonicalUrl,
  type NormalizedArticle,
  type SourceAdapterId,
  type SourceCategory,
} from "@newsroom/sources";
import { completeJob } from "./jobs.js";

/** ~12 minutes — within the 10–15 min ingest cadence. */
export const INGEST_INTERVAL_MS = 12 * 60 * 1000;

export type IngestResult = {
  subscriptions: number;
  succeeded: number;
  failed: number;
  articlesUpserted: number;
  /** Users whose enabled subscriptions produced upserts this run. */
  affectedUserIds: string[];
  errors: string[];
};

export async function runIngest(
  db: Database,
  options: { fetch?: typeof fetch } = {},
): Promise<IngestResult> {
  const subs = await db
    .select()
    .from(sourceSubscriptions)
    .where(eq(sourceSubscriptions.enabled, true));

  const affected = new Set<string>();
  const result: IngestResult = {
    subscriptions: subs.length,
    succeeded: 0,
    failed: 0,
    articlesUpserted: 0,
    affectedUserIds: [],
    errors: [],
  };

  for (const sub of subs) {
    const adapterId = sub.adapter as SourceAdapterId;
    const category = sub.category as SourceCategory;
    try {
      const adapter = createSourceAdapter(
        adapterId,
        (sub.config ?? {}) as SourceSubscriptionConfig,
        { fetch: options.fetch, category },
      );
      const items = await adapter.fetchRecent();
      for (const item of items) {
        await upsertArticleAndSource(db, item, {
          subscriptionId: sub.id,
          category,
          adapter: adapterId,
        });
        result.articlesUpserted += 1;
      }
      result.succeeded += 1;
      if (items.length > 0) {
        affected.add(sub.userId);
      }
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${sub.id}:${adapterId}:${message}`);
      console.error(
        `[newsroom-worker] ingest failed for subscription ${sub.id} (${adapterId}):`,
        message,
      );
    }
  }

  result.affectedUserIds = [...affected];
  return result;
}

async function upsertArticleAndSource(
  db: Database,
  item: NormalizedArticle,
  link: {
    subscriptionId: string;
    category: SourceCategory;
    adapter: SourceAdapterId;
  },
): Promise<void> {
  const canonicalUrl = normalizeCanonicalUrl(item.url);
  const contentHash =
    item.contentHash ?? hashArticleContent({ ...item, url: canonicalUrl });
  const now = new Date();

  const [article] = await db
    .insert(articles)
    .values({
      id: crypto.randomUUID(),
      canonicalUrl,
      title: item.title,
      summary: item.summary ?? null,
      author: item.author ?? null,
      publishedAt: item.publishedAt ?? null,
      showTitle: item.showTitle ?? null,
      durationSeconds: item.durationSeconds ?? null,
      enclosureUrl: item.enclosureUrl ?? null,
      raw: item.raw ?? null,
      contentHash,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: articles.canonicalUrl,
      set: {
        title: item.title,
        summary: item.summary ?? null,
        author: item.author ?? null,
        publishedAt: item.publishedAt ?? null,
        showTitle: item.showTitle ?? null,
        durationSeconds: item.durationSeconds ?? null,
        enclosureUrl: item.enclosureUrl ?? null,
        raw: item.raw ?? null,
        contentHash,
        // Only bump updatedAt when content changes — otherwise every ingest
        // stales evaluations/scores and Rank Latest re-walks the newest N.
        updatedAt: sql`CASE WHEN ${articles.contentHash} IS DISTINCT FROM ${contentHash} THEN NOW() ELSE ${articles.updatedAt} END`,
      },
    })
    .returning({ id: articles.id });

  if (!article) {
    throw new Error("article_upsert_failed");
  }

  const [existingLink] = await db
    .select({ id: articleSources.id })
    .from(articleSources)
    .where(
      and(
        eq(articleSources.articleId, article.id),
        eq(articleSources.sourceSubscriptionId, link.subscriptionId),
      ),
    )
    .limit(1);

  if (existingLink) {
    await db
      .update(articleSources)
      .set({
        category: link.category,
        adapter: link.adapter,
        externalId: item.externalId ?? null,
        fetchedAt: now,
      })
      .where(eq(articleSources.id, existingLink.id));
  } else {
    await db.insert(articleSources).values({
      id: crypto.randomUUID(),
      articleId: article.id,
      sourceSubscriptionId: link.subscriptionId,
      category: link.category,
      adapter: link.adapter,
      externalId: item.externalId ?? null,
      fetchedAt: now,
    });
  }
}

export async function claimNextIngestJob(
  db: Database,
): Promise<{ id: string } | null> {
  const result = await db.execute<{ id: string }>(sql`
    UPDATE jobs
    SET
      status = 'running',
      started_at = NOW(),
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending'
        AND type = 'ingest'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);

  const rows = result as unknown as Array<{ id: string }>;
  const first = rows[0];
  return first?.id ? { id: String(first.id) } : null;
}

/** Ensure a single pending/running ingest exists (single-flight). */
export async function ensureNextIngestJob(
  db: Database,
  intervalMs = INGEST_INTERVAL_MS,
): Promise<void> {
  const open = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, "ingest"),
        or(eq(jobs.status, "pending"), eq(jobs.status, "running")),
      ),
    )
    .limit(1);

  if (open.length > 0) return;

  await db.insert(jobs).values({
    id: crypto.randomUUID(),
    type: "ingest",
    status: "pending",
    payload: {},
    scheduledAt: new Date(Date.now() + intervalMs),
    attempts: 0,
    createdAt: new Date(),
  });
}

/** Enqueue an ingest job due immediately (one-shot / bootstrap). */
export async function enqueueIngestNow(db: Database): Promise<string> {
  const existing = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, "ingest"),
        eq(jobs.status, "pending"),
        lte(jobs.scheduledAt, new Date()),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0].id;

  const id = crypto.randomUUID();
  await db.insert(jobs).values({
    id,
    type: "ingest",
    status: "pending",
    payload: {},
    scheduledAt: new Date(),
    attempts: 0,
    createdAt: new Date(),
  });
  return id;
}

export async function processIngestJob(
  db: Database,
  jobId: string,
  options: { fetch?: typeof fetch } = {},
): Promise<IngestResult> {
  const result = await runIngest(db, options);
  const allFailed =
    result.subscriptions > 0 && result.succeeded === 0 && result.failed > 0;

  await completeJob(db, jobId, {
    status: allFailed ? "failed" : "completed",
    lastError: result.errors.length > 0 ? result.errors.join("; ") : null,
  });

  if (!allFailed) {
    if (result.affectedUserIds.length > 0) {
      await markUsersDirty(db, result.affectedUserIds);
    }
    const { enqueueRankJobsForEligibleUsers } = await import("./rank.js");
    await enqueueRankJobsForEligibleUsers(db, { delayMs: 0 });
  }

  return result;
}
