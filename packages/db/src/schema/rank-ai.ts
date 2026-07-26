import { date, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/** Daily per-user count of articles that received an AI rank score. */
export const rankAiDaily = pgTable(
  "rank_ai_daily",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    articlesScored: integer("articles_scored").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);
