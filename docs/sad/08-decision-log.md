# 08 — Decision Log

Architecture Decision Records for Factory Flow. Each entry captures a non-obvious architectural choice, why it was made, and what it means for future maintainers.

---

### ADR-001: Session-Based Auth (Not JWTs)

**Status:** Accepted  
**Context:** The app needs authentication for both the worker portal and admin portal. JWT-based stateless auth is popular in SPAs.

**Options considered:**
1. JWT tokens stored in localStorage or httpOnly cookies
2. Server-side sessions stored in PostgreSQL

**Decision:** Server-side sessions via express-session with connect-pg-simple.

**Rationale:** This is a self-hosted system used within a single organisation. The main auth requirement is the ability to immediately invalidate a session when an employee is terminated or suspended — JWTs cannot be revoked without a blocklist (which re-introduces server state anyway). Sessions in PostgreSQL give immediate revocation by deleting the session row, and the overhead of a session lookup per request is acceptable at this scale.

**Consequences:**
- Logout is reliable and immediate
- Sessions survive server restarts (stored in DB, not in-process memory)
- Horizontal scaling would require session sharing (not a concern for single-host deployment)
- 8-hour session lifetime aligns with a standard working day

---

### ADR-002: Drizzle ORM (Not Prisma or raw SQL)

**Status:** Accepted  
**Context:** The project needed a type-safe database access layer for PostgreSQL.

**Options considered:**
1. Prisma ORM
2. Drizzle ORM
3. Raw SQL with `pg` driver

**Decision:** Drizzle ORM.

**Rationale:** Drizzle is a lightweight query builder with zero runtime overhead (no code generation step at runtime, unlike Prisma). It generates plain SQL, making it easy to inspect and debug. Drizzle's schema definitions in `shared/schema.ts` serve double duty as the source for Zod validators via `createInsertSchema()`, eliminating the need to maintain separate validation schemas. Prisma's binary engine adds deployment complexity in Docker (native binary per platform).

**Consequences:**
- Schema, migrations, and Zod validators all derive from one file (`shared/schema.ts`)
- Queries are type-safe without a separate code generation step
- Drizzle's relational query API is less mature than Prisma's `include` — some complex queries use multiple round trips

---

### ADR-003: Single Express Process (Not Microservices)

**Status:** Accepted  
**Context:** The system covers multiple domains: leave, attendance, org structure, grievances, settings.

**Options considered:**
1. Single Express process for all domains
2. Domain-separated microservices (leave service, attendance service, etc.)
3. Modular monolith with separate route files per domain

**Decision:** Single Express process, all routes in `server/routes.ts`.

**Rationale:** This is an on-premise deployment for a single organisation, not a multi-tenant SaaS. The operational complexity of microservices (service discovery, inter-service auth, distributed tracing) provides no benefit here. The codebase is well within the size where a monolith is maintainable. The storage abstraction in `storage.ts` provides the same isolation benefit (domain logic separate from query logic) without the operational overhead.

**Consequences:**
- Simple deployment: one container, one process
- `routes.ts` is large (~3200 lines) — splitting by domain into separate files would improve navigability
- No partial deployments — a change to any domain requires a full container rebuild

---

### ADR-004: React SPA Served by Express (Not Separate Frontend Hosting)

**Status:** Accepted  
**Context:** The app has a React frontend that needs to be served somewhere.

**Options considered:**
1. Separate static hosting (CDN, Nginx, Vercel) for the frontend
2. Express serves the built SPA as static files

**Decision:** Express serves the built React SPA from `dist/public/`.

**Rationale:** Self-hosted deployment simplicity is the top priority. Having a single container serve both the API and the frontend means there is one port to expose, one container to manage, and no CORS configuration needed. The production traffic does not justify CDN distribution, and Vite's build output is suitable for serving from Node's static middleware.

**Consequences:**
- One port, one container, simple reverse proxy config
- Frontend and backend are always deployed together — no version skew between API and SPA
- No CDN caching for static assets (acceptable for internal tool)

---

### ADR-005: Host Bind-Mounts for Data Storage (Not Docker Volumes)

**Status:** Accepted  
**Context:** PostgreSQL data needs to survive container rebuilds and Docker updates.

**Options considered:**
1. Docker named volumes (managed by Docker)
2. Host directory bind-mounts (`./data/postgres/`)

**Decision:** Host bind-mounts at `./data/postgres/` and `./data/backups/`.

**Rationale:** Named Docker volumes are harder to inspect, back up manually, and migrate to a new host. With a bind mount, the database is a plain directory on the host filesystem — it can be copied with `cp -r`, inspected directly, and migrated by moving the folder. For a self-hosted single-org deployment, operational simplicity beats Docker best practices here.

**Consequences:**
- Migrating the system = copying `./data/` to the new host + running `docker compose up`
- No need for `docker volume` commands to manage data
- If the host disk fails without off-site backup, all data is lost (mitigated by the hourly pg_dump backup daemon)

---

### ADR-006: Client-Side Face Recognition (Not Server-Side)

**Status:** Accepted  
**Context:** The attendance kiosk needs to identify employees by face without them logging in.

**Options considered:**
1. Send webcam frames to the server for recognition (server-side inference)
2. Run face-api.js in the browser, send only the descriptor to the server
3. Run face-api.js in the browser, send matched user ID to the server (current approach)

**Decision:** Face detection and matching both run in the browser. Only the matched user ID and a photo snapshot are sent to the server.

**Rationale:** Running inference in the browser means no video stream is sent over the network, reducing bandwidth and privacy risk. The face-api.js TensorFlow.js model runs adequately on modern kiosk hardware. Sending only the matched user ID means the server does not need GPU infrastructure or a Python ML runtime.

**Consequences:**
- No video leaves the kiosk device — only user ID + photo snapshot per clock event
- Face model weights (~6 MB) are downloaded by the browser on first kiosk load
- Recognition accuracy depends on kiosk hardware quality (camera, CPU for TensorFlow.js)
- Model updates require a code change and redeployment (no separate model management)

---

### ADR-007: Postmark for Transactional Email (Not SMTP)

**Status:** Accepted  
**Context:** The system sends transactional emails (leave notifications, credentials, password resets).

**Options considered:**
1. Direct SMTP (self-hosted or via ISP relay)
2. Postmark API
3. SendGrid / AWS SES

**Decision:** Postmark API.

**Rationale:** Postmark specialises in transactional email with high deliverability and minimal configuration. SMTP setup for transactional mail (SPF, DKIM, DMARC, IP reputation) is non-trivial for self-hosted deployments. Postmark's HTTP API is simpler to integrate and debug than SMTP. The email volume for a small-to-medium organisation is well within Postmark's free/starter tier.

**Consequences:**
- Email requires an active internet connection and a valid Postmark API key
- If `POSTMARK_API_KEY` is absent, email is silently disabled — the app functions without it
- Email delivery is dependent on Postmark's infrastructure (external dependency)
- Sender address is configurable via the `settings` table

---

### ADR-008: Wouter for Client-Side Routing (Not React Router)

**Status:** Accepted  
**Context:** The SPA needs client-side routing.

**Options considered:**
1. React Router v6/v7
2. Wouter (lightweight alternative)

**Decision:** Wouter.

**Rationale:** Wouter is a 2.1 KB alternative to React Router that covers all the routing needs of this application (path params, navigation, redirects). React Router's recent API changes (v6 → v7, loaders, actions) add complexity that isn't needed for a simple page-based SPA. Wouter's minimal API reduces bundle size and cognitive overhead.

**Consequences:**
- Simpler routing code: `<Route path="/dashboard" component={Dashboard} />`
- No built-in data loading, code splitting, or nested layouts (implement manually if needed)
- Less community documentation than React Router

---

### ADR-009: Leave Accrual Engine Split into Three Modules

**Status:** Accepted  
**Date:** 2026-04-04  
**Context:** The original accrual logic was in `bcea.ts` (calculations) and scattered across `index.ts` (scheduling). As the spec grew to include rate tiers, per-employee overrides, accrual-pausing leave, graduated sick accrual, termination settlements, and idempotency requirements, a single-module approach became difficult to test and maintain. Additionally, `routes.ts` needed to call `processTerminationSettlement()` when a user's `terminationDate` was set — but `routes.ts` is imported by `index.ts`, creating a circular dependency if `index.ts` exported that function.

**Options considered:**
1. Keep all logic in `bcea.ts` + `index.ts` (status quo, growing complexity)
2. Split into: pure logic module, orchestration module, scheduler — breaking the circular dependency
3. Move to a separate worker process (over-engineered for a monolith)

**Decision:** Three-module split: `bcea.ts` (pure calculations, no DB), `leave-accrual.ts` (DB-calling helpers and termination settlement), `index.ts` (scheduler only).

**Rationale:** `bcea.ts` becomes a pure function library with no side effects — straightforward to unit test. `leave-accrual.ts` holds the DB-interacting helpers that are shared between the scheduler (`index.ts`) and route handlers (`routes.ts`), resolving the circular dependency without a separate process. The scheduler in `index.ts` orchestrates the full monthly run but delegates all logic.

**Consequences:**
- `bcea.ts` functions are pure and testable without a database or mocked storage
- No circular import: `routes.ts` → `leave-accrual.ts` → `storage.ts`; `index.ts` → `leave-accrual.ts` → `storage.ts`
- Adding a new accrual event type means touching `leave-accrual.ts` for the DB write, `bcea.ts` for any pure calculation, and `index.ts` for scheduling — three files instead of one

---

### ADR-010: Dedicated `leave_accrual_records` Table for Idempotency and Audit

**Status:** Accepted  
**Date:** 2026-04-04  
**Context:** The original accrual engine had no idempotency protection — running the month-end job twice would double-credit every employee's leave. There was also no audit trail showing how a balance reached its current value (only a general `audit_logs` table for admin mutations). The spec required both: idempotency and a full calculation trace per event.

**Options considered:**
1. Add a `last_accrual_run_month` field to `leaveBalances` and skip if already run
2. Create a `leave_accrual_records` table with one row per accrual event; unique constraint enforces idempotency
3. Use the existing `audit_logs` table with accrual-specific fields

**Decision:** Dedicated `leave_accrual_records` table with a unique constraint on `(employee_id, leave_type, accrual_period, event_type)`.

**Rationale:** Option 1 only handles the simple case — it cannot distinguish between different event types in the same month (e.g. a regular monthly accrual AND a cycle reset). Option 3 would repurpose a general-purpose changelog as a domain-specific ledger and would require extending the schema with accrual-specific columns (calculation_basis, metadata). A dedicated table keeps concerns separate, supports multiple events per employee per month, and provides a queryable accrual history with calculation traces for HR.

**Consequences:**
- Running the accrual engine twice for the same month is safe — no duplicate credits
- Each balance change has a corresponding record with `balanceBefore`, `balanceAfter`, and a human-readable `calculationBasis` string
- HR can query the full accrual history for any employee
- Adds a DB write per accrual event per employee — acceptable at the scale of a single-org deployment

---

### ADR-011: System-Wide Annual Leave Cycle (Not Per-Employee Anniversary)

**Status:** Accepted  
**Date:** 2026-04-04  
**Context:** The original implementation used each employee's `employment_start_date` as the anchor for annual leave cycle rollovers (`totalMonths % 12 === 0`). This meant employees' leave cycles ended on different dates throughout the year, making it difficult for HR to reason about or manage forfeiture. The spec was updated (v1.2) to align with how most SA organisations actually operate: a single calendar-year cycle for all employees.

**Options considered:**
1. Per-employee anniversary (original implementation)
2. System-wide configurable `annual_leave_cycle_start` date (same for all employees)

**Decision:** System-wide `annual_leave_cycle_start` setting (format: `MM-DD`, default `01-01`). Sick leave retains per-employee anchoring because it is governed by a 36-month employment cycle in the BCEA.

**Rationale:** HR managers think in terms of "the leave year" not "each person's anniversary." A shared cycle boundary makes rollover, forfeiture, and reporting predictable and batch-processable. The BCEA does not mandate per-employee annual leave cycles; it specifies a 12-month cycle, which this satisfies. Sick leave is different — the BCEA explicitly anchors it to `employment_start_date` for the first 36 months, so it retains per-employee anchoring.

**Consequences:**
- All annual leave and FRL cycle boundaries fall on the same date for all employees
- Cycle boundaries always align with month starts (the setting is constrained to `MM-01`) — no mid-month split needed for annual leave or FRL
- HR can change the cycle start date system-wide; the transition extends or shortens the current cycle to bridge to the new date (rare admin action)
- Sick leave cycles remain per-employee, so `sickLeaveTracking` stores per-employee `sick_cycle_start_date`

---

### ADR-013: Semantic CSS Tokens for Dark/Light Theme (No Per-Class `dark:` Variants)

**Status:** Accepted  
**Date:** 2026-04-08  
**Context:** The app has a user-selectable dark/light/system theme. Early development applied `dark:` variants inline on individual Tailwind palette classes (e.g. `bg-green-100 dark:bg-green-900/40`). This approach broke down quickly: ~550 hardcoded palette color classes across 23 files had no dark counterpart at all, making large portions of the UI unreadable in dark mode.

**Options considered:**
1. Retroactively add `dark:` pairs to every hardcoded palette class (fragile, high maintenance)
2. Define semantic CSS custom property tokens in `index.css`; use token-backed Tailwind classes everywhere (chosen)
3. Use a CSS-in-JS theming solution (adds runtime overhead, conflicts with Tailwind v4)

**Decision:** All theme-sensitive colors are expressed as semantic tokens backed by CSS custom properties (e.g. `bg-status-success-muted`, `bg-card`, `text-destructive`). The token values resolve automatically in both `:root` (light) and `.dark {}` (dark) — no `dark:` variant is needed at the usage site.

**Rationale:** A single token definition in `index.css` governs every usage across the entire app. Adding a new dark value requires changing one line, not hunting down every call site. Hardcoded palette classes (`bg-green-100`) are invisible to the CSS variable system — they will always render the same color regardless of theme. The token approach is the only one that scales.

**Consequences:**
- New components must use semantic tokens, not palette classes
- Exception: categorical color distinctions (leave type calendar, org chart department dots) where color encodes distinct identity rather than semantic state. These use paired `dark:` variants (`bg-blue-100 dark:bg-blue-900/40`) since no semantic token exists for "this department is Finance"
- SVG inline styles must use `hsl(var(--token))` syntax — SVG cannot consume Tailwind class utilities
- The 8 `bg-status-*` tokens (`success`, `success-muted`, `warning`, `warning-muted`, `info`, `info-muted`, `neutral`, `neutral-muted`) cover status/state UI; core tokens (`card`, `muted`, `primary`, `destructive`, `foreground`, `border`) cover structural UI

---

### ADR-012: Per-Employee Annual Leave Override

**Status:** Accepted  
**Date:** 2026-04-04  
**Context:** Some employees (senior hires, employees on special contractual arrangements) have negotiated annual leave entitlements that differ from the tier schedule. Before this field existed, HR had to manually adjust balances each month to compensate — error-prone and invisible in the accrual audit trail.

**Options considered:**
1. Add a new tier row for each exception (pollutes the tier table with employee-specific entries)
2. Add a nullable `annual_leave_override_days` field on `users`; when set, completely bypasses tier logic for that employee
3. Create a separate `employee_leave_overrides` table (over-engineered for the current use case)

**Decision:** Nullable `annual_leave_override_days` on `users`. When set, `RATE = override / 12` and tier logic is skipped entirely.

**Rationale:** This is a per-employee exception, not a new tier. Putting it on the user record keeps the data model simple, makes the per-employee nature explicit, and means the accrual engine only needs one additional null check. Setting or clearing the override is audit-logged (including old value, new value, and HR user) per spec requirements.

**Consequences:**
- HR can grant a custom entitlement to any employee without modifying the global tier table
- Tier boundary crossings (e.g. at 24 months) have no effect on employees with an override — the override is permanent until cleared
- Clearing the override (setting to null) falls back to tier-based rate from the next accrual run
