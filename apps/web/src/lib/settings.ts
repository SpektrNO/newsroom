import {
  RANK_MODEL_TIERS,
  parseUserAiCredentialProvider,
  SCORE_KEEP_POLICIES,
  clampScoreKeepTopN,
  isScoreKeepPolicy,
  type RankModelTier,
  type ScoreKeepPolicy,
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

export type ParsedScoreKeepBody =
  | { ok: true; keepTopN: number; policy: ScoreKeepPolicy }
  | { ok: false; error: "invalid_score_keep" };

export function parseScoreKeepBody(body: unknown): ParsedScoreKeepBody {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_score_keep" };
  }
  const rec = body as Record<string, unknown>;
  const keepRaw = rec.keepTopN;
  const keepTopN =
    typeof keepRaw === "number"
      ? keepRaw
      : typeof keepRaw === "string"
        ? Number(keepRaw)
        : NaN;
  if (!Number.isFinite(keepTopN)) {
    return { ok: false, error: "invalid_score_keep" };
  }
  if (!isScoreKeepPolicy(rec.policy)) {
    return { ok: false, error: "invalid_score_keep" };
  }
  return {
    ok: true,
    keepTopN: clampScoreKeepTopN(keepTopN),
    policy: rec.policy,
  };
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

export { SCORE_KEEP_POLICIES };
export type { ScoreKeepPolicy };
