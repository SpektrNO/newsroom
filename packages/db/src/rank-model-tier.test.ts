import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import {
  createDb,
  getUserRankModelTier,
  setUserRankModelTier,
  user,
  type Database,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://newsroom:newsroom@localhost:5432/newsroom";

describe("rank model tier", () => {
  let db: Database;
  const userId = `tier-user-${randomUUID()}`;

  before(async () => {
    db = createDb(databaseUrl);
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: "Tier",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  after(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  it("defaults to fast", async () => {
    assert.equal(await getUserRankModelTier(db, userId), "fast");
  });

  it("round-trips a set tier", async () => {
    await setUserRankModelTier(db, userId, "none");
    assert.equal(await getUserRankModelTier(db, userId), "none");

    await setUserRankModelTier(db, userId, "standard");
    assert.equal(await getUserRankModelTier(db, userId), "standard");
  });

  it("falls back to fast for an unknown user", async () => {
    assert.equal(await getUserRankModelTier(db, `missing-${randomUUID()}`), "fast");
  });
});
