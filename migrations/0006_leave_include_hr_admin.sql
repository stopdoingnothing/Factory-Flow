-- Stop treating "has an hr/admin role" as "excluded from leave".
--
-- POST/PATCH /api/users used to force `exclude_from_leave = true` on anyone holding an hr or admin
-- role, which silently dropped HR managers and admins out of the leave tool: no balances, no
-- accrual, absent from the leave lists. That override is gone from server/routes.ts; this migration
-- repairs the users it already stamped.
--
-- Only users who look like real employees are touched (a start date, not terminated). Contractors
-- and system accounts deliberately switched off in Personnel have no hr/admin role, so they are
-- untouched either way.
--
-- docker-entrypoint.sh replays every migration on each boot, so this is guarded by a marker row in
-- `settings`. Without it, an admin who legitimately excludes an HR user from leave would find the
-- switch flipped back on the next restart.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings WHERE key = 'migration_0006_leave_include_hr_admin') THEN
    UPDATE users
    SET exclude_from_leave = false
    WHERE exclude_from_leave IS TRUE
      AND roles && ARRAY['hr', 'admin']::text[]
      AND start_date IS NOT NULL
      AND termination_date IS NULL;

    INSERT INTO settings (key, value) VALUES ('migration_0006_leave_include_hr_admin', 'applied');
  END IF;
END $$;
