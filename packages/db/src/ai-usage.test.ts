import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import {
  createDb,
  getAiTokenUsageForDay,
  recordAiTokenUsage,
  resolveAiTokenDailyLimit,
  resolveAiTokenDailySoftLimit,
  user,
  type Database,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://newsroom:newsroom@localhost:5432/newsroom";

describe("ai token metering helpers", () => {
  let db: Database;
  const userId = `tok-user-${randomUUID()}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: "Tok",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  after(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  it("resolves limits with soft default 80%", () => {
    assert.equal(resolveAiTokenDailyLimit(""), 200_000);
    assert.equal(resolveAiTokenDailySoftLimit(1000, ""), 800);
  });

  it("records and sums usage by purpose", async () => {
    await recordAiTokenUsage(db, {
      userId,
      purpose: "chat",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    await recordAiTokenUsage(db, {
      userId,
      purpose: "chat",
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    });
    await recordAiTokenUsage(db, {
      userId,
      purpose: "rank",
      usage: { promptTokens: 100, completionTokens: 0, totalTokens: 100 },
    });

    const status = await getAiTokenUsageForDay(db, userId);
    assert.equal(status.byPurpose.chat, 25);
    assert.equal(status.byPurpose.rank, 100);
    assert.equal(status.used, 125);
  });
});
