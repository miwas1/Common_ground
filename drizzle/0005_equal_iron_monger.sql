CREATE TABLE "brand_creator" (
	"brand_organization_id" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"exclusion_reason" text,
	"notes" text DEFAULT '' NOT NULL,
	"collaborations" text[] DEFAULT '{}' NOT NULL,
	"source" text NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_creator_brand_organization_id_creator_id_pk" PRIMARY KEY("brand_organization_id","creator_id")
);
--> statement-breakpoint
CREATE TABLE "discovered_creator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"direction_id" uuid NOT NULL,
	"evidence_id" uuid,
	"qloo_person_id" text NOT NULL,
	"name" text NOT NULL,
	"instagram" text,
	"occupations" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"rank" integer NOT NULL,
	"result_count" integer NOT NULL,
	"audience" jsonb
);
--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "handles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "contact" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "qloo_person_id" text;--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "qloo_profile" jsonb;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "supplied_by" text;--> statement-breakpoint
ALTER TABLE "brand_creator" ADD CONSTRAINT "brand_creator_brand_organization_id_organization_id_fk" FOREIGN KEY ("brand_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_creator" ADD CONSTRAINT "brand_creator_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_creator" ADD CONSTRAINT "brand_creator_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_creator" ADD CONSTRAINT "discovered_creator_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_creator" ADD CONSTRAINT "discovered_creator_direction_id_direction_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."direction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_creator" ADD CONSTRAINT "discovered_creator_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovered_creator_run_idx" ON "discovered_creator" USING btree ("run_id");