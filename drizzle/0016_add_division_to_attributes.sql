ALTER TABLE "custom_attributes" ADD COLUMN "division_id" integer REFERENCES "divisions"("id");
--> statement-breakpoint
CREATE INDEX "custom_attributes_division_id_idx" ON "custom_attributes" ("division_id");
--> statement-breakpoint
ALTER TABLE "attribute_sets" ADD COLUMN "division_id" integer REFERENCES "divisions"("id");
--> statement-breakpoint
CREATE INDEX "attribute_sets_division_id_idx" ON "attribute_sets" ("division_id");
