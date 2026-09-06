ALTER TABLE "auditions" ADD COLUMN "invite_code" text;--> statement-breakpoint
UPDATE "auditions" SET "invite_code" = upper(substr(md5(random()::text), 1, 6)) WHERE "invite_code" IS NULL;--> statement-breakpoint
ALTER TABLE "auditions" ALTER COLUMN "invite_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auditions" ADD CONSTRAINT "auditions_invite_code_unique" UNIQUE("invite_code");
