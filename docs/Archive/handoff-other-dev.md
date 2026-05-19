# Developer Handoff — SDN Branch

**Date:** 2026-04-01  
**From:** Shaun Bennet  
**To:** [Other Developer]

---

## Context

A parallel branch (SDN) has been developed to extend the existing FactoryFlow codebase with additional leave management features and to package the application for on-premises Docker deployment. This branch is intended to become the new production baseline.

Before this branch can be merged and handed to the client, two items require action from you — they depend on changes that exist in the live Replit environment but have not been committed to the GitHub repository.

---

## Action Required

### 1. Push the Database Backup UI to GitHub

The live Replit system has a **Database Backup** item in the admin sidebar that allows administrators to export and import the full database as a JSON file. This feature does not exist in the GitHub repository.

**What to do:** Commit and push the Database Backup admin section (navigation item, page component, and any supporting routes) from the Replit environment to the `main` branch on GitHub.

**Why it matters:** The SDN branch is built on top of `main`. Until this is pushed, the Docker deployment is missing a feature that the client already uses in production.

---

### 2. Fix the Backup Export and Import Routes

The existing backup export (`/api/admin/backup/export`) and import (`/api/admin/backup/import`) routes do not include four database tables:

| Table | Contains |
|---|---|
| `companies` | Payroll company assignments |
| `org_positions` | Org chart hierarchy and positions |
| `contract_history` | Employment contract change records |
| `face_descriptors` | Face recognition data for all employees |

A backup taken from the current system and restored on a new instance will silently lose all records from these tables.

**What to do:** Update both the export route (to include these tables in the JSON output) and the import route (to restore them). Ensure FK ordering is handled correctly on import — `org_positions` and `companies` should be inserted before `users` and `contract_history`.

**Why it matters:** The client will be migrating from Replit to a self-hosted Docker instance. The backup/restore mechanism is their migration path. If these tables are excluded, organisational data, contract history, and face recognition setup will not transfer.

---

## No Action Required — For Awareness Only

The following changes have already been made on the SDN branch and do not require any work from you. They are noted here so you are not surprised when reviewing the diff.

| Area | Summary |
|---|---|
| Server-side session auth | All API routes now require a verified server-side session. Sessions are stored in the database and expire after 8 hours. |
| Leave validation | Balance, overlap, date range, and employment start date are enforced server-side. |
| Statutory leave types | Maternity, Parental, Adoption, and Commissioning leave are provisioned automatically for all active employees. |
| Sick leave probationary rule | BCEA s22 compliant — 1 day per 26 days worked for first 6 months, then 30 days for the full cycle. |
| Unpaid leave notice | 7-day notice enforced server-side. Discretionary bypass available with written reason, logged to audit trail. |
| Medical certificate flags | Automatic flagging for duration, Monday/Friday patterns, and public holiday proximity. |
| Custom leave rule engine | Leave rules configured in the admin panel are now applied automatically at startup. |
| Audit log | System-wide audit trail for employee edits, balance adjustments, settings changes, and admin actions. |
| Escalation reminders | Reminders fire every 8 hours automatically — no longer requires manual API calls. |
| Policy configuration | Carry-over grace period and HR approval stage are now configurable via system settings. |
| Docker deployment | Full Docker Compose setup with PostgreSQL, hourly backups, and safe schema migrations. |
| Photo setup loop fix | The photo setup prompt no longer repeats on every navigation to the home page. This fix should also be applied to the Replit environment. |

---

## Migration note — drizzle-kit

The SDN branch switches from `drizzle-kit push` to `drizzle-kit migrate` for the Docker deployment. This does not affect the Replit development environment — `drizzle-kit push` continues to work on Replit as before and has not been changed.
