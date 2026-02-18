CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE TABLE IF NOT EXISTS "otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "intent" VARCHAR(16) NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "otp_codes_user_intent_expires_idx" ON "otp_codes"("user_id", "intent", "expires_at");

DO $$
BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'otp_codes_user_id_fkey'
    ) THEN
      ALTER TABLE "otp_codes"
      ADD CONSTRAINT "otp_codes_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "user_id" UUID;

INSERT INTO "users" ("id", "email", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000001', 'legacy@local.invalid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

UPDATE "expenses"
SET "user_id" = '00000000-0000-0000-0000-000000000001'
WHERE "user_id" IS NULL;

ALTER TABLE "expenses" ALTER COLUMN "user_id" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'expenses_user_id_fkey'
    ) THEN
      ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DROP INDEX IF EXISTS "expenses_idempotency_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_user_id_idempotency_key_key" ON "expenses"("user_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "expenses_user_date_idx" ON "expenses"("user_id", "date");
CREATE INDEX IF NOT EXISTS "expenses_user_category_date_idx" ON "expenses"("user_id", "category", "date");
