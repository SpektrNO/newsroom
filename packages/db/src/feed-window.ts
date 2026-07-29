/** Rank + feed hide articles older than this (≈3 months). */
export const FEED_MAX_AGE_DAYS = 90;

export function feedMaxAgeCutoff(now = new Date()): Date {
  return new Date(now.getTime() - FEED_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
}
