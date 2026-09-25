CREATE TABLE "organizations" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "owner_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "organizations_owner_id_idx" ON "organizations" ("owner_id");
--> statement-breakpoint
CREATE TABLE "org_users" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "role" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "invite_token" text UNIQUE,
  "invited_at" timestamp DEFAULT now(),
  "accepted_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "org_users_unique_idx" ON "org_users" ("organization_id", "user_id");
--> statement-breakpoint
CREATE INDEX "org_users_user_id_idx" ON "org_users" ("user_id");
--> statement-breakpoint
CREATE INDEX "org_users_org_id_idx" ON "org_users" ("organization_id");
--> statement-breakpoint
CREATE TABLE "divisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "divisions_org_id_idx" ON "divisions" ("organization_id");
--> statement-breakpoint
CREATE TABLE "division_users" (
  "id" serial PRIMARY KEY NOT NULL,
  "division_id" integer NOT NULL REFERENCES "divisions"("id"),
  "user_id" integer NOT NULL REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "division_users_unique_idx" ON "division_users" ("division_id", "user_id");
--> statement-breakpoint
CREATE INDEX "division_users_division_id_idx" ON "division_users" ("division_id");
--> statement-breakpoint
CREATE INDEX "division_users_user_id_idx" ON "division_users" ("user_id");
