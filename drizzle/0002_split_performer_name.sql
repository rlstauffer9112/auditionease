ALTER TABLE "performers" RENAME COLUMN "name" TO "first_name";
--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "last_name" text DEFAULT '' NOT NULL;
