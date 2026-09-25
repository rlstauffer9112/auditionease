-- NOT APPLIED. Production schema was synced with `drizzle-kit push` instead, so the data steps below never ran.
-- Kept for reference only; see drizzle/0000_baseline.sql.
-- Replace slot scoring + callbacks ("Sections") with multi-round weighted scoring.
BEGIN;
--> statement-breakpoint
CREATE TABLE "scoring_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id"),
  "division_id" integer REFERENCES "divisions"("id"),
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "scoring_templates_user_id_idx" ON "scoring_templates" ("user_id");
--> statement-breakpoint
CREATE INDEX "scoring_templates_division_id_idx" ON "scoring_templates" ("division_id");
--> statement-breakpoint
CREATE TABLE "scoring_template_criteria" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_id" integer NOT NULL REFERENCES "scoring_templates"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "max_score" numeric(10, 2) NOT NULL DEFAULT 10,
  "weight" numeric(10, 2) NOT NULL DEFAULT 1,
  "order" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX "scoring_template_criteria_template_id_idx" ON "scoring_template_criteria" ("template_id");
--> statement-breakpoint
CREATE TABLE "audition_rounds" (
  "id" serial PRIMARY KEY NOT NULL,
  "audition_id" integer NOT NULL REFERENCES "auditions"("id") ON DELETE CASCADE,
  "round_number" integer NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "advance_rule" text NOT NULL DEFAULT 'top_n',
  "advance_value" numeric(10, 2),
  "is_final" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "closed_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "audition_rounds_unique_idx" ON "audition_rounds" ("audition_id", "round_number");
--> statement-breakpoint
CREATE TABLE "round_criteria" (
  "id" serial PRIMARY KEY NOT NULL,
  "round_id" integer NOT NULL REFERENCES "audition_rounds"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "max_score" numeric(10, 2) NOT NULL DEFAULT 10,
  "weight" numeric(10, 2) NOT NULL DEFAULT 1,
  "order" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX "round_criteria_round_id_idx" ON "round_criteria" ("round_id");
--> statement-breakpoint
CREATE TABLE "round_participants" (
  "id" serial PRIMARY KEY NOT NULL,
  "round_id" integer NOT NULL REFERENCES "audition_rounds"("id") ON DELETE CASCADE,
  "audition_user_id" integer NOT NULL REFERENCES "audition_users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "manual_override" text,
  "notes" text,
  "scheduled_time" text,
  "final_score" numeric(12, 4),
  "rank" integer,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "round_participants_unique_idx" ON "round_participants" ("round_id", "audition_user_id");
--> statement-breakpoint
CREATE INDEX "round_participants_audition_user_id_idx" ON "round_participants" ("audition_user_id");
--> statement-breakpoint
CREATE TABLE "round_evaluations" (
  "id" serial PRIMARY KEY NOT NULL,
  "round_participant_id" integer NOT NULL REFERENCES "round_participants"("id") ON DELETE CASCADE,
  "judge_user_id" integer NOT NULL REFERENCES "users"("id"),
  "comment" text,
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "round_evaluations_unique_idx" ON "round_evaluations" ("round_participant_id", "judge_user_id");
--> statement-breakpoint
CREATE INDEX "round_evaluations_judge_user_id_idx" ON "round_evaluations" ("judge_user_id");
--> statement-breakpoint
CREATE TABLE "round_scores" (
  "id" serial PRIMARY KEY NOT NULL,
  "evaluation_id" integer NOT NULL REFERENCES "round_evaluations"("id") ON DELETE CASCADE,
  "round_criterion_id" integer NOT NULL REFERENCES "round_criteria"("id") ON DELETE CASCADE,
  "score" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "round_scores_unique_idx" ON "round_scores" ("evaluation_id", "round_criterion_id");
--> statement-breakpoint
CREATE INDEX "round_scores_criterion_id_idx" ON "round_scores" ("round_criterion_id");
--> statement-breakpoint

-- ===== Data migration =====

-- Make sure everyone in a callback is an audition participant.
INSERT INTO "audition_users" ("audition_id", "user_id")
SELECT DISTINCT c."audition_id", c."user_id" FROM "callbacks" c
WHERE c."audition_id" IS NOT NULL AND c."user_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Round 1 for every audition with participants, with a single "Overall" criterion.
INSERT INTO "audition_rounds" ("audition_id", "round_number", "title", "status")
SELECT DISTINCT au."audition_id", 1, 'Round 1', 'open' FROM "audition_users" au;
--> statement-breakpoint
INSERT INTO "round_criteria" ("round_id", "title", "max_score", "weight", "order")
SELECT r."id", 'Overall', 10, 1, 0 FROM "audition_rounds" r WHERE r."round_number" = 1;
--> statement-breakpoint
INSERT INTO "round_participants" ("round_id", "audition_user_id")
SELECT r."id", au."id" FROM "audition_users" au
JOIN "audition_rounds" r ON r."audition_id" = au."audition_id" AND r."round_number" = 1;
--> statement-breakpoint

-- Legacy slot score/feedback -> Round 1 evaluation by the audition owner (first completed slot).
INSERT INTO "round_evaluations" ("round_participant_id", "judge_user_id", "comment")
SELECT DISTINCT ON (rp."id") rp."id", a."user_id", s."feedback"
FROM "audition_slots" s
JOIN "auditions" a ON a."id" = s."audition_id"
JOIN "audition_users" au ON au."audition_id" = s."audition_id" AND au."user_id" = s."user_id"
JOIN "audition_rounds" r ON r."audition_id" = s."audition_id" AND r."round_number" = 1
JOIN "round_participants" rp ON rp."round_id" = r."id" AND rp."audition_user_id" = au."id"
WHERE s."status" = 'completed' AND s."score" IS NOT NULL
ORDER BY rp."id", s."id";
--> statement-breakpoint
INSERT INTO "round_scores" ("evaluation_id", "round_criterion_id", "score")
SELECT DISTINCT ON (e."id") e."id", rc."id", s."score"
FROM "round_evaluations" e
JOIN "round_participants" rp ON rp."id" = e."round_participant_id"
JOIN "round_criteria" rc ON rc."round_id" = rp."round_id"
JOIN "audition_users" au ON au."id" = rp."audition_user_id"
JOIN "audition_slots" s ON s."audition_id" = au."audition_id" AND s."user_id" = au."user_id"
  AND s."status" = 'completed' AND s."score" IS NOT NULL
ORDER BY e."id", s."id";
--> statement-breakpoint

-- Auditions that used callbacks: close Round 1 (callback people advanced) and open Round 2 with them.
UPDATE "round_participants" rp
SET "status" = CASE WHEN EXISTS (
    SELECT 1 FROM "callbacks" c
    WHERE c."audition_id" = au."audition_id" AND c."user_id" = au."user_id"
  ) THEN 'advanced' ELSE 'eliminated' END,
  "final_score" = (
    SELECT rs."score" FROM "round_evaluations" e
    JOIN "round_scores" rs ON rs."evaluation_id" = e."id"
    WHERE e."round_participant_id" = rp."id" LIMIT 1
  )
FROM "audition_users" au, "audition_rounds" r
WHERE au."id" = rp."audition_user_id" AND r."id" = rp."round_id" AND r."round_number" = 1
  AND r."audition_id" IN (SELECT "audition_id" FROM "callbacks" WHERE "audition_id" IS NOT NULL);
--> statement-breakpoint
UPDATE "round_participants" rp SET "rank" = ranked."rnk"
FROM (
  SELECT p."id", RANK() OVER (PARTITION BY p."round_id" ORDER BY COALESCE(p."final_score", 0) DESC) AS "rnk"
  FROM "round_participants" p
  JOIN "audition_rounds" r ON r."id" = p."round_id"
  WHERE r."round_number" = 1
    AND r."audition_id" IN (SELECT "audition_id" FROM "callbacks" WHERE "audition_id" IS NOT NULL)
) ranked
WHERE ranked."id" = rp."id";
--> statement-breakpoint
UPDATE "audition_rounds" SET "status" = 'closed', "closed_at" = now()
WHERE "round_number" = 1
  AND "audition_id" IN (SELECT "audition_id" FROM "callbacks" WHERE "audition_id" IS NOT NULL);
--> statement-breakpoint
INSERT INTO "audition_rounds" ("audition_id", "round_number", "title", "status")
SELECT DISTINCT c."audition_id", 2, 'Round 2', 'open' FROM "callbacks" c WHERE c."audition_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "round_criteria" ("round_id", "title", "max_score", "weight", "order")
SELECT r."id", 'Overall', 10, 1, 0 FROM "audition_rounds" r WHERE r."round_number" = 2;
--> statement-breakpoint
-- Callback decisions become manual overrides in the open Round 2.
INSERT INTO "round_participants" ("round_id", "audition_user_id", "manual_override", "notes", "scheduled_time")
SELECT DISTINCT ON (r."id", au."id") r."id", au."id",
  CASE c."final_decision" WHEN 'accepted' THEN 'advance' WHEN 'rejected' THEN 'exclude' ELSE NULL END,
  c."notes", c."scheduled_time"
FROM "callbacks" c
JOIN "audition_users" au ON au."audition_id" = c."audition_id" AND au."user_id" = c."user_id"
JOIN "audition_rounds" r ON r."audition_id" = c."audition_id" AND r."round_number" = 2
ORDER BY r."id", au."id", c."id";
--> statement-breakpoint

-- ===== Remove legacy scoring =====
DROP TABLE "callbacks";
--> statement-breakpoint
ALTER TABLE "audition_slots" DROP COLUMN "score";
--> statement-breakpoint
ALTER TABLE "audition_slots" DROP COLUMN "feedback";
--> statement-breakpoint
ALTER TABLE "audition_slots" DROP COLUMN "passed_to_callback";
--> statement-breakpoint
COMMIT;
