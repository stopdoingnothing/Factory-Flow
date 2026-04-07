-- Half-day leave support
-- Adds start_half_day and end_half_day columns to leave_requests.
-- start_half_day: non-null means the first day is a half-day; value is 'AM' or 'PM'.
-- end_half_day:   non-null means the last day is a half-day; value is 'AM' or 'PM'.
-- For single-day requests only start_half_day is valid; end_half_day must be null.

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS start_half_day TEXT CHECK (start_half_day IN ('AM', 'PM'));
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS end_half_day   TEXT CHECK (end_half_day   IN ('AM', 'PM'));
