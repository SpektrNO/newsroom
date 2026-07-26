import { createDb } from "@newsroom/db";
import {
  claimNextIngestJob,
  enqueueIngestNow,
  ensureNextIngestJob,
  INGEST_INTERVAL_MS,
  processIngestJob,
  runIngest,
} from "./ingest.js";
import {
  claimNextRankJob,
  claimNextWorkerJob,
  enqueueRankJobsForEligibleUsers,
  processRankJob,
  runRank,
} from "./rank.js";

const POLL_MS = 5_000;

function loadDb() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgres://newsroom:newsroom@localhost:5432/newsroom";
  return createDb(databaseUrl);
}

async function runOnceIngest(): Promise<number> {
  const db = loadDb();
  console.log("[newsroom-worker] one-shot ingest starting");
  await enqueueIngestNow(db);
  const claimed = await claimNextIngestJob(db);
  if (!claimed) {
    const result = await runIngest(db);
    console.log("[newsroom-worker] one-shot ingest (inline):", result);
    if (result.affectedUserIds.length > 0) {
      const { markUsersDirty } = await import("@newsroom/db");
      await markUsersDirty(db, result.affectedUserIds);
    }
    const { enqueueRankJobsForEligibleUsers } = await import("./rank.js");
    await enqueueRankJobsForEligibleUsers(db, { delayMs: 0 });
    return result.subscriptions > 0 &&
      result.succeeded === 0 &&
      result.failed > 0
      ? 1
      : 0;
  }

  const result = await processIngestJob(db, claimed.id);
  await ensureNextIngestJob(db, INGEST_INTERVAL_MS);
  console.log("[newsroom-worker] one-shot ingest done:", result);
  return result.subscriptions > 0 && result.succeeded === 0 && result.failed > 0
    ? 1
    : 0;
}

async function runOnceRank(): Promise<number> {
  const db = loadDb();
  const allDirty = process.argv.includes("--all-dirty");
  console.log(
    `[newsroom-worker] one-shot rank starting${allDirty ? " (--all-dirty)" : ""}`,
  );
  const enqueued = await enqueueRankJobsForEligibleUsers(db, { allDirty });
  console.log(`[newsroom-worker] enqueued ${enqueued} per-user rank job(s)`);

  let drained = 0;
  let lastAllAiFailed = false;
  // Prefer rank-only claim so a due ingest job does not steal this one-shot.
  for (;;) {
    const claimed = await claimNextRankJob(db);
    if (!claimed) break;
    drained += 1;
    const result = await processRankJob(db, claimed.id, { allDirty });
    console.log("[newsroom-worker] rank job done:", claimed.id, result);
    lastAllAiFailed =
      result.aiBatches > 0 && result.aiBatchFailures === result.aiBatches;
  }

  if (drained === 0) {
    // No queue rows (e.g. races cleared) — fall back to in-process pass.
    const result = await runRank(db, { allDirty });
    console.log("[newsroom-worker] one-shot rank (inline):", result);
    const allAiFailed =
      result.aiBatches > 0 && result.aiBatchFailures === result.aiBatches;
    return allAiFailed ? 1 : 0;
  }

  return lastAllAiFailed ? 1 : 0;
}

async function pollLoop(): Promise<void> {
  const db = loadDb();
  console.log(
    `[newsroom-worker] polling jobs (ingest ~${INGEST_INTERVAL_MS / 60_000} min; also rank)`,
  );
  await ensureNextIngestJob(db, 0);

  const tick = async () => {
    try {
      const claimed = await claimNextWorkerJob(db);
      if (claimed?.type === "ingest") {
        console.log(`[newsroom-worker] claimed ingest job ${claimed.id}`);
        const result = await processIngestJob(db, claimed.id);
        console.log("[newsroom-worker] ingest finished:", result);
        await ensureNextIngestJob(db, INGEST_INTERVAL_MS);
      } else if (claimed?.type === "rank") {
        console.log(`[newsroom-worker] claimed rank job ${claimed.id}`);
        const result = await processRankJob(db, claimed.id);
        console.log("[newsroom-worker] rank finished:", result);
      } else {
        await ensureNextIngestJob(db, INGEST_INTERVAL_MS);
      }
    } catch (err) {
      console.error("[newsroom-worker] poll error:", err);
    }
  };

  await tick();
  const timer = setInterval(() => {
    void tick();
  }, POLL_MS);

  const shutdown = () => {
    clearInterval(timer);
    console.log("[newsroom-worker] shut down");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function runOncePruneScores(): Promise<number> {
  const db = loadDb();
  console.log("[newsroom-worker] one-shot retention prune starting");
  const { pruneRetention } = await import("@newsroom/db");
  const result = await pruneRetention(db);
  console.log("[newsroom-worker] retention prune done:", result);
  return 0;
}

async function main() {
  const onceIngest =
    process.env.NEWSROOM_WORKER_ONCE === "ingest" ||
    process.argv.includes("ingest") ||
    process.argv.includes("--once");

  const onceRank =
    process.env.NEWSROOM_WORKER_ONCE === "rank" ||
    process.argv.includes("rank");

  const oncePrune =
    process.env.NEWSROOM_WORKER_ONCE === "prune-scores" ||
    process.argv.includes("prune-scores");

  if (oncePrune) {
    const code = await runOncePruneScores();
    process.exit(code);
  }

  if (onceRank) {
    const code = await runOnceRank();
    process.exit(code);
  }

  if (onceIngest) {
    const code = await runOnceIngest();
    process.exit(code);
  }

  await pollLoop();
}

main().catch((err) => {
  console.error("[newsroom-worker] fatal:", err);
  process.exit(1);
});
