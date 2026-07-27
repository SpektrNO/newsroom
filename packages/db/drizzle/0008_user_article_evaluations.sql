CREATE TABLE "user_article_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"article_id" text NOT NULL,
	"hit" boolean NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_article_evaluations" ADD CONSTRAINT "user_article_evaluations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_article_evaluations" ADD CONSTRAINT "user_article_evaluations_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_article_evaluations_user_article_uidx" ON "user_article_evaluations" USING btree ("user_id","article_id");
--> statement-breakpoint
CREATE INDEX "user_article_evaluations_user_evaluated_at_idx" ON "user_article_evaluations" USING btree ("user_id","evaluated_at");
