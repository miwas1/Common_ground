CREATE TABLE "llm_spend" (
	"id" text PRIMARY KEY NOT NULL,
	"spent_micros" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_spend_nonnegative" CHECK ("llm_spend"."spent_micros" >= 0)
);
