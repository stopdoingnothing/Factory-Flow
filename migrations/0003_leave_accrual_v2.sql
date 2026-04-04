-- Leave Accrual Engine v2 Migration
-- Implements spec v1.3: rate tiers, per-employee override, accrual-pausing leave,
-- idempotency, sick leave tracking, cycle_anchor, and a dedicated accrual audit table.

-- ── Users: new accrual fields ─────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_days_per_week" integer NOT NULL DEFAULT 5;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "annual_leave_override_days" real;

-- ── Leave Rules: new accrual configuration fields ─────────────────────────────
ALTER TABLE "leave_rules" ADD COLUMN IF NOT EXISTS "pauses_annual_accrual" boolean NOT NULL DEFAULT false;
ALTER TABLE "leave_rules" ADD COLUMN IF NOT EXISTS "cycle_anchor" text NOT NULL DEFAULT 'calendar_year';

-- ── Accrual Rate Tiers (system-wide, HR-editable) ────────────────────────────
CREATE TABLE IF NOT EXISTS "accrual_rate_tiers" (
  "id" serial PRIMARY KEY NOT NULL,
  "min_months_of_service" integer NOT NULL,
  "annual_entitlement_days" real NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Seed default tiers: Tier 1 (0+ months = 15 days/yr), Tier 2 (24+ months = 20 days/yr)
INSERT INTO "accrual_rate_tiers" ("min_months_of_service", "annual_entitlement_days")
VALUES (0, 15), (24, 20)
ON CONFLICT DO NOTHING;

-- ── Sick Leave Tracking (per employee) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sick_leave_tracking" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "sick_cycle_start_date" text NOT NULL,         -- 'yyyy-MM-dd', anchored to employment_start_date
  "graduated_accrual_active" boolean NOT NULL DEFAULT true,
  "cumulative_days_worked" integer NOT NULL DEFAULT 0,
  "graduated_days_credited" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ── Leave Accrual Records (idempotency + accrual audit trail) ─────────────────
-- Each row represents one accrual event. The unique constraint on
-- (employee_id, leave_type, accrual_period, event_type) enforces idempotency.
CREATE TABLE IF NOT EXISTS "leave_accrual_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "leave_type" text NOT NULL,
  "accrual_period" text NOT NULL,                -- 'YYYY-MM' of the period being credited
  "event_type" text NOT NULL,                    -- see spec §12 event_type enum
  "amount" real NOT NULL,
  "balance_before" real NOT NULL,
  "balance_after" real NOT NULL,
  "calculation_basis" text,
  "triggered_by" text NOT NULL DEFAULT 'system', -- 'system' or user_id
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("employee_id", "leave_type", "accrual_period", "event_type")
);
