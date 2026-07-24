CREATE TABLE "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"keywords" jsonb NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_article_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"article_id" text NOT NULL,
	"keyword_score" real NOT NULL,
	"ai_score" real,
	"final_rank" real NOT NULL,
	"reason" text,
	"near_duplicate_of_article_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"scored_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_article_scores" ADD CONSTRAINT "user_article_scores_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_article_scores" ADD CONSTRAINT "user_article_scores_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_article_scores" ADD CONSTRAINT "user_article_scores_near_duplicate_of_article_id_articles_id_fk" FOREIGN KEY ("near_duplicate_of_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topics_user_id_idx" ON "topics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "topics_user_id_enabled_idx" ON "topics" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_user_lower_name_uidx" ON "topics" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "user_article_scores_user_article_uidx" ON "user_article_scores" USING btree ("user_id","article_id");--> statement-breakpoint
CREATE INDEX "user_article_scores_user_final_rank_idx" ON "user_article_scores" USING btree ("user_id","final_rank");--> statement-breakpoint
CREATE INDEX "user_article_scores_user_status_idx" ON "user_article_scores" USING btree ("user_id","status");