ALTER TABLE "creator_fit" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "direction" ADD COLUMN "assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_fit" ADD CONSTRAINT "creator_fit_id_unique" UNIQUE("id");