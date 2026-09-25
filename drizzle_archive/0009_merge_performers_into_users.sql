-- Step 1: Add phone and notes columns to users
ALTER TABLE "users" ADD COLUMN "phone" text;
ALTER TABLE "users" ADD COLUMN "notes" text;

-- Step 2: Create audition_users join table
CREATE TABLE IF NOT EXISTS "audition_users" (
  "id" serial PRIMARY KEY NOT NULL,
  "audition_id" integer NOT NULL REFERENCES "auditions"("id"),
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX "audition_users_unique_idx" ON "audition_users" USING btree ("audition_id", "user_id");
CREATE INDEX "audition_users_user_id_idx" ON "audition_users" USING btree ("user_id");

-- Step 3: Create audition_user_custom_fields table
CREATE TABLE IF NOT EXISTS "audition_user_custom_fields" (
  "id" serial PRIMARY KEY NOT NULL,
  "audition_user_id" integer NOT NULL REFERENCES "audition_users"("id"),
  "custom_attribute_id" integer NOT NULL REFERENCES "custom_attributes"("id"),
  "value" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "audition_user_custom_fields_unique_idx" ON "audition_user_custom_fields" USING btree ("audition_user_id", "custom_attribute_id");
CREATE INDEX "audition_user_custom_fields_attribute_id_idx" ON "audition_user_custom_fields" USING btree ("custom_attribute_id");

-- Step 4: Add new user_id columns to audition_slots and callbacks
ALTER TABLE "audition_slots" ADD COLUMN "user_id" integer REFERENCES "users"("id");
ALTER TABLE "callbacks" ADD COLUMN "user_id" integer REFERENCES "users"("id");

-- Step 5: Data migration - create users from performers that don't already exist
-- For performers whose email matches an existing user, we reuse that user.
-- For performers whose email does NOT match, we create a new user.
INSERT INTO "users" ("first_name", "last_name", "email", "phone", "notes", "created_at")
SELECT p."first_name", p."last_name", p."email", p."phone", p."notes", p."created_at"
FROM "performers" p
WHERE NOT EXISTS (
  SELECT 1 FROM "users" u WHERE lower(u."email") = lower(p."email")
);

-- Step 6: Create a temp mapping table from performer_id to user_id
CREATE TEMP TABLE performer_user_map AS
SELECT p."id" AS performer_id, u."id" AS user_id, p."user_id" AS organizer_id
FROM "performers" p
JOIN "users" u ON lower(u."email") = lower(p."email");

-- Step 7: Migrate audition_slots.performer_id -> user_id
UPDATE "audition_slots" s
SET "user_id" = m.user_id
FROM performer_user_map m
WHERE s."performer_id" = m.performer_id;

-- Step 8: Migrate callbacks.performer_id -> user_id
UPDATE "callbacks" c
SET "user_id" = m.user_id
FROM performer_user_map m
WHERE c."performer_id" = m.performer_id;

-- Step 9: Create audition_users entries from slots and callbacks
INSERT INTO "audition_users" ("audition_id", "user_id")
SELECT DISTINCT sub.audition_id, sub.user_id
FROM (
  SELECT s."audition_id", s."user_id"
  FROM "audition_slots" s
  WHERE s."user_id" IS NOT NULL AND s."audition_id" IS NOT NULL
  UNION
  SELECT c."audition_id", c."user_id"
  FROM "callbacks" c
  WHERE c."user_id" IS NOT NULL AND c."audition_id" IS NOT NULL
) sub
ON CONFLICT DO NOTHING;

-- Step 10: Migrate performer_custom_fields -> audition_user_custom_fields
-- We need to find the audition_user record for each performer.
-- A performer may appear in multiple auditions, so we pick one audition_user per performer.
-- Custom fields were global per performer, so we duplicate them for each audition participation.
INSERT INTO "audition_user_custom_fields" ("audition_user_id", "custom_attribute_id", "value", "updated_at")
SELECT au."id", pcf."custom_attribute_id", pcf."value", pcf."updated_at"
FROM "performer_custom_fields" pcf
JOIN performer_user_map m ON pcf."performer_id" = m.performer_id
JOIN "audition_users" au ON au."user_id" = m.user_id;

-- Step 11: Drop old performer_id columns
ALTER TABLE "audition_slots" DROP COLUMN "performer_id";
ALTER TABLE "callbacks" DROP COLUMN "performer_id";

-- Step 12: Drop old tables
DROP TABLE "performer_custom_fields";
DROP TABLE "performers";

-- Cleanup
DROP TABLE performer_user_map;
