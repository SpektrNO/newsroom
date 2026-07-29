import { eq } from "drizzle-orm";
import type { Database } from "./index.js";
import { user } from "./schema/auth.js";

/** AI model tier for ranking: "none" skips AI entirely (keyword-only). */
export type RankModelTier = "none" | "fast" | "standard";

export const RANK_MODEL_TIERS: RankModelTier[] = ["none", "fast", "standard"];

export async function getUserRankModelTier(
  db: Database,
  userId: string,
): Promise<RankModelTier> {
  const [row] = await db
    .select({ rankModelTier: user.rankModelTier })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return (row?.rankModelTier as RankModelTier | undefined) ?? "fast";
}

export async function setUserRankModelTier(
  db: Database,
  userId: string,
  tier: RankModelTier,
): Promise<void> {
  await db.update(user).set({ rankModelTier: tier }).where(eq(user.id, userId));
}
