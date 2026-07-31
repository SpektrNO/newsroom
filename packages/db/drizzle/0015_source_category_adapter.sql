-- Split source_type into category + adapter on subscriptions and article_sources.

ALTER TABLE "source_subscriptions" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "source_subscriptions" ADD COLUMN "adapter" text;--> statement-breakpoint

UPDATE "source_subscriptions" SET
  "category" = CASE "source_type"
    WHEN 'hackernews' THEN 'community'
    WHEN 'substack' THEN 'community'
    WHEN 'podcast' THEN 'podcast'
    WHEN 'bluesky' THEN 'social_media'
    WHEN 'reddit' THEN 'community'
    ELSE 'website'
  END,
  "adapter" = CASE "source_type"
    WHEN 'hackernews' THEN 'hackernews'
    WHEN 'substack' THEN 'rss'
    WHEN 'podcast' THEN 'rss'
    WHEN 'bluesky' THEN 'bluesky'
    WHEN 'reddit' THEN 'reddit'
    ELSE 'rss'
  END;--> statement-breakpoint

ALTER TABLE "source_subscriptions" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "source_subscriptions" ALTER COLUMN "adapter" SET NOT NULL;--> statement-breakpoint

DROP INDEX IF EXISTS "source_subscriptions_enabled_source_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "source_subscriptions_user_hn_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "source_subscriptions_user_rss_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "source_subscriptions_user_podcast_rss_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "source_subscriptions_user_bluesky_handle_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "source_subscriptions_user_reddit_sub_uidx";--> statement-breakpoint

ALTER TABLE "source_subscriptions" DROP COLUMN "source_type";--> statement-breakpoint

CREATE INDEX "source_subscriptions_enabled_category_idx" ON "source_subscriptions" USING btree ("enabled","category");--> statement-breakpoint
CREATE UNIQUE INDEX "source_subscriptions_user_hn_uidx" ON "source_subscriptions" USING btree ("user_id") WHERE "adapter" = 'hackernews';--> statement-breakpoint
CREATE UNIQUE INDEX "source_subscriptions_user_rss_uidx" ON "source_subscriptions" USING btree ("user_id",("config"->>'rssUrl')) WHERE "adapter" = 'rss';--> statement-breakpoint
CREATE UNIQUE INDEX "source_subscriptions_user_bluesky_handle_uidx" ON "source_subscriptions" USING btree ("user_id",("config"->>'handle')) WHERE "adapter" = 'bluesky';--> statement-breakpoint
CREATE UNIQUE INDEX "source_subscriptions_user_reddit_sub_uidx" ON "source_subscriptions" USING btree ("user_id",("config"->>'subreddit')) WHERE "adapter" = 'reddit';--> statement-breakpoint

ALTER TABLE "article_sources" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "article_sources" ADD COLUMN "adapter" text;--> statement-breakpoint

UPDATE "article_sources" SET
  "category" = CASE "source_type"
    WHEN 'hackernews' THEN 'community'
    WHEN 'substack' THEN 'community'
    WHEN 'podcast' THEN 'podcast'
    WHEN 'bluesky' THEN 'social_media'
    WHEN 'reddit' THEN 'community'
    ELSE 'website'
  END,
  "adapter" = CASE "source_type"
    WHEN 'hackernews' THEN 'hackernews'
    WHEN 'substack' THEN 'rss'
    WHEN 'podcast' THEN 'rss'
    WHEN 'bluesky' THEN 'bluesky'
    WHEN 'reddit' THEN 'reddit'
    ELSE 'rss'
  END;--> statement-breakpoint

ALTER TABLE "article_sources" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "article_sources" ALTER COLUMN "adapter" SET NOT NULL;--> statement-breakpoint

DROP INDEX IF EXISTS "article_sources_article_type_orphan_uidx";--> statement-breakpoint
ALTER TABLE "article_sources" DROP COLUMN "source_type";--> statement-breakpoint
CREATE UNIQUE INDEX "article_sources_article_adapter_orphan_uidx" ON "article_sources" USING btree ("article_id","adapter") WHERE "source_subscription_id" is null;
