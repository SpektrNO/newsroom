import { eq } from "drizzle-orm";
import { type Database, jobs } from "@newsroom/db";

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
