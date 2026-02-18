CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "expenses_category_lower_trgm_idx"
ON "expenses" USING GIN (LOWER("category") gin_trgm_ops);
