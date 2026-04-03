# 01 — System Overview

## What It Is

**Factory Flow** (branded as **AECE Checkpoint**) is a self-hosted workforce management system for small-to-medium South African organisations. It manages:

- **Leave** — request, approval, accrual, and BCEA statutory compliance
- **Attendance** — clock-in/out via face recognition or ID, infringement tracking
- **Org structure** — position hierarchy, departments, reporting lines
- **HR administration** — grievances, contract history, payroll company assignments
- **Configuration** — branding, employee types, custom leave rules, public holidays

The system is a single deployable unit: one Docker container serves both the React SPA and the Express API from port 5000.

---

## Users and Roles

| Role | Who | What they can do |
|------|-----|-----------------|
| **worker** | Standard employees | Submit leave, view own balances, clock in/out, view org chart, submit grievances |
| **manager** | Team leads | Everything a worker can do + approve/reject leave requests for their reports |
| **admin (maintainer)** | HR assistants | Manage user profiles, leave balances, attendance records — no system settings |
| **admin (full)** | HR managers / system owners | Full access: settings, leave rules, org positions, audit logs, database backup |

Workers authenticate with their **employee ID** (and optional password). Admins authenticate with **email + password**. Attendance kiosks authenticate via **face recognition** — no session required.

---

## System Context (C4 Level 1)

```mermaid
graph TD
    Worker["Worker\n(employee)"]
    Manager["Manager\n(team lead)"]
    Admin["Admin\n(HR / system owner)"]
    Kiosk["Attendance Kiosk\n(shared device)"]

    FactoryFlow["Factory Flow\n(AECE Checkpoint)\n─────────────────\nLeave management\nAttendance tracking\nOrg structure\nHR administration"]

    Postgres[("PostgreSQL\n(on-host via Docker)")]
    Postmark["Postmark\n(transactional email)"]

    Worker -->|"Leave requests\nProfile\nAttendance"| FactoryFlow
    Manager -->|"Leave approvals\nTeam view"| FactoryFlow
    Admin -->|"System config\nReports\nUser management"| FactoryFlow
    Kiosk -->|"Face / ID clock-in"| FactoryFlow

    FactoryFlow -->|"Reads / writes"| Postgres
    FactoryFlow -->|"Leave notifications\nCredentials\nReminders"| Postmark
```

---

## Tech Stack

### Backend
| Concern | Technology |
|---------|-----------|
| Runtime | Node.js 20 |
| Framework | Express 4.21 |
| Language | TypeScript 5.6 |
| Database ORM | Drizzle ORM 0.39 |
| Database | PostgreSQL 16 |
| Session store | connect-pg-simple (PostgreSQL-backed sessions) |
| Auth | Passport.js (local strategy) + bcrypt |
| Validation | Zod |
| Email | Postmark API |
| Face recognition | @vladmandic/face-api (TensorFlow.js, 128-dim embeddings) |
| Real-time | ws (WebSocket) |
| Excel I/O | xlsx |

### Frontend
| Concern | Technology |
|---------|-----------|
| Framework | React 19 |
| Build tool | Vite 7 |
| Router | Wouter |
| Server state | TanStack React Query 5 |
| Forms | React Hook Form + Zod |
| UI primitives | Radix UI |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| Animations | Framer Motion |
| PDF export | jsPDF |
| Date utilities | date-fns |

### Infrastructure
| Concern | Technology |
|---------|-----------|
| Containerisation | Docker (multi-stage, Node 20 Alpine) |
| Orchestration | Docker Compose |
| DB backup | Hourly pg_dump (7-day retention) |
| Proxy | Nginx or any reverse proxy (TRUST_PROXY env var) |

---

## What It Is Not

- **Not a payroll processor** — it tracks which payroll company an employee belongs to but does not calculate or disburse pay.
- **Not a cloud SaaS** — designed for self-hosted on-premise or single-VPS deployment; no multi-tenant isolation.
- **Not a time-tracking tool** — attendance is clock-in/clock-out only; there is no project or task time tracking.

---

## Repository Structure

```
Factory Flow/
├── client/           # React SPA (Vite)
│   └── src/
│       ├── pages/        # Route-level page components
│       ├── components/   # Reusable UI components
│       ├── lib/          # API client, auth context, utilities
│       └── hooks/        # Custom React hooks
├── server/           # Express API
│   ├── index.ts          # Server setup & startup
│   ├── routes.ts         # All API route handlers (~3200 lines)
│   ├── storage.ts        # Database abstraction layer
│   ├── bcea.ts           # SA BCEA leave calculation logic
│   ├── custom-leave-rules.ts  # Custom leave accrual engine
│   └── email.ts          # Postmark email templates
├── shared/           # Shared between client and server
│   └── schema.ts         # Drizzle table definitions + Zod validators
├── migrations/       # Drizzle database migrations (SQL)
├── Dockerfile
├── docker-compose.yml
└── docker-entrypoint.sh  # Startup sequence (migrate → start)
```

See [02 — Backend Architecture](02-backend-architecture.md) and [03 — Frontend Architecture](03-frontend-architecture.md) for detail on each layer.
