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
