# FactoryFlow (AECE Checkpoint) — Gap Analysis Review

**Date:** 2026-04-01
**Reviewed by:** Shaun Bennett, using Claude Code

---

## Project Overview

**Stack:** TypeScript monorepo — React/Vite frontend, Express.js backend, PostgreSQL + Drizzle ORM, Postmark email
**Deployment:** Replit (autoscale), no Docker
**Company:** AEC Electronics (Pty) Ltd, ~20 employees

There are **2 specs**. Spec 1 (Leave & HR) is detailed and substantially implemented. Spec 2 (Payroll) is an **empty stub** — only the problem statement exists.

---

## Spec 1: Leave Management & HR System

### What's Working Well

| Requirement | Status | Notes |
|---|---|---|
| REQ-001 Employee Data | Done | Rich schema: tax, POPIA, contract history, org hierarchy, manager linkage |
| REQ-002 Leave Submission | Done | Date range, reason, document upload (JPEG/PNG/PDF as base64) |
| REQ-003 Annual Leave | Done | 21 days/year, pro-rated accrual, 6-month carry-over expiry |
| REQ-005 Family Responsibility | Done | 3 days/cycle, 4-month eligibility gate |
| REQ-009 Approval Workflow | Done (Enhanced) | Spec says Manager→HR; system implements Manager→HR→MD |
| REQ-010 Email Notifications | Mostly done | Submission, approval, rejection, stage transitions all notified |
| REQ-012 Balance Display | Done | Per-type balances with progress bars on employee dashboard |

### Critical Gaps (Must-Fix)

**1. REQ-006 — Statutory Special Leave: Not Implemented**
Maternity (4 months), Parental (10 days), Adoption, and Commissioning leave types don't exist. These are BCEA-mandated.

**2. REQ-013 — Validation Rules: Not Enforced Server-Side**
No server-side checks preventing:
- Leave submission exceeding available balance
- Overlapping date ranges
- Leave dated before the employee's start date

**3. REQ-004 — Sick Leave Probationary Rule: Incorrect**
The first-6-month rule (1 day per 26 days worked) is not applied — simple monthly pro-rating is used instead. The `leave_rule_phases` schema exists for this but the BCEA engine ignores it.

**4. REQ-008/011 — Unpaid Leave Notice & Discretion: Not Implemented**
No 7-day notice period validation, no short-notice warnings, no discretion logging for manager decisions.

**5. REQ-010 — Escalation Reminder Automation: Not Triggered**
The `/api/leave-requests/send-escalation-reminders` endpoint exists but there's no cron or scheduler. It must be manually called — the 12-hour auto-escalation from the spec never fires.

**6. REQ-014 — Audit Trail: Incomplete**
Only leave decision fields (approver, notes, timestamp) are tracked. No system-wide audit log table for profile edits, balance adjustments, or settings changes.

### Medium Gaps (Should-Have)

**7. REQ-007 — Custom Leave Rule Engine: Half-Done**
Leave rules and phases are configurable in the DB and admin UI, but the auto-calculation engine only handles 3 hardcoded BCEA types (Annual, Sick, FRL). Custom rules stored in `leaveRules` are never automatically applied to generate balances.

**8. REQ-004 — Medical Certificate Rules: Not Enforced**
No flagging when sick leave exceeds 2 consecutive days, and no Fri/Mon/public-holiday proximity detection (per company policy).

**9. REQ-015 — HR Reporting: Limited**
The HR dashboard shows basic counts. Missing: sick leave pattern/excessive absence alerts, leave trend analytics by type over time.

**10. REQ-016 — Policy Configuration: Partially Hardcoded**
The 6-month carry-over grace and the Manager→HR→MD hierarchy are hardcoded — not configurable through the settings UI.

---

## Spec 2: Payroll System

**Status: 0% implemented. Spec itself is 0% complete.**

The spec file contains only a problem statement and 4 stakeholder role names. No requirements, no user stories, no scope. Nothing in the codebase touches payroll — no PAYE/UIF/SDL, no tax tables, no IRP5/EMP201 generation, no payslips.

The `taxNumber` field on users and the `companies` table are minor incidental foundations but nothing more.

---

## What Exists Beyond the Specs

The codebase has substantial features that are **explicitly out of scope per spec 1** but fully built:

- **Attendance/Time Tracking** — Full clock-in/out, AWOL, infringement detection, auto-clock-out, bulk entry, PDF reports
- **Facial Recognition** — Multi-angle face capture, face-based login for workers and admins (face-api.js + SSD MobileNet V1)
- **Grievance System** — Full submission/management workflow with categories, priority, assignment, resolution
- **Org Chart** — Position-based hierarchy with visual chart
- **Public Holiday Calendar** — Including religion-specific holidays (Muslim, Jewish, Christian, Hindu) integrated into working day calculations
- **Backup/Restore** — JSON export/import; excludes `companies`, `org_positions`, `contract_history`, and `face_descriptors` (known gap)
- **Branding/Theming** — Configurable logo, colors, company name, dark mode

---

## Infrastructure State

| Aspect | Current State |
|---|---|
| Hosting | Replit autoscale |
| Database | PostgreSQL 16 (Replit module), 18 tables |
| Email | Postmark |
| Auth | localStorage-based (no server-side session validation) |
| CI/CD | None |
| Docker | None |
| Scheduler/Cron | None — escalation reminders can't auto-fire |

**Notable security concern:** API endpoints do minimal authorization checking — role-based access is not consistently enforced server-side. Auth state lives entirely in `localStorage`.

---

## Priority Recommendation

| Priority | Item |
|---|---|
| P0 | Server-side leave validation (balance, overlap, date range) |
| P0 | Statutory special leave types (Maternity, Parental, etc.) |
| P1 | Sick leave probationary accrual rule fix |
| P1 | Escalation reminder cron (Replit scheduled jobs or external trigger) |
| P1 | Audit log table |
| P2 | Unpaid leave 7-day notice & discretion logging |
| P2 | Custom leave rule execution engine |
| P2 | Medical certificate flag triggers |
| P3 | HR reporting / sick leave pattern alerts |
| P3 | Server-side session auth |
| Backlog | Payroll (spec incomplete — needs requirements first) |

---

## Full Requirement Traceability

### Database Tables

| Table | Purpose | Spec Coverage |
|---|---|---|
| `users` | Employee profiles | REQ-001 |
| `departments` | Department management | Beyond spec |
| `user_groups` | Admin user grouping | Beyond spec |
| `employee_types` | Worker/contractor types | REQ-001 (partial) |
| `leave_rules` | Leave accrual configuration | REQ-007, REQ-016 |
| `leave_rule_phases` | Tiered accrual phases | REQ-004, REQ-007 |
| `companies` | Payroll company entities | Payroll spec (shell) |
| `leave_balances` | Leave balance tracking | REQ-003, REQ-012 |
| `leave_requests` | Leave request workflow | REQ-002, REQ-009 |
| `attendance_records` | Clock in/out records | Out of scope per spec |
| `settings` | System configuration KV | REQ-016 |
| `contract_history` | Employment changes | REQ-001 |
| `grievances` | Workplace grievances | Beyond spec |
| `public_holidays` | Holiday calendar | Beyond spec |
| `notifications` | In-app notifications | REQ-010 |
| `org_positions` | Org chart hierarchy | Beyond spec |
| `password_reset_tokens` | Password reset flow | Beyond spec |
| `face_descriptors` | Multi-angle face data | Beyond spec |

### Client Pages

| Page | Purpose |
|---|---|
| `ModeSelect.tsx` | Entry point: attendance kiosk vs employee portal |
| `Login.tsx` | Worker login (ID or face) |
| `AdminLogin.tsx` | Admin login (email/password or face) |
| `Dashboard.tsx` | Employee dashboard: balances, recent requests, clock status |
| `LeaveRequest.tsx` | Submit leave request with file upload |
| `Attendance.tsx` | Employee attendance history |
| `AttendanceKiosk.tsx` | Shared terminal face-recognition kiosk |
| `AttendanceTileMode.tsx` | Tile-based attendance view |
| `AdminDashboard.tsx` | Admin shell with sidebar navigation to 14 sections |
| `MaintainerDashboard.tsx` | Limited admin for data entry |
| `ResetPassword.tsx` | Password reset form |
| `EmployeeProfile.tsx` | Employee self-view profile |
| `OrgChart.tsx` | Visual org chart |
| `Grievances.tsx` | Employee grievance submission |
| `LeaveCalendar.tsx` | Calendar view of approved leave |
| `AttendanceReports.tsx` | Attendance reporting/analytics |
| `not-found.tsx` | 404 page |
