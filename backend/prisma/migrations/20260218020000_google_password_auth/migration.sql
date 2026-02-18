ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_key" ON "users"("google_id");
