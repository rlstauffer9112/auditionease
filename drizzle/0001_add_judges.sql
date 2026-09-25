CREATE TABLE "judges" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer,
	"division_id" integer,
	"email" text NOT NULL,
	"added_by_user_id" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "judges_one_scope" CHECK (("judges"."owner_user_id" IS NULL) <> ("judges"."division_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "judges" ADD CONSTRAINT "judges_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judges" ADD CONSTRAINT "judges_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judges" ADD CONSTRAINT "judges_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "judges_owner_email_idx" ON "judges" USING btree ("owner_user_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "judges_division_email_idx" ON "judges" USING btree ("division_id","email");--> statement-breakpoint
CREATE INDEX "judges_email_idx" ON "judges" USING btree ("email");