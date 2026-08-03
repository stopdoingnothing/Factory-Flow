-- Multi-role RBAC: users.roles
--
-- `roles` is the authorisation source of truth — requireRole() in server/routes.ts checks it, and
-- every getUser() SELECT names the column, so a database missing it fails with 42703 on login.
-- Until now the column was created only by a runtime `ALTER TABLE` inside registerRoutes(), which
-- means a fresh database was briefly broken between `psql migrations/0*.sql` and the app's first
-- successful boot. This pins it to the migration set that docker-entrypoint.sh actually applies.
--
-- The backfill mirrors deriveRolesFromLegacy() in shared/roles.ts and the runtime backfill in
-- server/routes.ts. All three must stay semantically identical: if they diverge, a restored database
-- ends up in a different state depending on whether the app happened to restart.

ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['employee']::text[];

-- Only touches users still sitting on the column default, so re-running this never demotes anyone
-- whose roles were edited in the app.
UPDATE users SET roles =
  CASE
    WHEN admin_role IS NOT NULL THEN ARRAY['employee','manager','admin']::text[]
    WHEN role = 'manager'       THEN ARRAY['employee','manager']::text[]
    ELSE                             ARRAY['employee']::text[]
  END
WHERE roles = ARRAY['employee']::text[];
