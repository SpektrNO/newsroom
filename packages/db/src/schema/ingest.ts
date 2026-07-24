import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/** Source subscription config JSON (app-validated shapes). */
export type SourceSubscriptionConfig = {
  mode?: "top" | "new";
  rssUrl?: string;
  [key: string]: unknown;
};

export const sourceSubscriptions = pgTable(
  "source_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    config: jsonb("config").$type<SourceSubscriptionConfig>().notNull().default({}),
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
    index("source_subscriptions_user_id_idx").on(table.userId),
    index("source_subscriptions_enabled_source_type_idx").on(
      table.enabled,
      table.sourceType,
    ),
    /** At most one Hacker News subscription per user. */
    uniqueIndex("source_subscriptions_user_hn_uidx")
      .on(table.userId)
      .where(sql`${table.sourceType} = 'hackernews'`),
    /** One Substack feed URL per user (rssUrl normalized in app before insert). */
    uniqueIndex("source_subscriptions_user_rss_uidx")
      .on(table.userId, sql`(${table.config}->>'rssUrl')`)
      .where(sql`${table.sourceType} = 'substack'`),
  ],
);

export const articles = pgTable("articles", {
  id: text("id").primaryKey(),
  canonicalUrl: text("canonical_url").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary"),
  author: text("author"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  raw: jsonb("raw"),
  contentHash: text("content_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const articleSources = pgTable(
  "article_sources",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    sourceSubscriptionId: text("source_subscription_id").references(
      () => sourceSubscriptions.id,
      { onDelete: "set null" },
    ),
    sourceType: text("source_type").notNull(),
    externalId: text("external_id"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("article_sources_subscription_id_idx").on(table.sourceSubscriptionId),
    uniqueIndex("article_sources_article_subscription_uidx")
      .on(table.articleId, table.sourceSubscriptionId)
      .where(sql`${table.sourceSubscriptionId} is not null`),
    uniqueIndex("article_sources_article_type_orphan_uidx")
      .on(table.articleId, table.sourceType)
      .where(sql`${table.sourceSubscriptionId} is null`),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("jobs_status_scheduled_at_idx").on(table.status, table.scheduledAt),
  ],
);
