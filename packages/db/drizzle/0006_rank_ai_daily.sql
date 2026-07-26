CREATE TABLE "rank_ai_daily" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"articles_scored" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rank_ai_daily_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "rank_ai_daily" ADD CONSTRAINT "rank_ai_daily_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;