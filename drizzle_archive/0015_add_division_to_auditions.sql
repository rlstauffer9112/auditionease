ALTER TABLE "auditions" ADD COLUMN "division_id" integer REFERENCES "divisions"("id");
--> statement-breakpoint
CREATE INDEX "auditions_division_id_idx" ON "auditions" ("division_id");
