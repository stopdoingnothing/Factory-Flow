# Factory Flow — System Architecture Documentation

**Factory Flow** is a full-stack workforce management system covering leave management, attendance tracking, organisational structure, and HR administration, built for South African BCEA compliance.

## Document Index

| Document | Description |
|----------|-------------|
| [01 — System Overview](01-system-overview.md) | What the system is, who uses it, tech stack, and system boundaries |
| [02 — Backend Architecture](02-backend-architecture.md) | Express API structure, authentication, storage layer, and email integration |
| [03 — Frontend Architecture](03-frontend-architecture.md) | React app structure, routing, state management, and kiosk mode |
| [04 — Data Architecture](04-data-architecture.md) | Database schema, table relationships, and migration strategy |
| [05 — Leave Domain](05-leave-domain.md) | BCEA compliance engine, custom leave accrual, and approval workflow |
| [06 — Key Workflows](06-key-workflows.md) | End-to-end traces: leave approval, attendance clock-in, face recognition |
| [07 — Infrastructure](07-infrastructure.md) | Docker deployment, environment variables, backup strategy, startup sequence |
| [08 — Decision Log](08-decision-log.md) | Architecture Decision Records — why the system was built the way it was |

## Known Gaps

- **No automated tests** — the project has no test framework configured. TypeScript + Zod validation provides type safety at compile and runtime boundaries, but there are no unit or integration tests.
- **No observability** — no structured logging, metrics, or alerting is configured. Application errors surface through process stdout only.

## Quick Reference

| Concern | Where to look |
|---------|---------------|
| Database schema | `shared/schema.ts` |
| All API endpoints | `server/routes.ts` |
| Database queries | `server/storage.ts` |
| BCEA leave calculations (pure logic) | `server/bcea.ts` |
| Leave accrual orchestration + termination settlement | `server/leave-accrual.ts` |
| Custom accrual engine | `server/custom-leave-rules.ts` |
| Email templates | `server/email.ts` |
| Accrual rate tiers | `accrual_rate_tiers` table (seeded via `migrations/0003_leave_accrual_v2.sql`) |
| Sick leave graduated accrual state | `sick_leave_tracking` table |
| Leave accrual audit trail + idempotency | `leave_accrual_records` table |
| Docker deployment | `docker-compose.yml`, `Dockerfile` |
| Environment variables | [07 — Infrastructure](07-infrastructure.md) |
