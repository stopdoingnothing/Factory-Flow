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

echo "[entrypoint] Running database schema push..."
npx drizzle-kit push --config=drizzle.config.ts

echo "[entrypoint] Starting application..."
exec node dist/index.cjs
