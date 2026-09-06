ALTER TABLE "performers" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "performers" SET "user_id" = 10 WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "performers" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "performers" ADD CONSTRAINT "performers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "performers_user_id_idx" ON "performers" USING btree ("user_id");