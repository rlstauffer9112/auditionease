ALTER TABLE "auditions" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "auditions" SET "user_id" = 10 WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "auditions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auditions" ADD CONSTRAINT "auditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditions_user_id_idx" ON "auditions" USING btree ("user_id");