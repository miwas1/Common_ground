CREATE TYPE "public"."campaign_status" AS ENUM('brief_draft', 'researching', 'reviewing_proposals', 'in_production', 'complete');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('ugc_production', 'creator_distribution', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."check_kind" AS ENUM('coherence', 'sensitivity', 'relevance');--> statement-breakpoint
CREATE TYPE "public"."claim_kind" AS ENUM('finding', 'interpretation', 'portfolio', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."claim_owner" AS ENUM('direction', 'proposal_version', 'creator_fit');--> statement-breakpoint
CREATE TYPE "public"."direction_status" AS ENUM('active', 'set_aside');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('tag', 'entity', 'demographic', 'heatmap', 'compare', 'trend');--> statement-breakpoint
CREATE TYPE "public"."input_source" AS ENUM('research', 'team', 'assumption');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('sent', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'saved', 'quote_requested', 'offered', 'accepted', 'declined', 'set_aside');--> statement-breakpoint
CREATE TYPE "public"."qloo_kind" AS ENUM('entity', 'tag', 'audience');--> statement-breakpoint
CREATE TYPE "public"."resolution_status" AS ENUM('confirmed', 'needs_input', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."run_mode" AS ENUM('qloo', 'baseline');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'needs_input', 'done', 'error', 'cancelled');--> statement-breakpoint
CREATE TABLE "brief_input" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"text" text NOT NULL,
	"source" "input_source" NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"proposal_ids" uuid[] NOT NULL,
	"cost_cents" integer NOT NULL,
	"rationale" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'brief_draft' NOT NULL,
	"is_showcase" boolean DEFAULT false NOT NULL,
	"current_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"parent_revision_id" uuid,
	"change_note" text,
	"brief" jsonb NOT NULL,
	"campaign_type" "campaign_type" NOT NULL,
	"markets" text[] NOT NULL,
	"languages" text[] NOT NULL,
	"budget_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"owner_type" "claim_owner" NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "claim_kind" NOT NULL,
	"text" text NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "claim_finding_by_template" CHECK ("claim"."kind" <> 'finding' or "claim"."created_by" = 'template')
);
--> statement-breakpoint
CREATE TABLE "claim_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"evidence_id" uuid,
	"portfolio_item_id" uuid,
	"quote_id" uuid,
	"finding_claim_id" uuid,
	"field" text,
	CONSTRAINT "claim_binding_exactly_one" CHECK (num_nonnulls("claim_binding"."evidence_id", "claim_binding"."portfolio_item_id", "claim_binding"."quote_id", "claim_binding"."finding_claim_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "creator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"display_name" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"modes" text[] DEFAULT '{}' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"proposition" text,
	"avatar_url" text,
	"availability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"declined_categories" text[] DEFAULT '{}' NOT NULL,
	"audience_stats" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_fit" (
	"run_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"direction_id" uuid NOT NULL,
	"hard_constraints" jsonb NOT NULL,
	"capability" jsonb NOT NULL,
	"cultural_bands" jsonb NOT NULL,
	"shortlisted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "creator_fit_run_id_creator_id_direction_id_pk" PRIMARY KEY("run_id","creator_id","direction_id")
);
--> statement-breakpoint
CREATE TABLE "creator_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"label" text NOT NULL,
	"qloo_id" text,
	"qloo_type" text,
	"confirmed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_theme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"label" text NOT NULL,
	"tag_id" text,
	"confirmed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"title" text NOT NULL,
	"audience_context" text NOT NULL,
	"product_role" text NOT NULL,
	"art_direction" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"color_index" integer DEFAULT 1 NOT NULL,
	"status" "direction_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direction_check" (
	"direction_id" uuid NOT NULL,
	"kind" "check_kind" NOT NULL,
	"result" jsonb NOT NULL,
	"tested_inputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "direction_check_direction_id_kind_pk" PRIMARY KEY("direction_id","kind")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"actor_user_id" text,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"qloo_ref" text,
	"label" text NOT NULL,
	"values" jsonb NOT NULL,
	"rank" integer,
	"result_count" integer,
	"qloo_call_id" uuid
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_version_id" uuid NOT NULL,
	"from_organization_id" text NOT NULL,
	"to_organization_id" text NOT NULL,
	"status" "offer_status" DEFAULT 'sent' NOT NULL,
	"sent_by" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"image_url" text,
	"video_url" text,
	"role" text NOT NULL,
	"formats" text[] DEFAULT '{}' NOT NULL,
	"settings" text[] DEFAULT '{}' NOT NULL,
	"themes" text[] DEFAULT '{}' NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"direction_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"current_version_id" uuid,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"author_user_id" text,
	"author_role" text NOT NULL,
	"concept" jsonb NOT NULL,
	"deliverables" jsonb NOT NULL,
	"terms" jsonb NOT NULL,
	"hypothesis" text NOT NULL,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qloo_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qloo_call" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid,
	"run_id" uuid,
	"endpoint" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"latency_ms" integer NOT NULL,
	"cached" boolean NOT NULL,
	"cache_key" text NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"campaign_id" uuid,
	"package" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"usage_terms" text NOT NULL,
	"valid_until" timestamp with time zone,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolved_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"brief_input_id" uuid,
	"label" text NOT NULL,
	"qloo_kind" "qloo_kind" NOT NULL,
	"qloo_id" text,
	"qloo_type" text,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "resolution_status" DEFAULT 'needs_input' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"mode" "run_mode" DEFAULT 'qloo' NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"workflow_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_stage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "brief_input" ADD CONSTRAINT "brief_input_revision_id_campaign_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."campaign_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_package" ADD CONSTRAINT "budget_package_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_current_revision_id_campaign_revision_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."campaign_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_revision" ADD CONSTRAINT "campaign_revision_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_revision" ADD CONSTRAINT "campaign_revision_parent_revision_id_campaign_revision_id_fk" FOREIGN KEY ("parent_revision_id") REFERENCES "public"."campaign_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_binding" ADD CONSTRAINT "claim_binding_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_binding" ADD CONSTRAINT "claim_binding_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_binding" ADD CONSTRAINT "claim_binding_portfolio_item_id_portfolio_item_id_fk" FOREIGN KEY ("portfolio_item_id") REFERENCES "public"."portfolio_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_binding" ADD CONSTRAINT "claim_binding_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_binding" ADD CONSTRAINT "claim_binding_finding_claim_id_claim_id_fk" FOREIGN KEY ("finding_claim_id") REFERENCES "public"."claim"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_fit" ADD CONSTRAINT "creator_fit_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_fit" ADD CONSTRAINT "creator_fit_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_fit" ADD CONSTRAINT "creator_fit_direction_id_direction_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."direction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_reference" ADD CONSTRAINT "creator_reference_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_theme" ADD CONSTRAINT "creator_theme_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction" ADD CONSTRAINT "direction_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_check" ADD CONSTRAINT "direction_check_direction_id_direction_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."direction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_qloo_call_id_qloo_call_id_fk" FOREIGN KEY ("qloo_call_id") REFERENCES "public"."qloo_call"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_proposal_version_id_proposal_version_id_fk" FOREIGN KEY ("proposal_version_id") REFERENCES "public"."proposal_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_direction_id_direction_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."direction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_current_version_id_proposal_version_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."proposal_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_version" ADD CONSTRAINT "proposal_version_proposal_id_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qloo_call" ADD CONSTRAINT "qloo_call_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qloo_call" ADD CONSTRAINT "qloo_call_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolved_reference" ADD CONSTRAINT "resolved_reference_revision_id_campaign_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."campaign_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolved_reference" ADD CONSTRAINT "resolved_reference_brief_input_id_brief_input_id_fk" FOREIGN KEY ("brief_input_id") REFERENCES "public"."brief_input"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_revision_id_campaign_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."campaign_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_stage" ADD CONSTRAINT "run_stage_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_org_idx" ON "campaign" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_number_uq" ON "campaign_revision" USING btree ("campaign_id","number");--> statement-breakpoint
CREATE INDEX "claim_owner_idx" ON "claim" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "claim_binding_claim_idx" ON "claim_binding" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "direction_run_idx" ON "direction" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "event_campaign_idx" ON "event" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "evidence_run_idx" ON "evidence" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "proposal_run_idx" ON "proposal" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_version_number_uq" ON "proposal_version" USING btree ("proposal_id","number");--> statement-breakpoint
CREATE INDEX "qloo_call_campaign_idx" ON "qloo_call" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "qloo_call_run_idx" ON "qloo_call" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "resolved_reference_revision_idx" ON "resolved_reference" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_single_active_uq" ON "run" USING btree ("revision_id","mode") WHERE "run"."status" in ('pending', 'running', 'needs_input');--> statement-breakpoint
CREATE UNIQUE INDEX "run_stage_position_uq" ON "run_stage" USING btree ("run_id","position");