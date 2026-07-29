import { resolveArticleRetention } from "./score-retention.js";

/**
 * Feed list, rank candidates, and pipeline counts use the same age window as
 * article GC (`ARTICLE_TTL_DAYS`, default 90). `0` disables the window.
 */
export function resolveFeedMaxAgeDays(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return resolveArticleRetention(env).ttlDays;
}

/** @deprecated Use `resolveFeedMaxAgeDays()` — same as `ARTICLE_TTL_DAYS`. */
export const FEED_MAX_AGE_DAYS = 90;

/** Cutoff instant, or `null` when article retention / feed window is off. */
export function feedMaxAgeCutoff(
  now = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Date | null {
  const days = resolveFeedMaxAgeDays(env);
  if (days <= 0) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
