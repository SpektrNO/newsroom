import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { articles } from "./ingest.js";

export type TopicKeywords = string[];

export const userArticleScoreStatuses = [
  "new",
  "seen",
  "saved",
  "dismissed",
] as const;
export type UserArticleScoreStatus = (typeof userArticleScoreStatuses)[number];

export const topics = pgTable(
  "topics",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keywords: jsonb("keywords").$type<TopicKeywords>().notNull(),
    weight: real("weight").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("topics_user_id_idx").on(table.userId),
    index("topics_user_id_enabled_idx").on(table.userId, table.enabled),
    uniqueIndex("topics_user_lower_name_uidx").on(
      table.userId,
      sql`lower(${table.name})`,
    ),
  ],
);

export const userArticleScores = pgTable(
  "user_article_scores",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    keywordScore: real("keyword_score").notNull(),
    aiScore: real("ai_score"),
    finalRank: real("final_rank").notNull(),
    reason: text("reason"),
    /**
     * Best-known set of `topics.id` this article belongs to for this user.
     * Set optimistically to the keyword-matched topics when first scored;
     * narrowed to the AI-confirmed subset once the AI batch scores it.
     * NULL = pre-migration row — feed falls back to a live keyword re-check.
     */
    matchedTopicIds: jsonb("matched_topic_ids").$type<string[] | null>(),
    nearDuplicateOfArticleId: text("near_duplicate_of_article_id").references(
      () => articles.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("new").$type<UserArticleScoreStatus>(),
    scoredAt: timestamp("scored_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("user_article_scores_user_article_uidx").on(
      table.userId,
      table.articleId,
    ),
    index("user_article_scores_user_final_rank_idx").on(
      table.userId,
      table.finalRank,
    ),
    index("user_article_scores_user_status_idx").on(table.userId, table.status),
  ],
);

/**
 * Per-user keyword evaluation markers (hits and misses).
 * Lets rank walk past recent misses instead of re-checking them forever.
 * Not shown in the feed — only `user_article_scores` are.
 */
export const userArticleEvaluations = pgTable(
  "user_article_evaluations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    /** True when keyword pass matched; false = checked miss. */
    hit: boolean("hit").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("user_article_evaluations_user_article_uidx").on(
      table.userId,
      table.articleId,
    ),
    index("user_article_evaluations_user_evaluated_at_idx").on(
      table.userId,
      table.evaluatedAt,
    ),
  ],
);
