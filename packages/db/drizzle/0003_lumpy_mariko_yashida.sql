ALTER TABLE "user" ADD COLUMN "dirty_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_feed_at" timestamp with time zone;