ALTER TABLE "user" ADD COLUMN "score_keep_top_n" integer DEFAULT 500 NOT NULL;-->statement-breakpoint
ALTER TABLE "user" ADD COLUMN "score_keep_policy" text DEFAULT 'rank' NOT NULL;
