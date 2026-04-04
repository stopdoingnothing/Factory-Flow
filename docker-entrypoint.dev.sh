#!/bin/sh
set -e

echo "[entrypoint:dev] Waiting for database..."
until pg_isready -h db -p 5432 -U factoryflow 2>/dev/null; do
  sleep 1
done
echo "[entrypoint:dev] Database ready."

echo "[entrypoint:dev] Running database migrations..."
npx drizzle-kit migrate --config=drizzle.config.ts

echo "[entrypoint:dev] Ensuring unmanaged tables exist..."
psql "$DATABASE_URL" <<'EOSQL' 2>/dev/null || true
CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY,
  "timestamp" timestamp NOT NULL DEFAULT now(),
  "actor_id" text,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "changes" jsonb,
  "description" text
);
CREATE INDEX IF NOT EXISTS "audit_logs_timestamp_idx" ON "audit_logs" ("timestamp" DESC);
EOSQL

echo "[entrypoint:dev] Starting dev server with HMR..."
exec npm run dev
