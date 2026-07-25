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
  enqueueRankNow,
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
    const { ensureNextRankJob } = await import("./rank.js");
    await ensureNextRankJob(db, { delayMs: 0 });
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
  console.log("[newsroom-worker] one-shot rank starting");
  await enqueueRankNow(db);
  // Prefer rank-only claim so a due ingest job does not steal this one-shot.
  const claimed = await claimNextRankJob(db);
  if (!claimed) {
    const result = await runRank(db);
    console.log("[newsroom-worker] one-shot rank (inline):", result);
    const allAiFailed =
      result.aiBatches > 0 && result.aiBatchFailures === result.aiBatches;
    return allAiFailed ? 1 : 0;
  }

  const result = await processRankJob(db, claimed.id);
  console.log("[newsroom-worker] one-shot rank done:", result);
  const allAiFailed =
    result.aiBatches > 0 && result.aiBatchFailures === result.aiBatches;
  return allAiFailed ? 1 : 0;
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

async function main() {
  const onceIngest =
    process.env.NEWSROOM_WORKER_ONCE === "ingest" ||
    process.argv.includes("ingest") ||
    process.argv.includes("--once");

  const onceRank =
    process.env.NEWSROOM_WORKER_ONCE === "rank" ||
    process.argv.includes("rank");

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
