import { eq, sql } from "drizzle-orm";
import { type Database, jobs } from "@newsroom/db";

/** Running jobs older than this are treated as crashed (Ctrl+C, OOM, etc.). */
export const DEFAULT_STALE_RUNNING_MS = 45 * 60 * 1000;

export async function completeJob(
  db: Database,
  jobId: string,
  outcome: { status: "completed" | "failed"; lastError: string | null },
): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: outcome.status,
      finishedAt: new Date(),
      lastError: outcome.lastError,
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Fail `running` jobs whose `started_at` is older than `olderThanMs`.
 * Without this, a killed worker leaves ingest "running" forever and
 * `ensureNextIngestJob` never schedules another pass.
 */
export async function failStaleRunningJobs(
  db: Database,
  options: { olderThanMs?: number } = {},
): Promise<number> {
  const olderThanMs = options.olderThanMs ?? DEFAULT_STALE_RUNNING_MS;
  const result = await db.execute<{ id: string }>(sql`
    UPDATE jobs
    SET
      status = 'failed',
      finished_at = NOW(),
      last_error = 'stale_running'
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < NOW() - (${olderThanMs}::bigint * INTERVAL '1 millisecond')
    RETURNING id
  `);
  const rows = result as unknown as Array<{ id: string }>;
  return rows.length;
}
