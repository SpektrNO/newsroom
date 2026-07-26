import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import {
  createDb,
  recordRankAiArticles,
  remainingRankAiBudget,
  resolveRankAiLimits,
  user,
  type Database,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://newsroom:newsroom@localhost:5432/newsroom";

describe("rank AI article budgets", () => {
  let db: Database;
  const userId = `rank-ai-${randomUUID()}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: "RankAi",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  after(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  it("parses env limits (0 = unlimited global)", () => {
    const limits = resolveRankAiLimits({
      RANK_AI_MAX_PER_RUN: "10",
      RANK_AI_MAX_PER_DAY: "25",
      RANK_AI_MAX_GLOBAL_PER_DAY: "0",
    } as NodeJS.ProcessEnv);
    assert.deepEqual(limits, { perRun: 10, perDay: 25, globalPerDay: 0 });
  });

  it("reduces remaining after recording scores", async () => {
    const before = await remainingRankAiBudget(db, userId, {
      perRun: 50,
      perDay: 30,
      globalPerDay: 0,
    });
    assert.equal(before.remaining, 30);

    await recordRankAiArticles(db, { userId, count: 12 });
    const after = await remainingRankAiBudget(db, userId, {
      perRun: 50,
      perDay: 30,
      globalPerDay: 0,
    });
    assert.equal(after.used, 12);
    assert.equal(after.remaining, 18);
  });
});
