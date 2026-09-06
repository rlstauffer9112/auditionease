CREATE TABLE "audition_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"audition_id" integer,
	"performer_id" integer,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" text DEFAULT 'available',
	"score" integer,
	"feedback" text,
	"passed_to_callback" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "auditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"date" text NOT NULL,
	"location" text,
	"status" text DEFAULT 'open',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "callbacks" (
	"id" serial PRIMARY KEY NOT NULL,
	"audition_id" integer,
	"performer_id" integer,
	"scheduled_time" text,
	"notes" text,
	"final_decision" text DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE "custom_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" text,
	"required" boolean DEFAULT false,
	"order" integer DEFAULT 0
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
CREATE TABLE "performers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"voice_type" text,
	"experience" text,
	"notes" text,
	"custom_fields" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audition_slots" ADD CONSTRAINT "audition_slots_audition_id_auditions_id_fk" FOREIGN KEY ("audition_id") REFERENCES "public"."auditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audition_slots" ADD CONSTRAINT "audition_slots_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_audition_id_auditions_id_fk" FOREIGN KEY ("audition_id") REFERENCES "public"."auditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;