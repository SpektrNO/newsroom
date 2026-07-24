CREATE TABLE "article_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"source_subscription_id" text,
	"source_type" text NOT NULL,
	"external_id" text,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"author" text,
	"published_at" timestamp with time zone,
	"raw" jsonb,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_source_subscription_id_source_subscriptions_id_fk" FOREIGN KEY ("source_subscription_id") REFERENCES "public"."source_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_subscriptions" ADD CONSTRAINT "source_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_sources_subscription_id_idx" ON "article_sources" USING btree ("source_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "article_sources_article_subscription_uidx" ON "article_sources" USING btree ("article_id","source_subscription_id") WHERE "article_sources"."source_subscription_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "article_sources_article_type_orphan_uidx" ON "article_sources" USING btree ("article_id","source_type") WHERE "article_sources"."source_subscription_id" is null;--> statement-breakpoint
CREATE INDEX "jobs_status_scheduled_at_idx" ON "jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "source_subscriptions_user_id_idx" ON "source_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_subscriptions_enabled_source_type_idx" ON "source_subscriptions" USING btree ("enabled","source_type");--> statement-breakpoint
CREATE UNIQUE INDEX "source_subscriptions_user_hn_uidx" ON "source_subscriptions" USING btree ("user_id") WHERE "source_subscriptions"."source_type" = 'hackernews';--> statement-breakpoint
CREATE UNIQUE INDEX "source_subscriptions_user_rss_uidx" ON "source_subscriptions" USING btree ("user_id",("config"->>'rssUrl')) WHERE "source_subscriptions"."source_type" = 'substack';