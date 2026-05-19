# Release Notes — SDN Branch

**Prepared for:** Client Manager  
**Branch:** SDN  
**Date:** 2026-04-01  
**Prepared by:** Shaun Bennet

---

## Overview

This document summarises all features and fixes implemented on the SDN branch compared to the main production baseline. The changes span infrastructure, security, leave management, audit logging, and documentation.

---

## 1. Infrastructure — Docker / On-Premises Deployment

The application can now be deployed on a client's own server without a cloud dependency.

| Component | Detail |
|---|---|
| Container stack | Node.js application + PostgreSQL 16 database |
| Schema management | Database schema is applied automatically on startup |
| Configuration | `.env.example` documents all required environment variables |

The deployment package consists of a single `docker-compose.yml` file. Standing up the full system requires one command.

---

## 2. Security — Server-Side Session Authentication

Previously, the application relied entirely on client-side state for authentication. Any request with a valid-looking token could access protected data.

### What changed

- All API routes now require a verified server-side session. Unauthenticated requests receive a `401 Unauthorized` response.
- Sessions are stored in the database (PostgreSQL-backed) and expire after 8 hours.
- Public routes (login, clock-in, face descriptors) are explicitly exempted.
- The application verifies the session against the server on every page load. A tampered or expired local token will be rejected.
- Logout destroys the server session — not just the browser copy.

### Why this matters

Without server-side sessions, a user who obtained another user's token could access the system indefinitely. This change ensures that sessions are revocable and time-limited.

---

## 3. Leave Management

### 3.1 Server-Side Leave Validation

Leave requests submitted through the employee portal are now validated on the server before being accepted. The following checks are enforced:

| Validation | Rule |
|---|---|
| Date range sanity | Start date must be on or before end date |
| Employment start gate | Leave cannot start before the employee's contract start date |
| Overlap detection | A new request cannot overlap any existing active request for the same employee |
| Balance check | Available days must cover the requested working days |

Previously these checks existed only in the UI and could be bypassed by submitting requests directly to the API.

### 3.2 Leave Type Naming Fix

A defect was found where the employee portal was sending shorthand codes (`annual`, `sick`) instead of the full leave type names used by the rest of the system (`Annual Leave`, `Sick Leave`). This caused the balance check to silently skip all employee-submitted requests.

All leave type values are now consistent across the client and server. "Paternity Leave" has been renamed to "Parental Leave" to match the correct BCEA s25A terminology. "Special Leave" has been removed as it is not a statutory category.

### 3.3 Statutory Leave Types

Four additional leave types mandated by the BCEA are now provisioned automatically for all active employees:

| Leave Type | BCEA Section | Entitlement |
|---|---|---|
| Maternity Leave | s25 | 87 working days (4 consecutive months) |
| Parental Leave | s25A | 10 working days |
| Adoption Leave | s25B | 50 working days (10 consecutive weeks) |
| Commissioning Leave | s25C | 50 working days (10 consecutive weeks) |

These balances are created once and never overwritten on restart — HR adjustments (e.g. an employee who has already taken partial maternity leave at a prior employer) will survive server restarts.

### 3.4 Sick Leave Probationary Rule — BCEA s22 Fix

The previous sick leave calculation incorrectly pro-rated 30 days linearly from the employee's first day. This both overstated the entitlement during probation and understated it after 6 months.

The calculation now strictly follows the BCEA:

| Period | Entitlement |
|---|---|
| First 6 months of employment | 1 day per 26 days worked (BCEA s22(2)) |
| From month 6 onwards | 30 days for the full 36-month cycle, available immediately (BCEA s22(1)) |

### 3.5 Unpaid Leave — 7-Day Notice Requirement

Unpaid leave requests must now be submitted at least 7 calendar days before the start date. Requests with less notice are rejected with a clear error message.

**Discretionary bypass:** A manager or administrator may override this requirement for exceptional circumstances by providing a written reason. The bypass is recorded in the audit log and attached to the leave request for visibility during the approval workflow.

### 3.6 Medical Certificate Flag Triggers

Sick leave requests are now automatically flagged when the submission pattern suggests a medical certificate should be required. The following conditions trigger the flag:

| Flag | Condition |
|---|---|
| Duration exceeds 2 days | More than 2 working days requested |
| Monday start or post-holiday start | Absence begins on a Monday, or the day before start is a public holiday |
| Friday end or pre-holiday end | Absence ends on a Friday, or the day after end is a public holiday |

The flag is informational — managers and HR can see it during the approval workflow and act accordingly. A hard block requiring certificate upload before approval is planned as a future enhancement.

### 3.7 Custom Leave Rule Engine

Leave rules configured in the administration panel are now applied automatically at startup. Previously, custom leave type balances had to be entered manually.

The engine supports:

- Four accrual methods: per days worked, monthly, annual, and fixed per cycle
- Phased rules — different accrual rates based on employee tenure (e.g. higher entitlement after 5 years)
- Employee type scoping — rules can apply to all employees or a specific employment category
- Waiting periods — entitlement does not begin until a minimum period of employment is reached
- Maximum accrual caps

---

## 4. Audit Log

A full audit trail is now recorded for sensitive administrative actions. The following events are logged:

| Event | What is recorded |
|---|---|
| Employee record created or updated | Actor, fields changed, before and after values |
| Leave balance adjusted | Actor, leave type, before and after totals |
| System setting changed | Actor, setting key, before and after values |
| Historic leave entry created | Actor, employee, leave type, days |
| Leave request admin-cancelled | Actor, request details |
| Unpaid leave notice bypass | Actor, employee, days of notice, written reason |

Audit records are available to administrators via the system and are retained in the database.

---

## 5. Escalation Reminders

The system now automatically sends escalation reminders for leave requests that have been awaiting action for too long. Reminders are sent every 8 hours to the appropriate approver at each stage of the workflow (Manager → HR → MD).

---

## 6. Policy Configuration

Two approval workflow settings are now configurable by an administrator without a code deployment.

### 6.1 Carry-Over Grace Period

The number of months an employee has to use carried-over annual leave before it is forfeited is configurable via the system setting `leave_carry_over_grace_months`. The default is 6 months (the BCEA standard). HR can reduce or extend this by updating the setting value.

### 6.2 HR Approval Stage

The three-stage approval chain (Manager → HR → MD) can be reduced to two stages (Manager → MD) by setting `leave_require_hr_stage` to `false`. When disabled, manager approval advances the request directly to the MD for final sign-off, and notification emails are addressed to Management instead of HR. The default is the full three-stage chain.

---

## 7. Medical Certificate Enforcement

Building on the automatic flagging introduced earlier, HR is now blocked from approving a sick leave request that requires a medical certificate until at least one supporting document has been attached to the request. HR can still reject without a certificate. The employee or manager must upload the certificate before HR approval can proceed.

---

## 8. HR Leave Reporting

A reporting endpoint is now available to administrators at `GET /api/reports/leave`. An optional date window can be specified (`from` and `to` parameters in YYYY-MM-DD format). The report returns:

| Section | Content |
|---|---|
| Summary | Total requests; counts by status (approved, rejected, cancelled, pending) |
| By leave type | Approved request count and total working days consumed, per leave type |
| By department | Same breakdown per department |
| Sick leave flags | All sick leave requests flagged for a medical certificate, with flag codes and current status |
| High-frequency sick leave | Employees with 3 or more sick leave requests in the period, sorted by frequency |

---

## 9. Documentation

The following specification and decision documents have been produced alongside this work:

| Document | Purpose |
|---|---|
| Access, Leave & HR System Specification | Full functional requirements for the leave and HR module |
| Payroll Specification | Requirements for payroll integration (implementation pending) |
| Gap Analysis | Comparison of the previous codebase against the specification, with findings and recommendations |
| Architecture Decision Records | Documented rationale for all key design and interpretation decisions |

---

## Data Protection Guidance

### What is protected automatically

The Docker deployment includes two layers of local data protection:

| Layer | Detail |
|---|---|
| **Bind mount** | PostgreSQL data files are stored in `data/postgres/` on the host VM filesystem — not inside the container. Data survives container rebuilds, Docker reinstalls, and application updates. |
| **Hourly pg_dump backups** | A dedicated backup service runs `pg_dump` every hour and saves compressed `.sql.gz` files to `data/backups/`. The last 7 days of dumps are retained automatically. These are full database dumps — all tables are included. |
| **Manual backup on demand** | Running `make backup` triggers an immediate dump outside the hourly schedule. |

### Critical gap — offsite backup

Both the live database and the hourly backups reside on the same VM disk. **If the VM is corrupted, lost, or the disk fails, all data and all local backups are lost simultaneously.**

To protect against this, backup files must be copied to a separate offsite location automatically after each dump.

### Recommended approach

Use an S3-compatible object storage provider. At this data volume, the cost is negligible:

| Provider | Cost | Notes |
|---|---|---|
| Backblaze B2 | ~$0.006/GB/month | Free egress to Cloudflare |
| Cloudflare R2 | Free up to 10 GB/month | No egress fees |
| AWS S3 | ~$0.023/GB/month | Widely supported |

A scheduled job on the VM (or an additional Docker service) should sync `data/backups/` to the chosen bucket after each hourly dump using `rclone` or the `aws` CLI.

### Recommended retention policy

| Location | Retention |
|---|---|
| Local (`data/backups/`) | 7 days — fast recovery from recent errors |
| Offsite (cloud bucket) | 30–90 days — protection against undetected data loss or VM failure |

### Restore testing

A backup that has never been tested is not a reliable backup. The `make restore` command should be exercised against a staging instance periodically to confirm that dumps are valid and the restore procedure is understood before an emergency.

---

## Outstanding Items

The following items remain identified but not yet implemented:

| Item | Notes |
|---|---|
| Move approved-past leave from pending to taken | Requires a scheduled job; planned alongside escalation reminder work |
| Payroll integration | Specification written; awaiting requirements sign-off before implementation begins |
| Offsite backup | Local hourly backups are in place but copies are not yet sent offsite. VM loss or disk failure would result in total data loss. See Data Protection Guidance above. |
| Database backup incomplete — organisational data excluded | The backup export does not include four tables: `companies` (payroll company assignments), `org_positions` (org chart hierarchy), `contract_history` (employment contract changes), and `face_descriptors` (face recognition data). A backup taken from the current system will not restore these records. This is a gap in the existing backup/restore feature that requires the other developer to update both the export and import routes. |
| Database Backup nav item missing from SDN branch | The live system has a dedicated "Database Backup" item in the admin sidebar. This has not been committed to the GitHub repository. The other developer must push these changes before the SDN branch can be brought fully in sync. |
