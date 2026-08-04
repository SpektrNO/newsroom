import { eq } from "drizzle-orm";
import type { Database } from "./index.js";
import { user } from "./schema/auth.js";

/** Keep-N overflow: drop lowest `final_rank` or oldest `scored_at`. */
export type ScoreKeepPolicy = "rank" | "age";

export const SCORE_KEEP_POLICIES: ScoreKeepPolicy[] = ["rank", "age"];

export type UserScoreKeepSettings = {
  keepTopN: number;
  policy: ScoreKeepPolicy;
};

const DEFAULT_KEEP_TOP_N = 500;
const MAX_KEEP_TOP_N = 10_000;

/** Clamp keep-N for API / storage (`0` disables keep-N). */
export function clampScoreKeepTopN(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_KEEP_TOP_N, Math.floor(n));
}

export function isScoreKeepPolicy(raw: unknown): raw is ScoreKeepPolicy {
  return raw === "rank" || raw === "age";
}

export async function getUserScoreKeepSettings(
  db: Database,
  userId: string,
): Promise<UserScoreKeepSettings> {
  const [row] = await db
    .select({
      scoreKeepTopN: user.scoreKeepTopN,
      scoreKeepPolicy: user.scoreKeepPolicy,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return {
    keepTopN: clampScoreKeepTopN(row?.scoreKeepTopN ?? DEFAULT_KEEP_TOP_N),
    policy: isScoreKeepPolicy(row?.scoreKeepPolicy)
      ? row.scoreKeepPolicy
      : "rank",
  };
}

export async function setUserScoreKeepSettings(
  db: Database,
  userId: string,
  settings: UserScoreKeepSettings,
): Promise<void> {
  await db
    .update(user)
    .set({
      scoreKeepTopN: clampScoreKeepTopN(settings.keepTopN),
      scoreKeepPolicy: settings.policy,
    })
    .where(eq(user.id, userId));
}
