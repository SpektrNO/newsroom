import { RANK_MODEL_TIERS, type RankModelTier } from "@newsroom/db";

export type ParsedRankModelTierBody =
  | { ok: true; tier: RankModelTier }
  | { ok: false; error: "invalid_tier" };

export function parseRankModelTierBody(body: unknown): ParsedRankModelTierBody {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_tier" };
  }
  const tier = (body as Record<string, unknown>).tier;
  if (typeof tier !== "string" || !RANK_MODEL_TIERS.includes(tier as RankModelTier)) {
    return { ok: false, error: "invalid_tier" };
  }
  return { ok: true, tier: tier as RankModelTier };
}
