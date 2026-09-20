CREATE TABLE "attribute_sets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "attribute_sets_user_id_idx" ON "attribute_sets" ("user_id");
--> statement-breakpoint
CREATE TABLE "attribute_set_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "attribute_set_id" integer NOT NULL REFERENCES "attribute_sets"("id"),
  "custom_attribute_id" integer NOT NULL REFERENCES "custom_attributes"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_set_items_unique_idx" ON "attribute_set_items" ("attribute_set_id", "custom_attribute_id");
--> statement-breakpoint
CREATE INDEX "attribute_set_items_set_id_idx" ON "attribute_set_items" ("attribute_set_id");
--> statement-breakpoint
ALTER TABLE "auditions" ADD COLUMN "attribute_set_id" integer REFERENCES "attribute_sets"("id");
