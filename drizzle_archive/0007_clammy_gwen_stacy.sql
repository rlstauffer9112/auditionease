CREATE TABLE "performer_custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"performer_id" integer NOT NULL,
	"custom_attribute_id" integer NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performer_custom_fields" ADD CONSTRAINT "performer_custom_fields_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performer_custom_fields" ADD CONSTRAINT "performer_custom_fields_custom_attribute_id_custom_attributes_id_fk" FOREIGN KEY ("custom_attribute_id") REFERENCES "public"."custom_attributes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "performer_custom_fields_unique_idx" ON "performer_custom_fields" USING btree ("performer_id","custom_attribute_id");--> statement-breakpoint
CREATE INDEX "performer_custom_fields_attribute_id_idx" ON "performer_custom_fields" USING btree ("custom_attribute_id");--> statement-breakpoint
ALTER TABLE "performers" DROP COLUMN "custom_fields";