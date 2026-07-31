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
  /** Bluesky handle or DID (normalized in app before insert). */
  handle?: string;
  /** Resolved Bluesky DID when known (optional). */
  did?: string;
  /** Reddit subreddit name without r/ (normalized in app before insert). */
  subreddit?: string;
  [key: string]: unknown;
};

export const sourceSubscriptions = pgTable(
  "source_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Product category: podcast | website | social_media | community */
    category: text("category").notNull(),
    /** Ingest adapter: hackernews | rss | bluesky | reddit */
    adapter: text("adapter").notNull(),
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
    index("source_subscriptions_enabled_category_idx").on(
      table.enabled,
      table.category,
    ),
    /** At most one Hacker News subscription per user. */
    uniqueIndex("source_subscriptions_user_hn_uidx")
      .on(table.userId)
      .where(sql`${table.adapter} = 'hackernews'`),
    /** One RSS URL per user (shared across website / community / podcast). */
    uniqueIndex("source_subscriptions_user_rss_uidx")
      .on(table.userId, sql`(${table.config}->>'rssUrl')`)
      .where(sql`${table.adapter} = 'rss'`),
    /** One Bluesky handle per user (handle normalized in app before insert). */
    uniqueIndex("source_subscriptions_user_bluesky_handle_uidx")
      .on(table.userId, sql`(${table.config}->>'handle')`)
      .where(sql`${table.adapter} = 'bluesky'`),
    /** One Reddit subreddit per user (name normalized in app before insert). */
    uniqueIndex("source_subscriptions_user_reddit_sub_uidx")
      .on(table.userId, sql`(${table.config}->>'subreddit')`)
      .where(sql`${table.adapter} = 'reddit'`),
  ],
);

export const articles = pgTable("articles", {
  id: text("id").primaryKey(),
  canonicalUrl: text("canonical_url").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary"),
  author: text("author"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  /** Podcast show / channel title when known. */
  showTitle: text("show_title"),
  /** Episode duration in seconds when known. */
  durationSeconds: integer("duration_seconds"),
  /** Audio (or media) enclosure URL when distinct from canonical. */
  enclosureUrl: text("enclosure_url"),
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
    category: text("category").notNull(),
    adapter: text("adapter").notNull(),
    externalId: text("external_id"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("article_sources_subscription_id_idx").on(table.sourceSubscriptionId),
    uniqueIndex("article_sources_article_subscription_uidx")
      .on(table.articleId, table.sourceSubscriptionId)
      .where(sql`${table.sourceSubscriptionId} is not null`),
    uniqueIndex("article_sources_article_adapter_orphan_uidx")
      .on(table.articleId, table.adapter)
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
    // One open rank job per user (payload.userId).
    uniqueIndex("jobs_rank_open_user_uidx")
      .on(sql`(${table.payload} ->> 'userId')`)
      .where(
        sql`${table.type} = 'rank' AND ${table.status} IN ('pending', 'running') AND (${table.payload} ->> 'userId') IS NOT NULL`,
      ),
  ],
);
