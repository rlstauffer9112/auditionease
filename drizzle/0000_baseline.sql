CREATE TABLE "attribute_set_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"attribute_set_id" integer NOT NULL,
	"custom_attribute_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribute_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"division_id" integer,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audition_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"audition_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"advance_rule" text DEFAULT 'top_n' NOT NULL,
	"advance_value" numeric(10, 2),
	"is_final" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "audition_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"audition_id" integer,
	"user_id" integer,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" text DEFAULT 'available'
);
--> statement-breakpoint
CREATE TABLE "audition_user_custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"audition_user_id" integer NOT NULL,
	"custom_attribute_id" integer NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audition_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"audition_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"date" text NOT NULL,
	"location" text,
	"status" text DEFAULT 'open',
	"invite_code" text NOT NULL,
	"attribute_set_id" integer,
	"division_id" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "auditions_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "custom_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"division_id" integer,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" text,
	"required" boolean DEFAULT false,
	"order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "division_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"division_id" integer NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "login_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "org_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invite_token" text,
	"invited_at" timestamp DEFAULT now(),
	"accepted_at" timestamp,
	CONSTRAINT "org_users_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"criteria" text DEFAULT '[]' NOT NULL,
	"columns" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "round_criteria" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"max_score" numeric(10, 2) DEFAULT 10 NOT NULL,
	"weight" numeric(10, 2) DEFAULT 1 NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_participant_id" integer NOT NULL,
	"judge_user_id" integer NOT NULL,
	"comment" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "round_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"audition_user_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"manual_override" text,
	"notes" text,
	"scheduled_time" text,
	"final_score" numeric(12, 4),
	"rank" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "round_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"evaluation_id" integer NOT NULL,
	"round_criterion_id" integer NOT NULL,
	"score" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_template_criteria" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"max_score" numeric(10, 2) DEFAULT 10 NOT NULL,
	"weight" numeric(10, 2) DEFAULT 1 NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"division_id" integer,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"plan" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp NOT NULL,
	"cancelled_on" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"notes" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attribute_set_items" ADD CONSTRAINT "attribute_set_items_attribute_set_id_attribute_sets_id_fk" FOREIGN KEY ("attribute_set_id") REFERENCES "public"."attribute_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_set_items" ADD CONSTRAINT "attribute_set_items_custom_attribute_id_custom_attributes_id_fk" FOREIGN KEY ("custom_attribute_id") REFERENCES "public"."custom_attributes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_sets" ADD CONSTRAINT "attribute_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_sets" ADD CONSTRAINT "attribute_sets_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audition_rounds" ADD CONSTRAINT "audition_rounds_audition_id_auditions_id_fk" FOREIGN KEY ("audition_id") REFERENCES "public"."auditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audition_slots" ADD CONSTRAINT "audition_slots_audition_id_auditions_id_fk" FOREIGN KEY ("audition_id") REFERENCES "public"."auditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audition_slots" ADD CONSTRAINT "audition_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audition_user_custom_fields" ADD CONSTRAINT "audition_user_custom_fields_audition_user_id_audition_users_id_fk" FOREIGN KEY ("audition_user_id") REFERENCES "public"."audition_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audition_user_custom_fields" ADD CONSTRAINT "audition_user_custom_fields_custom_attribute_id_custom_attributes_id_fk" FOREIGN KEY ("custom_attribute_id") REFERENCES "public"."custom_attributes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audition_users" ADD CONSTRAINT "audition_users_audition_id_auditions_id_fk" FOREIGN KEY ("audition_id") REFERENCES "public"."auditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audition_users" ADD CONSTRAINT "audition_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditions" ADD CONSTRAINT "auditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditions" ADD CONSTRAINT "auditions_attribute_set_id_attribute_sets_id_fk" FOREIGN KEY ("attribute_set_id") REFERENCES "public"."attribute_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditions" ADD CONSTRAINT "auditions_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_attributes" ADD CONSTRAINT "custom_attributes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_attributes" ADD CONSTRAINT "custom_attributes_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "division_users" ADD CONSTRAINT "division_users_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "division_users" ADD CONSTRAINT "division_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_users" ADD CONSTRAINT "org_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_users" ADD CONSTRAINT "org_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_criteria" ADD CONSTRAINT "round_criteria_round_id_audition_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."audition_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_evaluations" ADD CONSTRAINT "round_evaluations_round_participant_id_round_participants_id_fk" FOREIGN KEY ("round_participant_id") REFERENCES "public"."round_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_evaluations" ADD CONSTRAINT "round_evaluations_judge_user_id_users_id_fk" FOREIGN KEY ("judge_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_participants" ADD CONSTRAINT "round_participants_round_id_audition_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."audition_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_participants" ADD CONSTRAINT "round_participants_audition_user_id_audition_users_id_fk" FOREIGN KEY ("audition_user_id") REFERENCES "public"."audition_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_scores" ADD CONSTRAINT "round_scores_evaluation_id_round_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."round_evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_scores" ADD CONSTRAINT "round_scores_round_criterion_id_round_criteria_id_fk" FOREIGN KEY ("round_criterion_id") REFERENCES "public"."round_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_template_criteria" ADD CONSTRAINT "scoring_template_criteria_template_id_scoring_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."scoring_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_templates" ADD CONSTRAINT "scoring_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_templates" ADD CONSTRAINT "scoring_templates_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_set_items_unique_idx" ON "attribute_set_items" USING btree ("attribute_set_id","custom_attribute_id");--> statement-breakpoint
CREATE INDEX "attribute_set_items_set_id_idx" ON "attribute_set_items" USING btree ("attribute_set_id");--> statement-breakpoint
CREATE INDEX "attribute_sets_user_id_idx" ON "attribute_sets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attribute_sets_division_id_idx" ON "attribute_sets" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audition_rounds_unique_idx" ON "audition_rounds" USING btree ("audition_id","round_number");--> statement-breakpoint
CREATE UNIQUE INDEX "audition_user_custom_fields_unique_idx" ON "audition_user_custom_fields" USING btree ("audition_user_id","custom_attribute_id");--> statement-breakpoint
CREATE INDEX "audition_user_custom_fields_attribute_id_idx" ON "audition_user_custom_fields" USING btree ("custom_attribute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audition_users_unique_idx" ON "audition_users" USING btree ("audition_id","user_id");--> statement-breakpoint
CREATE INDEX "audition_users_user_id_idx" ON "audition_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auditions_user_id_idx" ON "auditions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auditions_division_id_idx" ON "auditions" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "custom_attributes_user_id_idx" ON "custom_attributes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "custom_attributes_division_id_idx" ON "custom_attributes" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "division_users_unique_idx" ON "division_users" USING btree ("division_id","user_id");--> statement-breakpoint
CREATE INDEX "division_users_division_id_idx" ON "division_users" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "division_users_user_id_idx" ON "division_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "divisions_org_id_idx" ON "divisions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_users_unique_idx" ON "org_users" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "org_users_user_id_idx" ON "org_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "org_users_org_id_idx" ON "org_users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organizations_owner_id_idx" ON "organizations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "reports_user_id_idx" ON "reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "round_criteria_round_id_idx" ON "round_criteria" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_evaluations_unique_idx" ON "round_evaluations" USING btree ("round_participant_id","judge_user_id");--> statement-breakpoint
CREATE INDEX "round_evaluations_judge_user_id_idx" ON "round_evaluations" USING btree ("judge_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_participants_unique_idx" ON "round_participants" USING btree ("round_id","audition_user_id");--> statement-breakpoint
CREATE INDEX "round_participants_audition_user_id_idx" ON "round_participants" USING btree ("audition_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_scores_unique_idx" ON "round_scores" USING btree ("evaluation_id","round_criterion_id");--> statement-breakpoint
CREATE INDEX "round_scores_criterion_id_idx" ON "round_scores" USING btree ("round_criterion_id");--> statement-breakpoint
CREATE INDEX "scoring_template_criteria_template_id_idx" ON "scoring_template_criteria" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "scoring_templates_user_id_idx" ON "scoring_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scoring_templates_division_id_idx" ON "scoring_templates" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_sub_id_idx" ON "subscriptions" USING btree ("stripe_subscription_id");