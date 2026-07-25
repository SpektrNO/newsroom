/** Simple per-user rolling window rate limit (single process). */

type Bucket = { times: number[] };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number } = {
    limit: 10,
    windowMs: 60_000,
  },
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { times: [] };
  bucket.times = bucket.times.filter((t) => now - t < options.windowMs);
  if (bucket.times.length >= options.limit) {
    const oldest = bucket.times[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((options.windowMs - (now - oldest)) / 1000),
    );
    buckets.set(key, bucket);
    return { ok: false, retryAfterSec };
  }
  bucket.times.push(now);
  buckets.set(key, bucket);
  return { ok: true };
}

/** Test helper */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
