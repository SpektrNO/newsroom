/**
 * Worker scaffold — ingest/rank jobs land in later features.
 * Starts, logs ready, and exits cleanly unless NEWSROOM_WORKER_IDLE=1.
 */
const idle = process.env.NEWSROOM_WORKER_IDLE === "1";

console.log("[newsroom-worker] scaffold ready (no jobs scheduled)");

if (idle) {
  console.log("[newsroom-worker] idling (NEWSROOM_WORKER_IDLE=1); Ctrl+C to stop");
  const keepAlive = setInterval(() => {}, 60_000);
  const shutdown = () => {
    clearInterval(keepAlive);
    console.log("[newsroom-worker] shut down");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} else {
  process.exit(0);
}
