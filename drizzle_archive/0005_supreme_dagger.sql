ALTER TABLE "custom_attributes" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "custom_attributes" SET "user_id" = 10 WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "custom_attributes" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_attributes" ADD CONSTRAINT "custom_attributes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_attributes_user_id_idx" ON "custom_attributes" USING btree ("user_id");