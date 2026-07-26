import { bigint, date, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const aiTokenPurposes = ["rank", "chat", "other"] as const;
export type AiTokenPurpose = (typeof aiTokenPurposes)[number];

/** Daily per-user token rollups by purpose (UTC calendar day). */
export const aiTokenDaily = pgTable(
  "ai_token_daily",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    purpose: text("purpose").$type<AiTokenPurpose>().notNull(),
    promptTokens: bigint("prompt_tokens", { mode: "number" })
      .notNull()
      .default(0),
    completionTokens: bigint("completion_tokens", { mode: "number" })
      .notNull()
      .default(0),
    totalTokens: bigint("total_tokens", { mode: "number" })
      .notNull()
      .default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day, table.purpose] })],
);
