CREATE TABLE "ai_token_daily" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"purpose" text NOT NULL,
	"prompt_tokens" bigint DEFAULT 0 NOT NULL,
	"completion_tokens" bigint DEFAULT 0 NOT NULL,
	"total_tokens" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_token_daily_user_id_day_purpose_pk" PRIMARY KEY("user_id","day","purpose")
);
--> statement-breakpoint
ALTER TABLE "ai_token_daily" ADD CONSTRAINT "ai_token_daily_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;