CREATE TYPE "public"."brand_fact_kind" AS ENUM('research', 'belief', 'measured', 'product', 'positioning', 'tone', 'approved_claim', 'avoid');--> statement-breakpoint
CREATE TABLE "brand_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_organization_id" text NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"pages" integer,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_fact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_organization_id" text NOT NULL,
	"kind" "brand_fact_kind" NOT NULL,
	"text" text NOT NULL,
	"document_id" uuid,
	"quote" text,
	"page" integer,
	"status" text DEFAULT 'suggested' NOT NULL,
	"created_by" text NOT NULL,
	"added_by" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brief_input" ADD COLUMN "brand_fact_id" uuid;--> statement-breakpoint
ALTER TABLE "brand_document" ADD CONSTRAINT "brand_document_brand_organization_id_organization_id_fk" FOREIGN KEY ("brand_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_document" ADD CONSTRAINT "brand_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_fact" ADD CONSTRAINT "brand_fact_brand_organization_id_organization_id_fk" FOREIGN KEY ("brand_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_fact" ADD CONSTRAINT "brand_fact_document_id_brand_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."brand_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_fact" ADD CONSTRAINT "brand_fact_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_fact" ADD CONSTRAINT "brand_fact_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_fact_org_idx" ON "brand_fact" USING btree ("brand_organization_id");--> statement-breakpoint
ALTER TABLE "brief_input" ADD CONSTRAINT "brief_input_brand_fact_id_brand_fact_id_fk" FOREIGN KEY ("brand_fact_id") REFERENCES "public"."brand_fact"("id") ON DELETE set null ON UPDATE no action;