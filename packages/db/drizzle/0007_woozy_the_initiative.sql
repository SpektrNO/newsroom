ALTER TABLE "articles" ADD COLUMN "show_title" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "enclosure_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "source_subscriptions_user_podcast_rss_uidx" ON "source_subscriptions" USING btree ("user_id",("config"->>'rssUrl')) WHERE "source_subscriptions"."source_type" = 'podcast';