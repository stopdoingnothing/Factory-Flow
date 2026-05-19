# SDN Branch Work Report

**Author:** Shaun Bennet (stopdoingnothing)
**Period:** April 1–8, 2026
**Commits:** 67
**Scope:** Infrastructure, hardening, compliance, RBAC, leave engine, theme system, deployment tooling

---

## Feature Overview

### Core Domain: Leave Management

1. **BCEA Leave Accrual Engine** — Full South African labour law compliance. Monthly pro-rated annual leave accrual, graduated sick leave in the first 6 months with transition to full entitlement, family responsibility leave gating, accrual-pausing leave types, carry-over with configurable grace/forfeiture, backdated backfill, and termination settlement.

2. **Custom Leave Rules Engine** — Configurable rules for non-BCEA types (study leave, religious leave, etc.) with phase-based entitlement that activates at tenure milestones. Supports 4 accrual modes: per-days-worked, monthly, annual, and fixed-per-cycle.

3. **Future Leave Projection** — Advisory engine that simulates future balances month-by-month without DB writes. Detects cycle resets, calculates carry-over, and settles pending requests. Powers a progressive UI that shows current balance immediately and refines with projected values.

4. **Half-Day Leave** — AM/PM toggles on leave requests, reducing totals by 0.5 days each. Carries through to settlement.

5. **Server-Side Leave Hardening** — Statutory type enforcement, unpaid leave 7-day notice, medical certificate triggers/enforcement, overlap detection, 8-hour escalation reminders, optional HR approval stage, and an HR reporting endpoint.

### Access Control

6. **Multi-Role RBAC** — Replaced legacy single-role fields with additive `roles[]` array (`employee`, `manager`, `hr`, `admin`). Migrated across all auth, leave, org chart, and profile code. Passwords stripped from API responses.

7. **Configurable Role Permissions** — Runtime permission map stored in settings. `canSee()` / `canDo()` hook with admin bypass. Checkbox grid UI for configuration. Guards dashboard nav items and personnel actions.

### Infrastructure

8. **Docker Deployment** — Multi-stage Dockerfile, 3 deployment profiles (dev with live reload, UAT with isolated ports/data, production with pre-built GHCR image). PostgreSQL 16 with health checks. Entrypoints handle migration, table pre-creation, and startup.

9. **Deployment Tooling** — Makefile (setup, start, stop, update, backup, restore, reset), first-run setup.sh wizard, `.gitattributes` for LF enforcement, CRLF stripping in Docker build, raw SQL migrations via psql.

10. **Backup & Bootstrap** — Automated 6-hourly `pg_dump` with 90-day retention. JSON export/import with bootstrap detection for fresh deployments. Selective exclusion of face descriptors, attendance photos, audit logs, and sessions. Idempotent import in dependency order with date string revival.

### Observability & Quality

11. **Audit Log** — JSONB diff tracking for user profile changes, leave balance adjustments, approval decisions, and settings mutations. Actor, entity, and timestamp indexed.

12. **In-App Feedback** — Bug report / feature request modal with localStorage queueing, exponential backoff retry, and Agent Gateway integration that creates GitHub Issues. Graceful degradation when gateway is unavailable.

### UI/UX

13. **Semantic Theme Tokens** — All hardcoded palette colors migrated to HSL CSS custom properties with light/dark variants. Industrial aesthetic (dark red, black, greys) with status color system and utility classes.

---

## Context

The Factory Flow (AECE Checkpoint) codebase was originally developed on Replit under the `quanga01` author (362 commits, Dec 4 2025 – Mar 31 2026). On April 1 2026 the repository was brought onto the stopdoingnothing profile and development continued under `Shaun Bennet`. This report covers the 67 commits contributed during that period.

---

## Day-by-Day Breakdown

### Day 1 — Apr 1: Infrastructure & Leave Hardening (18 commits)

#### Docker & Deployment
- `e842a97` — Docker setup for on-prem deployment (Dockerfile, compose files, entrypoint)
- `4833290` — README with setup and deployment instructions
- `26a214d` — Simplified README (SESSION_SECRET optional)
- `f361554` — Outstanding infrastructure and schema changes committed

#### Leave System — Server-side Hardening
- `09fc709` — Server-side leave validation and statutory leave types
- `cef85ba` — Sick leave probationary rule rewritten to strictly follow BCEA Section 22
- `d6257a3` — Unpaid leave 7-day notice validation with discretion bypass
- `824cf08` — Medical certificate flag triggers on sick leave submission
- `0e7bffc` — Custom leave rule execution engine
- `c732e32` — Enforce medical certificate upload before HR approval of sick leave
- `3b572ff` — Carry-over grace period made configurable via settings
- `cafe3e1` — HR approval stage made optional via setting
- `ba10fa7` — HR leave reporting endpoint (`GET /api/reports/leave`)
- `441f93a` — Fixed inflated leave balance totals

#### Security & Compliance
- `cd1e1e4` — Server-side session auth enforcement
- `32ab5d9` — Audit log for sensitive admin mutations
- `0df1953` — Leave escalation reminder scheduler (every 8 hours)

#### Backup
- `0570ad0` — Database backup page with full export (including org_positions and companies)

---

### Day 2 — Apr 2: Seed Data (1 commit)

- `19254a1` — Seed org setup data and fix leave balance provisioning

---

### Day 3 — Apr 3: RBAC & Kiosk (3 commits)

- `bc77a6e` — Fixed profile setup modal reappearing after photo captured
- `d5091f9` — Multi-role RBAC system, employee self-service sections, kiosk improvements
- `21ca8ff` — Home-page backup restore with bootstrap support, misc dashboard updates

---

### Day 4 — Apr 4: Leave Accrual Engine & RBAC Migration (15 commits)

#### BCEA Leave Accrual Engine
- `68a77d4` — Implemented BCEA-compliant leave accrual engine, fixed profile page
- `0dd9aa6` — Fixed double-counting of annual leave on backdated employee creation

#### Leave UI
- `378fa84` — Leave request form validation improvements, show available balance
- `d94b576` — Fixed zero rendering artifact on leave balance cards
- `6ddc0b0` — Fixed stray '0' rendered when carryOverDays is 0
- `7f0d698` — Bypass React Query stale cache for fresh leave balances
- `5304dc3` — `formatLeaveDays` helper applied across displays; fixed manager filter
- `4ffe7fb` — Card-based leave type selector (replaced dropdown)
- `c3609b7` — Standard/Other leave balance grouping on employee dashboard

#### RBAC Migration (legacy → roles[])
- `92615c9` — Replaced `adminRole`/`userRole` with `roles[]` throughout auth and leave APIs
- `20a5f21` — Migrated OrgChart and MyProfileSection to `roles[]`
- `4f02895` — Migrated all role checks to `roles[]`, stripped passwords from API responses
- `80ab9d5` — Simplified reporting chain, hardened auth sessions, improved leave UI

#### Dashboard
- `f10bb41` — Embedded OrgChart and AttendanceReports into dashboard sidebar layout

---

### Day 5 — Apr 5: Deployment Hardening (12 commits)

#### Deployment Tooling
- `2826673` — `.gitattributes` to enforce LF line endings for shell scripts
- `fa7950c` — Streamlined deployment tooling (Makefile, setup scripts)
- `9258995` — Strip CRLF from entrypoint during Docker build
- `5aa781f` — Run migrations via raw SQL/psql instead of drizzle-kit

#### Backup/Restore Robustness
- `ffc9201` — Moved backup validation client-side (fix restore on new systems)
- `0207287` — Fixed bootstrap detection, excluded face descriptors from backups
- `a5b8565` — Stripped attendance photos from backup exports
- `6535d8b` — Allowed bootstrap restore routes through auth middleware
- `2b5780f` — Raw SQL count for bootstrap endpoints instead of `getAllUsers`
- `ca3edfa` — Logged user import failures instead of swallowing silently
- `40c50cb` — Revived date strings to Date objects during backup import

---

### Day 6 — Apr 6: Leave UX Polish (1 commit)

- `f3ec00c` — Improved leave display, manager visibility, and rules dialog UX

---

### Day 7 — Apr 7: Leave Projection & Half-Day Leave (12 commits)

#### Major Features
- `d535500` — Future leave accrual projection engine
- `52e08ef` — Half-day leave support

#### Leave Balance Fixes
- `8e3e3e6` — Fixed phantom carry-over, overlap detection, added in-app feedback
- `d03c1fc` — Balance check uses projected balance, cleaned up floating point display
- `1b82523` — Fixed balance indicator racing against projection load
- `c0571c8` — Deferred over-limit indicator to projection panel
- `16a7cf9` — Spinner while projection loads; use projectedAvailable once resolved
- `b424ca7` — Balance badge shows immediately, refines with projection when loaded
- `2c984cb` — Projected balance debug label in projection panel header
- `d65e935` — Fixed TDZ bug in projection, corrected available formula, improved trigger logic

#### Documentation
- `e640ed9` — Updated SAD docs to reflect leave projection fixes

---

### Day 8 — Apr 8: Theme System, Permissions & Feedback (7 commits)

#### Feedback System
- `9b48c74` — Moved feedback button to header top-right next to theme toggle
- `1cdd69d` — Feedback icon button positioned furthest right, no label
- `3021778` — Button styled to match theme toggle (outline variant, icon size)
- `cdf1796` — Feedback/gateway env vars added to compose files

#### Theme System
- `07d74aa` — Migrated all hardcoded palette colors to semantic theme tokens
- `bb6f74a` — Updated SAD docs to document semantic theme token system

#### Permissions & Config
- `bab0df2` — Configurable role permissions system
- `a55dd88` — Compose project names added, `.env.uat` ignored

---

## Summary by Category

| Area | Commits | Highlights |
|------|---------|------------|
| Leave System | 25 | BCEA accrual engine, projection, half-day, custom rules, server-side validation |
| RBAC & Security | 8 | `roles[]` migration, audit log, session auth, password stripping |
| Docker & Deployment | 12 | Dockerfile, 4 compose files, Makefile, migration via psql, CRLF fixes |
| Backup & Restore | 8 | Bootstrap support, client-side validation, photo/descriptor exclusion |
| UI/UX | 7 | Semantic theme tokens, feedback button, card-based selectors |
| Permissions | 1 | Configurable role permissions system |
| Documentation | 3 | README, SAD updates for projection and theme system |
| Misc Fixes | 3 | Profile modal, seed data, org chart embedding |

---

## Feature Details

### 1. BCEA-Compliant Leave Accrual Engine

**Files:** `server/bcea.ts`, `server/leave-accrual.ts`

A pure-logic layer implementing South African Basic Conditions of Employment Act leave calculations, with all database access delegated to the accrual orchestration layer.

**Core Capabilities:**

- **Annual Leave Accrual** — Monthly accrual calculated as `rate x (activeDays / totalDays)`. Rate resolved via priority chain: per-employee override > highest qualifying tenure tier > fallback (15 days/yr). No rounding; exact decimals stored per spec.
- **Graduated Sick Leave (First 6 Months)** — Accrues 1 day per 26 days worked during the probationary period, with cumulative counters for idempotency. At the 6-month mark, transitions to full entitlement: `30 x (workDaysPerWeek / 5)` minus days already taken.
- **Family Responsibility Leave** — 3-day grant at the 4-month mark, conditional on `completedMonths >= 4` and `workDaysPerWeek >= 4`.
- **Accrual-Pausing Leave Types** — Unpaid, Maternity, Parental, Adoption, and Commissioning leave days are deducted from active days in a month, reducing pro-rated accrual.
- **Carry-Over** — Configurable grace period (default 6 months after annual cycle end). Expired carry-over is forfeited.
- **Backfill** — When an employee is created with a past start date, all completed months are backfilled idempotently via unique constraint on `(employeeId, leaveType, accrualPeriod, eventType)`.
- **Termination Settlement** — Pro-rated accrual for mid-month termination with immediate balance update and HR notification.

**Statutory Entitlements:** Maternity (87 days), Parental (10), Adoption (50), Commissioning (50).

---

### 2. Custom Leave Rules Engine

**File:** `server/custom-leave-rules.ts`

Handles non-BCEA leave types (e.g., study leave, religious leave) via a configurable rule/phase system that runs alongside the BCEA engine.

- **Phase-Based Entitlement** — Each rule can have multiple phases with different accrual settings that activate at tenure milestones. The engine resolves the most advanced phase the employee qualifies for.
- **Four Accrual Types:**
  - `per_days_worked` — `floor(approx_working_days / periodDaysWorked) x daysEarned`
  - `monthly` — `daysEarned x totalMonths`
  - `annual` — `daysEarned x completedYears`
  - `fixed_per_cycle` — flat allocation per cycle
- **Max Accrual Cap** — Optional ceiling per rule. Values rounded to 1 decimal place.
- Only updates existing balances — HR/Admin must manually activate leave types for employees.

---

### 3. Future Leave Accrual Projection

**File:** `server/leave-projection.ts`

Advisory-only engine that simulates future balances without writing to the database. Used to show employees what their balance will be at a future date.

**Algorithm:**
1. Loads current balances, leave rules, holidays, accrual tiers, and active requests
2. Builds month range from last accrued month through to the target date
3. For each month: determines tenure-based accrual rate, counts pausing leave days, calculates pro-rated accrual via BCEA formula
4. Detects annual cycle resets and computes carry-over
5. Simulates settlement of pending requests with start dates before the target date

**Output:** `currentAvailable`, `projectedAvailable`, `projectedAccrual`, `cycleResetOccurs`, `carryOverCreated`, `carryOverExpiry`, `monthsProjected`, and a per-month `breakdown[]`.

**UI Behaviour:** Balance badge shows immediately with the current value, then refines with the projected value once the calculation completes. A spinner indicates loading. The over-limit indicator is deferred to the projection panel when active.

---

### 4. Half-Day Leave

**Schema:** `startHalfDay` and `endHalfDay` columns (enum: `'AM' | 'PM' | null`).

- Each half-day flag reduces the requested total by 0.5 days (e.g., 3 working days with an AM start = 2.5 days)
- Single-day requests use `startHalfDay` only; `endHalfDay` is ignored when `startDate === endDate`
- Half-day adjustments carry through pending-to-taken settlement transitions
- UI: Toggle buttons (AM/PM) appear after date selection; single-day mode hides the end half-day option

---

### 5. Multi-Role RBAC System

**Schema:** `roles: text[]` on the users table, replacing legacy `role` and `adminRole` fields. Explicit set: `employee`, `manager`, `hr`, `admin`. Roles are additive with no implicit inheritance.

**Migration:** All auth checks, leave APIs, OrgChart, MyProfileSection, and API responses were migrated from the legacy single-role fields to the `roles[]` array. Passwords are stripped from all API responses.

---

### 6. Configurable Role Permissions

**File:** `client/src/hooks/use-role-permissions.ts`

Runtime-configurable permission system stored in the `settings` table under key `role_permissions`.

**Hook API:**
```typescript
const { canSee, canDo } = useRolePermissions();
canSee('nav.personnel')     // visibility check
canDo('personnel.terminate') // action check
```

- **Admin bypass** — Admin role always returns true for all checks.
- **Non-admin** — Returns true if any of the user's roles has the permission in the map.
- **Default permissions** define what each role can see and do out of the box (e.g., employees see leave/attendance/profile; managers see team/org-chart/reports; HR sees personnel management actions).
- **Admin UI** — Checkbox grid in Settings (roles x permissions) for runtime configuration.
- **Applied to:** Dashboard nav items (`canSee`), PersonnelSection actions (`canDo` for add, export, edit, terminate, delete, assign roles).

---

### 7. Docker & Deployment Architecture

**Files:** `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.uat.yml`, `docker-compose.release.yml`, `Makefile`, `setup.sh`, `docker-entrypoint.sh`, `docker-entrypoint.dev.sh`

**Multi-Stage Dockerfile:**
1. **Builder** — Compiles TypeScript to `dist/`, handles native modules (bcrypt, pg)
2. **Runner** — Alpine-based, copies compiled artifacts, runs entrypoint

**Three Deployment Profiles:**

| Profile | Compose File | Details |
|---------|-------------|---------|
| **Development** | `docker-compose.dev.yml` | Source mounted for live reload, `npm run dev` with HMR |
| **UAT** | `docker-compose.uat.yml` | Separate ports (5002), passwords, and data dirs to avoid prod collision |
| **Production** | `docker-compose.release.yml` | Pre-built image from `ghcr.io/stopdoingnothing/factory-flow:latest` |

**Common Services:**
- PostgreSQL 16-Alpine with health checks
- Automated backup service: `pg_dump` every 6 hours, 90-day retention

**Entrypoint (production):**
1. Waits for Postgres TCP ready
2. Applies migration SQL files (stripping Drizzle markers)
3. Pre-creates `sessions` and `audit_logs` tables
4. Executes `node dist/index.cjs`

**Makefile:** `setup`, `start`, `stop`, `restart`, `status`, `logs`, `update` (git pull + rebuild), `backup`, `restore` (interactive), `reset-data` (with safety prompt).

**setup.sh:** First-run wizard that prompts for Postgres password, app URL, optional Postmark key, generates SESSION_SECRET, and writes `.env`.

---

### 8. Backup, Restore & Bootstrap

**Location:** `server/routes.ts` (bootstrap endpoints)

**Bootstrap Detection:** `GET /api/backup/bootstrap-check` returns `{ empty: true }` on a fresh database (catches undefined table error). Allowed through auth middleware so a new deployment can be restored without credentials.

**Bootstrap Import Flow:**
1. Validates JSON structure and counts entities
2. Rejects if any users already exist
3. Revives ISO date strings to Date objects (lost during JSON serialization)
4. Imports in dependency order: departments → userGroups → employeeTypes → companies → orgPositions → users → leaveBalances → remaining entities
5. Idempotent — checks for existing records before creating

**Excluded from Exports:** Face descriptors (large binary data), attendance photos (storage-heavy), audit logs (system-generated), session records (ephemeral).

**Automated Backups:** `pg_dump` via backup service every 6 hours to `./data/backups/factoryflow_YYYYMMDD_HHMMSS.sql.gz`. Files older than 90 days are pruned.

---

### 9. Audit Log

**Schema (shared/schema.ts):**

| Column | Type | Purpose |
|--------|------|---------|
| `actor_id` | text | Session userId; null for system actions |
| `action` | text | e.g., `update_user_profile`, `update_leave_balance` |
| `entity_type` | text | `user`, `leave_balance`, `setting`, `leave_request` |
| `entity_id` | text | Primary key of affected row |
| `changes` | jsonb | `{ field: { before, after } }` or event payload |
| `description` | text | Human-readable one-liner |

Pre-created at startup by both entrypoint scripts. Covers: user profile updates (sensitive field diffs), leave balance manual adjustments, leave request approvals/rejections, and settings changes. Paginated fetch via `GET /api/audit-logs` (admin only).

---

### 10. Semantic Theme Token System

**File:** `client/src/index.css`

CSS custom properties in HSL format defined at `:root` (light) and `.dark` class, mapped to Tailwind via `@theme`.

**Palette:** Dark red primary (`#8B1A1A`), near-black foreground, light grey backgrounds. Status tokens for success (green), warning (orange), info (blue), destructive (red) — each with a `-muted` variant for backgrounds.

**Utility Classes:** `.glass-panel` (frosted glass effect), `.industrial-card` (left-border accent), `.btn-industrial` (uppercase, tracking, scale on active).

All previously hardcoded palette colors across the codebase were migrated to these semantic tokens, ensuring consistent theming and dark/light mode support throughout.

---

### 11. In-App Feedback System

**Files:** `client/src/components/FeedbackModal.tsx`, `client/src/lib/feedback.ts`, `server/routes.ts`

**UI:** Modal with tabs for "Bug Report" (title, severity, steps, actual/expected behaviour) and "Feature Request" (title, motivation, proposed behaviour). Captures the current route automatically. Styled as an icon button in the header next to the theme toggle.

**Client-Side Resilience:**
- Pending reports stored in `localStorage` (key: `ff_pending_feedback`)
- Idempotency key: hash of `type:title:route` + timestamp
- Exponential backoff retry (up to 3 attempts, max 48-hour persistence)
- `flushPendingFeedback()` retries unsent reports on app start

**Server Integration:** `POST /api/feedback` forwards to the Agent Gateway, which creates GitHub Issues in the configured repository. Returns `{ success, issue_url, issue_number }`. Gracefully degrades (503 if not configured, 502 if gateway fails).

---

### 12. Server-Side Leave Validation & Hardening

Additions that moved validation logic from the client to the server:

- **Statutory leave types** enforced server-side
- **Unpaid leave** 7-day notice validation with admin discretion bypass
- **Medical certificate** flag auto-triggered on sick leave submission; upload enforced before HR can approve
- **Leave overlap detection** prevents double-booking
- **Escalation reminders** run every 8 hours for pending approvals
- **HR approval stage** made optional via `leave_require_hr_stage` setting
- **HR reporting endpoint** (`GET /api/reports/leave`) for aggregated leave data
- **Carry-over grace period** configurable via settings (default 6 months)
