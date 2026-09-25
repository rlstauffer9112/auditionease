ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;
--> statement-breakpoint
CREATE TABLE "subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "stripe_subscription_id" text NOT NULL,
  "plan" text NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "end_date" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" ("user_id");
--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_sub_id_idx" ON "subscriptions" ("stripe_subscription_id");
