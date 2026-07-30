import {
  RANK_MODEL_TIERS,
  parseUserAiCredentialProvider,
  type RankModelTier,
  type UserAiCredentialProvider,
} from "@newsroom/db";

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

export type ParsedAiCredentialsBody =
  | { ok: true; provider: UserAiCredentialProvider; apiKey: string }
  | { ok: false; error: "invalid_credentials" };

export function parseAiCredentialsBody(body: unknown): ParsedAiCredentialsBody {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_credentials" };
  }
  const rec = body as Record<string, unknown>;
  const provider = parseUserAiCredentialProvider(rec.provider);
  const apiKey = typeof rec.apiKey === "string" ? rec.apiKey.trim() : "";
  if (!provider || !apiKey) {
    return { ok: false, error: "invalid_credentials" };
  }
  return { ok: true, provider, apiKey };
}
