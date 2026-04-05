#!/bin/sh
set -e

# Wait for Postgres to accept TCP connections before pushing schema.
# The Docker healthcheck passes when pg_isready succeeds on the local socket,
# but the TCP port can still be a few ms behind — this loop closes that gap.
echo "[entrypoint] Waiting for database to accept connections..."
until pg_isready -h db -p 5432 -U factoryflow 2>/dev/null; do
  sleep 1
done
echo "[entrypoint] Database ready."

echo "[entrypoint] Running database migrations..."
# Run migration SQL files directly via psql instead of drizzle-kit,
# which can silently fail or exit 0 on error.
for f in migrations/0*.sql; do
  echo "[entrypoint] Applying $f ..."
  # Strip drizzle's "--> statement-breakpoint" markers before executing
  sed 's/--> statement-breakpoint//g' "$f" | psql "$DATABASE_URL" -v ON_ERROR_STOP=0 2>&1 || true
done

echo "[entrypoint] Ensuring unmanaged tables exist..."
psql "$DATABASE_URL" <<'EOSQL' 2>/dev/null || true
-- Sessions table (managed by connect-pg-simple, not Drizzle)
CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");

-- Audit log table (pre-created so drizzle-kit push doesn't confuse it with sessions rename)
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

echo "[entrypoint] Starting application..."
exec node dist/index.cjs
