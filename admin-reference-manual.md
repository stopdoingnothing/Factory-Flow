# AECE Checkpoint — System Reference Manual

**Version:** 1.0  
**Last Updated:** April 2026  
**Audience:** System administrators, advanced HR users, technical integrators  
**Purpose:** Complete technical reference for all configurable aspects of the AECE Checkpoint leave management system

---

## Introduction

This manual is a technical reference document for administrators and advanced users of AECE Checkpoint, a self-hosted leave management system built for South African organisations. It covers system architecture, configuration parameters, database structure, email notifications, leave calculation rules, and troubleshooting.

This document is **not a procedure guide**—it explains what each setting does and why you would change it. For step-by-step UI navigation, see the accompanying HR Quick Reference.

All timestamps in the system are recorded in the configured timezone (default: Africa/Johannesburg). All email notifications flow through Postmark. The system uses a PostgreSQL database backed by Drizzle ORM and runs as a single Docker container.

---

## Table of Contents

1. [System Architecture Overview](#section-1-system-architecture-overview)
2. [Initial Setup Checklist](#section-2-initial-setup-checklist)
3. [System Settings: General](#section-3-system-settings-general)
4. [System Settings: Attendance](#section-4-system-settings-attendance)
5. [System Settings: Branding](#section-5-system-settings-branding)
6. [System Settings: Role Permissions](#section-6-system-settings-role-permissions)
7. [System Settings: API Key](#section-7-system-settings-api-key)
8. [Organisational Structure Configuration](#section-8-organisational-structure-configuration)
9. [Employee Administration](#section-9-employee-administration)
10. [Leave Rules Configuration](#section-10-leave-rules-configuration)
11. [Leave Workflow Configuration](#section-11-leave-workflow-configuration)
12. [Attendance Configuration and Operations](#section-12-attendance-configuration-and-operations)
13. [Email Notifications: Complete Reference](#section-13-email-notifications-complete-reference)
14. [Database Backup and Restore](#section-14-database-backup-and-restore)
15. [Leave Balance Reference: Rules Engine Deep Dive](#section-15-leave-balance-reference-rules-engine-deep-dive)
16. [Audit Logs](#section-16-audit-logs)
17. [API Reference](#section-17-api-reference)
18. [Troubleshooting and Maintenance](#section-18-troubleshooting-and-maintenance)

---

## Section 1: System Architecture Overview

### 1.1 What AECE Checkpoint Is

**AECE Checkpoint** (brand name for the Factory Flow project) is a self-hosted, single-container leave and attendance management system designed for small-to-medium South African organisations. It runs on-premise or via VPS deployment—not as a cloud SaaS, and not multi-tenant.

**Core Components:**
- **Frontend:** React 19 single-page application (Vite), served from `/api`
- **Backend:** Express 4.21 REST API (Node.js 20, TypeScript)
- **Database:** PostgreSQL 16, accessed via Drizzle ORM 0.39
- **Session store:** PostgreSQL-backed `connect-pg-simple`
- **Authentication:** Email + bcrypt password (sessions) and face recognition (attendance kiosk)
- **Email:** Postmark API for transactional notifications
- **Face recognition:** TensorFlow.js with 128-dimensional embeddings, in-browser matching on kiosk
- **Container:** Docker multi-stage build (Node 20 Alpine base, ~200MB image)
- **Backup:** Automated pg_dump every 6 hours, 90-day retention, gzipped

**What it manages:**
- Leave requests, approvals, accrual, and BCEA statutory compliance
- Attendance clock-in/out via face recognition or employee ID
- Organisational structure (positions, departments, reporting lines)
- HR administration (grievances, contract history, payroll company assignments)
- Configuration (branding, employee types, custom leave rules, public holidays)

**Key boundaries:**
- **Not payroll:** Tracks which payroll company an employee belongs to; does not calculate or disburse pay
- **Not time-tracking:** No project or task time logging; clock-in/out only
- **Not cloud:** Single-tenant, self-hosted only; requires direct PostgreSQL access for backups

### 1.2 Role Hierarchy and Capabilities Matrix

The system uses **additive, non-hierarchical roles**. Users hold one or more roles from the set `['employee', 'manager', 'hr', 'admin']`. Roles do not inherit—each is checked independently. The `admin` role implicitly satisfies any permission requirement.

| Role | Who | Core Responsibilities |
|------|-----|----------------------|
| **employee** | Standard staff | Submit leave requests, view own balances, clock in/out, view org chart, submit grievances, edit own profile |
| **manager** | Team leads | Everything employee + recommend/action leave for reports, view team attendance, manage own team in org chart |
| **hr** | HR staff | Full leave workflow, grievance handling, personnel admin, leave rule configuration, manual balance adjustments, reporting |
| **admin** | System owners | Settings, audit logs, database backup, user management, role assignment, API key management, branding, organizational structure |

**Multi-role example:** A user with roles `['employee', 'manager']` can:
- Submit their own leave like an employee
- Recommend/reject leave for their reports like a manager
- Cannot access HR workflows, settings, or audit logs (not in `hr` or `admin` roles)

**Role permission determination (canDo check):** Returns `true` if the user holds **any** role that has the permission, or if the user holds the `admin` role.

### 1.3 Admin vs HR Capabilities

Both `admin` and `hr` can manage leave approvals and personnel, but **only admin can**:
- View and configure system settings (timezone, cutoff times, role permissions, branding)
- Create and manage companies, departments, employee types, and org chart positions
- Access and manage backup/restore functionality
- Generate and regenerate the external API key
- Assign or revoke roles from users
- Create new admin users (via Settings tab)
- View and act on audit logs

HR users can:
- Approve/reject leave requests
- Perform manual balance adjustments with audit trail
- Create and edit employees and contracts
- Configure leave rules and accrual rate tiers
- Manage public holidays
- View reports (HR leave report, BCEA preview, attendance trends)

### 1.4 Mode Selection Screen

On first load, unauthenticated users see a **mode selector** with two entry points:

1. **Kiosk Mode** → Attendance clock-in/out via face recognition or employee ID (no session required)
2. **Portal Login** → Email + password authentication for employees, managers, HR, and admins

The kiosk is a shared public device; portal login is for authenticated staff. Sessions are stored in PostgreSQL and persist across page reloads.

---

## Section 2: Initial Setup Checklist

### 2.1 First-Time Setup Sequence

When a new AECE Checkpoint instance is deployed with an empty database, an admin must complete setup in this order:

1. **Create the first admin user** — Use the admin login form or Settings tab (if no users exist, the app shows the bootstrap option)
2. **Configure timezone** — Settings > General > Timezone (affects all timestamps and auto clock-out). Default: Africa/Johannesburg
3. **Set up email** — Configure `admin_email` and `sender_email` so notifications are sent. Verify Postmark API key in environment
4. **Configure work hours** — Set `clock_in_cutoff` and `clock_out_cutoff` (e.g., 08:00 and 17:00). Messages for late arrival/early departure
5. **Create departments** — Add departments for your organisation (e.g., Sales, Operations, IT). Used for filtering and grievance targeting
6. **Create employee types** — Define employment categories (e.g., Permanent, Contractor, Part-Time). Leave entitlements are scoped to types
7. **Create companies** — Optional; group employees by payroll company for reporting (no payroll calc)
8. **Create org positions** — Build the org chart hierarchy with parent-child relationships
9. **Set up leave rules** — Configure BCEA statutory rules and custom leave types. Set accrual rate tiers for annual leave
10. **Configure public holidays** — Add national and observance holidays for the calendar. Religion-specific holidays apply to matching employees
11. **Set branding** — Company name, logo, colors, and terminology (Employee, Department, Clock In, Clock Out)
12. **Create employees** — Bulk import via CSV or manual entry. Must set: name, ID, department, employee type, start date, work days/week
13. **Configure role permissions** — (Optional) Restrict navigation and actions by role. Default permissions are pre-set

### 2.2 Bootstrap Restore from Backup

**Use case:** Disaster recovery or setting up a replica instance with previous data.

**When available:** Only works when the database has **no users**. The button appears on the mode selector if the condition is met.

**Process:**
1. Export JSON from a previous instance (Admin > Database Backup > Export)
2. On new empty instance, click "Bootstrap Restore" on the mode selector
3. Upload the JSON file
4. System validates structure (15 tables, row counts) and shows summary
5. Click "Restore" to import all data
6. Redirected to login; all accounts and settings are now restored

**Behavior:**
- Data is imported additively—no overwrites
- All employee accounts, leave balances, attendance records, settings, and org structure are restored
- Audit logs and notifications are also restored
- After restore, the first admin user can log in with their original credentials

### 2.3 Verifying Email Delivery

To confirm Postmark is configured correctly:

1. Navigate to **Settings > General > Email**
2. Verify `sender_email` is a verified Postmark domain (e.g., `noreply@example.com`)
3. Verify `admin_email` is set to a valid address (multiple addresses: newline-separated)
4. From the command line, test the Postmark API key:

```bash
curl https://api.postmarkapp.com/email \
  -X POST \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "X-Postmark-Server-Token: <POSTMARK_API_KEY>" \
  -d '{
    "From": "sender_email_from_settings",
    "To": "test@example.com",
    "Subject": "Test",
    "HtmlBody": "<p>Test email</p>"
  }'
```

5. Check Postmark dashboard for message status (Sent, Bounced, or error)
6. Submit a leave request and confirm notification is sent to admin_email

---

## Section 3: System Settings: General

General settings control core system behavior: timezone, email, work hour cutoffs, and leave cycle timing. Accessible via **Settings > General** (admin only).

### 3.1 admin_email

**Purpose:** Recipient(s) for system alerts, leave requests, late attendance, AWOL alerts, escalation reminders, and termination notifications.

**Valid values:** Email address, or multiple addresses separated by newlines  
**Default:** Empty (must be configured)  
**Format:** Standard RFC 5322 (e.g., `admin@example.com`)  
**Multiple addresses example:**
```
admin@example.com
hr@example.com
manager@example.com
```

**Effect if changed:**
- New email notifications go to the updated address(es)
- Existing notifications are not resent
- Kiosk attendance infringements are sent here if the employee has no manager

**Warnings:**
- If left blank or invalid, email notifications are silently dropped (check logs)
- If an address is not Postmark-verified, the email will bounce

### 3.2 sender_email

**Purpose:** "From" address on all outbound email from AECE Checkpoint.

**Valid values:** Email address  
**Default:** Empty (must be configured)  
**Format:** Must be a verified Postmark sending domain (e.g., `noreply@aece-checkpoint.co.za`)

**Effect if changed:**
- All future emails use the new address
- Postmark must have verified this address as a sender domain
- Replies to emails will go to this address (consider using a no-reply address)

**Warnings:**
- If not verified in Postmark, all emails will bounce
- Changing to an unverified address is a common misconfiguration source
- Use "From Name" in Postmark to set display name (e.g., "AECE Checkpoint" <noreply@...>)

### 3.3 timezone

**Purpose:** Time zone for all system timestamps, scheduling, and automated actions (auto clock-out, monthly accrual).

**Valid values:** IANA time zone identifier (e.g., `Africa/Johannesburg`, `Africa/Nairobi`, `UTC`)  
**Default:** `Africa/Johannesburg`  
**Format:** Standard identifier from `tzdata`; case-sensitive

**Effect if changed:**
- All new records use the new timezone
- Historical records retain their original timestamps (no retroactive conversion)
- Scheduled jobs (monthly accrual on the 1st, auto clock-out at 23:59) shift to the new timezone
- The admin dashboard and employee calendars display times in the new timezone

**Warnings:**
- Changing mid-cycle can misalign monthly accrual runs—change only during off-hours or at month-start
- Auto clock-out runs at 23:59 in the configured timezone; employees in different zones may clock out unexpectedly early/late
- Public holiday matching (recurring holidays) uses the configured timezone for date calculation

### 3.4 annual_leave_cycle_start

**Purpose:** Month when the annual leave cycle resets each year. Controls when annual leave balances rollover and FRL is granted.

**Valid values:** Month number (1–12)  
**Default:** 1 (January)  
**Format:** Integer between 1 (January) and 12 (December)

**Effect if changed:**
- The cycle reset runs during the last day of the prior month (e.g., if set to 3 = March, rollover happens on 29–28 Feb)
- New employees' first annual leave allocation starts from the next cycle boundary, not their hire date
- FRL is granted at the same cycle boundary
- Carry-over forfeiture warnings are sent 60 and 30 days before the grace period expiry (6 months into new cycle)
- Changing mid-cycle is safe—the next rollover uses the new setting

**Warnings:**
- Only affects **Annual Leave** and **FRL**. Sick leave uses a per-employee 36-month cycle from employment date
- If you change this after employees have earned leave, the first year may be a short cycle; subsequent years are full 12 months
- Public holidays are not tied to this; they are calendar dates

### 3.5 leave_carry_over_grace_months

**Purpose:** Duration (in months) after the annual leave cycle ends during which unused carry-over leave remains valid.

**Valid values:** Integer ≥ 1 (typically 3–6)  
**Default:** 6  
**Format:** Whole months; e.g., 6 means 6 months from cycle end

**Effect if changed:**
- Determines the `carryOverExpiry` date set at cycle rollover
- Forfeiture warnings are sent at 60 days and 30 days **before** expiry
- After expiry, the system flags the record for HR review but does **not** auto-forfeit; HR must manually adjust if needed
- Existing carry-over records keep their original expiry date; the new setting applies to future cycles

**Warnings:**
- If set to 0 or negative, carry-over expires immediately (not recommended)
- The actual **forfeiture** (removal of carry-over days) is not automatic—HR must manually approve the loss

### 3.6 hr_approval_stage_enabled/disabled

**Purpose:** Toggle between 2-stage (manager → HR) and 3-stage (manager → HR → MD) leave approval workflow.

**Valid values:** Boolean (enabled true/false)  
**Default:** true (3-stage enabled)  
**Format:** Toggle switch in UI

**Effect if changed:**
- **When enabled (3-stage):**
  - Employee submits → Manager reviews (recommendation only) → HR approves/rejects → (optional MD approval for certain leave types)
  - Manager sees a "Recommend" or "Do Not Recommend" button; cannot approve outright
  - HR sees manager's recommendation and can override

- **When disabled (2-stage):**
  - Employee submits → Manager approves/rejects (final decision) → no HR stage
  - Manager sees "Approve" and "Reject" buttons
  - HR has no approval workflow (but can still manage leave as admin)

**Warnings:**
- Changing this does **not** affect in-flight requests—existing pending requests continue under their original workflow
- If disabled mid-cycle, managers become final approvers; if re-enabled, new requests go back to 3-stage
- When 2-stage is active and there is no manager, requests go directly to approved (not recommended)

---

## Section 4: System Settings: Attendance

Attendance settings control work hour boundaries and the templates for infringement notifications. Accessible via **Settings > Attendance** (admin only).

### 4.1 clock_in_cutoff

**Purpose:** The time after which a clock-in is flagged as "late arrival."

**Valid values:** Time in 24-hour HH:MM format  
**Default:** 08:00  
**Format:** 00:00 to 23:59 (e.g., `08:00`, `07:30`, `09:15`)

**Effect if changed:**
- Any employee clocking in after this time is marked with `isInfringement = 'late_arrival'`
- A notification is sent to the admin email (if configured) with the `late_arrival_message_template`
- The attendance record stores the cutoff violation for audit and reporting
- Infringements do **not** block the clock-in; they are logged for review

**Warnings:**
- If set to an unrealistic time (e.g., 23:00), almost no one will ever be late
- If set to a very early time (e.g., 06:00), many employees may be flagged
- Changing mid-day is safe; the new cutoff applies immediately to future clock-ins

### 4.2 clock_out_cutoff

**Purpose:** The time before which a clock-out is flagged as "early departure."

**Valid values:** Time in 24-hour HH:MM format  
**Default:** 17:00  
**Format:** 00:00 to 23:59

**Effect if changed:**
- Any employee clocking out before this time is marked with `isInfringement = 'early_departure'`
- A notification is sent to the admin email with the `early_departure_message_template`
- Infringements do not block the clock-out; they are logged for audit
- The message is **before** cutoff; e.g., if cutoff is 17:00, clocking out at 16:59 triggers the alert

**Warnings:**
- Should typically be later than `clock_in_cutoff` (work hours span from clock-in to clock-out)
- If set too early (e.g., 16:00), many employees will trigger early departure alerts

### 4.3 late_arrival_message_template

**Purpose:** Template for the notification sent when an employee clocks in after the cutoff time.

**Valid values:** Free-form text with optional placeholders  
**Default:** `{name} (ID: {id}) clocked in late at {time}.`  
**Placeholders:**
- `{firstName}` — Employee first name
- `{surname}` — Employee last name
- `{name}` — Full name (firstName + surname)
- `{id}` — Employee ID
- `{department}` — Employee's department
- `{time}` — Actual clock-in time (HH:MM format)
- `{cutoff}` — Clock-in cutoff time (HH:MM format)
- `{date}` — Date in local format (e.g., DD/MM/YYYY)

**Example templates:**
```
{name} from {department} clocked in late at {time} ({cutoff} cutoff).

⚠️ Late: {firstName} {surname} ({id}) – {time} vs {cutoff}

{name} – LATE ARRIVAL at {time} on {date}
```

**Effect if changed:**
- New infringements use the updated template
- Existing notifications are not regenerated
- Invalid placeholders are left as-is in the output

**Warnings:**
- Empty template results in a blank message (still sends notification, just with no custom text)
- Very long templates may exceed email width limits; keep under 200 characters

### 4.4 early_departure_message_template

**Purpose:** Template for the notification sent when an employee clocks out before the cutoff time.

**Valid values:** Free-form text with optional placeholders  
**Default:** `{name} (ID: {id}) left early at {time}.`  
**Placeholders:** Same as `late_arrival_message_template`

**Example templates:**
```
{name} departed early at {time} (expected {cutoff}).

⚠️ Early: {firstName} {surname} – {time}

{name} – EARLY DEPARTURE at {time} on {date}
```

**Effect if changed:**
- New infringements use the updated template
- Existing notifications are not regenerated

**Warnings:**
- "Cutoff" in early departure context means the expected clock-out time; the placeholder `{cutoff}` shows this value

---

## Section 5: System Settings: Branding

Branding settings control the visual identity and terminology throughout the application. Accessible via **Settings > Branding** (admin only).

### 5.1 company_name

**Purpose:** Organization name displayed in page titles, email headers, footers, and UI chrome.

**Valid values:** Free-form text (1–100 characters recommended)  
**Default:** `AECE Checkpoint`  
**Format:** Any string; no special restrictions

**Effect if changed:**
- Updates immediately across all UI pages, email templates, and exported reports
- Does not affect employee records or leave data
- Shown in browser tab title and site header

**Example:** Changing to "Acme Manufacturing" updates all displays to use "Acme Manufacturing" instead of "AECE Checkpoint".

### 5.2 company_logo

**Purpose:** Logo image displayed in the top-left corner of the portal and in email headers.

**Valid values:** Base64-encoded image data  
**Default:** Empty (system logo)  
**Format:** Data URI (e.g., `data:image/png;base64,iVBORw0KGgo...`)

**How to set:**
1. Convert a PNG or JPG image (recommended: 200px × 100px) to Base64
2. Paste the entire data URI into the settings field
3. Save; the image appears immediately

**Effect if changed:**
- The new logo appears in the next page load
- Old cached images may persist until browser cache is cleared
- Removes the system fallback logo

**Warnings:**
- Large images (>100KB) may slow page load; keep under 50KB
- Invalid Base64 data is silently ignored; logo reverts to default
- Update both PNG and any JPG versions to maintain consistency

### 5.3 primary_color

**Purpose:** Main brand color used for buttons, links, and active UI elements.

**Valid values:** Hex color code (e.g., `#1e40af`, `#0066cc`)  
**Default:** `#1e40af` (dark blue)  
**Format:** 6-digit hex (#RRGGBB) or 3-digit shorthand (#RGB)

**Effect if changed:**
- Buttons, links, and active states use the new color
- Updates on all pages immediately (no cache needed)
- Used in charts, badges, and progress indicators

**Example:** Changing to `#d32f2f` (red) makes primary buttons and links red.

**Warnings:**
- Ensure sufficient contrast with white text for accessibility (WCAG AA: contrast ratio ≥ 4.5:1)
- Very dark colors (near black) or light colors (near white) may be unreadable
- Test with your logo to ensure visual cohesion

### 5.4 accent_color

**Purpose:** Secondary brand color used for highlights, hovers, and secondary actions.

**Valid values:** Hex color code  
**Default:** `#3b82f6` (bright blue)  
**Format:** 6-digit hex (#RRGGBB)

**Effect if changed:**
- Secondary buttons, hover states, and highlights use the new color
- Examples: "Cancel" buttons, hover effects on table rows

**Warnings:**
- Should complement `primary_color`; avoid high contrast that causes eye strain
- Test both light and dark UI modes if theme toggle is available

### 5.5 Terminology Overrides

The system allows relabeling of four core terms throughout the UI. All changes propagate across navigation, forms, and reports.

#### 5.5.1 term_employee

**Purpose:** The label for an individual staff member in the organization.

**Valid values:** Singular noun (e.g., `Employee`, `Staff Member`, `Team Member`)  
**Default:** `Employee`  
**Effect:** Replaces "Employee" in navigation, tables, and forms with the custom term

#### 5.5.2 term_department

**Purpose:** The label for organizational units.

**Valid values:** Singular noun (e.g., `Department`, `Team`, `Division`)  
**Default:** `Department`  
**Effect:** Replaces "Department" in personnel views, org chart, and filters

#### 5.5.3 term_clock_in

**Purpose:** The label for arrival time recording.

**Valid values:** Verb phrase (e.g., `Clock In`, `Check In`, `Log In`)  
**Default:** `Clock In`  
**Effect:** Replaces "Clock In" on the kiosk, attendance pages, and forms

#### 5.5.4 term_clock_out

**Purpose:** The label for departure time recording.

**Valid values:** Verb phrase (e.g., `Clock Out`, `Check Out`, `Log Out`)  
**Default:** `Clock Out`  
**Effect:** Replaces "Clock Out" on the kiosk, attendance pages, and forms

**Example customization:**
```
term_employee  → Team Member
term_department → Business Unit
term_clock_in  → Arrive
term_clock_out → Depart
```

**Warnings:**
- Changes apply only to new UI renders; existing forms may cache the old label until refreshed
- Terminology is also used in system emails; consider the professionalism of your chosen terms

---

## Section 6: System Settings: Role Permissions

Role permissions control navigation visibility and capability buttons for each role. By default, all roles have sensible permissions; admins can restrict access as needed.

> **Admin-only:** Viewing and editing role permissions requires the `admin` role.

### 6.1 What Role Permissions Control

Role permissions are checked in two contexts:

1. **Navigation:** Whether a menu item or tab is visible to the user
2. **Capabilities:** Whether an action button (Add, Edit, Delete, Export, etc.) is visible and functional

**Permissions are additive:** If a user holds multiple roles, they can do anything that **any** of their roles permits. The `canDo(permission)` check returns `true` if the user's roles include the permission.

**Admin implicitly satisfied:** Any permission check passes if the user holds the `admin` role, regardless of other roles.

### 6.2 Navigation Permissions Table

Navigation permissions control which dashboard sections appear in the sidebar and are accessible. There are 12 navigation items:

| Permission Key | Label | Default Roles |
|---|---|---|
| `apply_for_leave` | Apply for Leave | employee, manager, hr, admin |
| `my_attendance` | My Attendance | employee, manager, hr, admin |
| `my_profile` | My Profile | employee, manager, hr, admin |
| `grievances` | Grievances | employee, manager, hr, admin |
| `admin_insights` | Admin Insights | hr, admin |
| `personnel` | Personnel | hr, admin |
| `my_team` | My Team | manager, hr, admin |
| `org_chart` | Org Chart | employee, manager, hr, admin |
| `leave_requests` | Leave Requests | hr, admin |
| `attendance` | Attendance | hr, admin |
| `attendance_reports` | Attendance Reports | hr, admin |
| `leave_calendar` | Leave Calendar | hr, admin |

**Default behaviour:** Employees see Apply for Leave, My Attendance, My Profile, Grievances, and Org Chart. Managers add My Team. HR adds Personnel, Leave Requests, Attendance, Attendance Reports, and Leave Calendar. Admins can see everything.

### 6.3 Personnel Page Capability Permissions Table

Personnel page permissions control which actions are available when editing employee records. There are 7 capabilities:

| Permission Key | Action | Default Roles |
|---|---|---|
| `add_person` | Add new employee | hr, admin |
| `export_pdf` | Export employee details as PDF | hr, admin |
| `missing_information` | View and flag missing required fields | hr, admin |
| `edit_employee` | Modify employee records (name, contact, start date, etc.) | hr, admin |
| `terminate` | Set termination date and trigger settlement | hr, admin |
| `delete` | Permanently delete employee record | admin |
| `assign_roles` | Change a user's roles (employee/manager/hr/admin) | admin |

**Default behaviour:** HR can add, edit, export, and flag missing information. Only admins can delete or assign roles.

### 6.4 How to Change Permissions

1. Navigate to **Settings > Role Permissions**
2. For each role (Employee, Manager, HR, Admin), review the available navigation and capability toggles
3. Check/uncheck toggles to grant or revoke permissions
4. Click **Save**
5. Changes take effect immediately for existing sessions; users may need to refresh to see updated navigation

**Example: Restrict HR from assigning roles**
1. Navigate to Settings > Role Permissions
2. Find the HR row
3. Uncheck `assign_roles`
4. Click Save
5. HR users can no longer change anyone's roles

### 6.5 Multi-Role Implications

When a user holds multiple roles, permissions are **union-based**: the user can do anything that **any** of their roles allow.

**Example:**
- User has roles: `['employee', 'manager']`
- Permission `my_team` is granted to manager only
- Result: User sees "My Team" in navigation (from manager role) even though employee role doesn't have it
- Check: `roles.some(r => permissions[r].includes('my_team'))` → true

**Admin role override:** If a user holds `admin`, they bypass all permission checks and can access everything regardless of other role settings.

### 6.6 Warning: Minimum Viable Permissions

Be careful not to grant zero permissions to a role:

- **Zero navigation permissions** → User logs in but sees empty sidebar (confusing UX)
- **Zero capability permissions** → User can navigate but all action buttons are disabled (possibly intentional for read-only roles)

**Recommendation:** At minimum, grant `my_profile` to all roles so users can edit their own password.

---

## Section 7: System Settings: API Key

The external API key allows third-party systems to query and manage leave data without a user session.

> **Admin-only:** Only admins can view, regenerate, or reset the API key.

### 7.1 Purpose

The API key (`x-api-key` header) authenticates external integrations:
- Payroll systems querying employee leave balances
- HR systems exporting attendance or leave data
- Custom dashboards reporting on leave statistics
- Mobile apps or third-party UIs

Requests with a valid API key bypass the session cookie requirement and grant full API access (subject to the user account's role).

### 7.2 Viewing Current Key

1. Navigate to **Settings > API**
2. The current API key is displayed **masked** by default (e.g., `sk-**...****`)
3. Click the eye icon to reveal the full key
4. **Do not** share the revealed key in screenshots or logs

### 7.3 Regenerating the Key

1. Navigate to **Settings > API**
2. Click **Regenerate Key**
3. A new key is generated **immediately**
4. The **old key becomes invalid** at once—any integrations using it will fail
5. Update all external systems to use the new key **before regenerating**

**Process for regeneration:**
1. Generate new key in admin panel
2. Copy the new key
3. Update all integrations with the new key (test each one)
4. Confirm all integrations are working before discarding old key documentation
5. If you need to rotate due to security compromise, regenerate immediately and change all integrations right away

### 7.4 API Endpoint Documentation

Full API documentation is available in-app:

1. Navigate to **Settings > API**
2. Scroll to **API Documentation** section
3. Review endpoint categories: users, leave requests, balances, attendance, rules, departments, settings, reports, holidays, grievances, positions, companies, types, logs

Common endpoints:
- `GET /api/employees` — List all employees
- `GET /api/leave-balances/:userId` — Get leave balances for an employee
- `POST /api/leave-requests` — Submit a leave request (requires user context)
- `GET /api/attendance/:userId` — Get attendance records
- `GET /api/reports/hr-leave` — Generate HR leave report
- `GET /api/audit-logs` — Query audit log

All endpoints require either a session cookie or the `x-api-key` header.

### 7.5 Security Considerations

**Treat as credential:** The API key is a secret—equivalent to a password.

**Best practices:**
- Store the key in environment variables, not config files or code
- Rotate every 90 days if possible
- Immediately regenerate if the key is exposed (committed to version control, pasted in Slack, etc.)
- Use separate keys for development and production (requires creating a dev instance)
- Monitor API usage (check Postmark logs, server logs) for unauthorized access patterns

**Revocation:** Regenerating the key is the only way to revoke all integrations at once. There is no "pause" or "disable" option without regeneration.

---

## Section 8: Organisational Structure Configuration

Organizational structure settings define how the company is divided and represented in the system. These affect filtering, reporting, leave eligibility, org charts, and grievance routing.

> **Admin-only:** Departments, employee types, companies, org positions, and user groups require `admin` role to create or modify.

### 8.1 Departments

**Purpose:** Organize employees into logical groups for filtering, reporting, and grievance targeting.

**What they affect:**
- Employee filtering in Personnel, Leave Requests, Attendance, Leave Calendar
- Grievance targeting (grievances can target a company or a specific department)
- Org chart grouping and reporting lines
- Absence tracking (AWOL alerts group by manager within a department)

**Create/Edit/Delete:**
- Accessible via **Settings > Departments** (admin only) or **Admin > Personnel > Departments**
- Delete is blocked if any employee is currently assigned to the department
- To delete a department, first reassign or remove all employees from it

**Naming:** Department names are unique and case-sensitive (e.g., "Sales" ≠ "sales"). Use consistent naming conventions.

**Example structure:**
```
Executive
├── Finance
├── Human Resources
├── Operations
│   ├── Fulfillment
│   └── Logistics
└── Sales
```

**Advanced:** Departments are flat (no parent-child relationship). Use **Org Positions** for hierarchical reporting lines.

### 8.2 Employee Types

**Purpose:** Categorize employees by employment status and leave entitlements.

**What they affect:**
- Leave rule applicability (rules are scoped to employee types)
- Leave entitlements (annual, sick, FRL, etc.)
- Whether the employee is permanent or contract-based
- Display label for leave (e.g., "Unavailable" for contractors instead of "Leave")

**Fields:**
- `name` — Type identifier (e.g., "Permanent Full-Time", "Contractor")
- `description` — Optional details
- `leave_label` — How leave is displayed ("Leave" for employees, "Unavailable" for contractors)
- `has_leave_entitlement` — "yes" or "no"; controls whether leave rules apply
- `is_default` — One type marked as default; assigned to new employees
- `is_permanent` — "yes" for open-ended employment, "no" for contract-based (allows `contractEndDate`)

**Examples:**
```
1. Permanent Full-Time
   - has_leave_entitlement: yes
   - is_permanent: yes
   - leave_label: Leave

2. Contractor
   - has_leave_entitlement: no
   - is_permanent: no
   - leave_label: Unavailable

3. Part-Time
   - has_leave_entitlement: yes
   - is_permanent: yes
   - leave_label: Leave
```

**Contract tracking:** Use `contractEndDate` (on user profile) to mark contract-based employees' end dates. When a contract expires, the system does not auto-deactivate; HR must manually set `terminationDate`.

### 8.3 Companies/Payroll Companies

**Purpose:** Group employees by payroll or organizational entity for reporting and tracking (not payroll calculation).

**What they affect:**
- Employee filtering and grouping in Personnel
- Reporting aggregation (by company)
- Payroll reconciliation checks (manual, not automatic)

**Create/Edit/Delete:**
- Accessible via **Settings > Companies**
- Delete is blocked if any employee is assigned to the company
- To delete, reassign all employees first

**Fields:**
- `name` — Company name (unique)
- `registration_number` — Optional tax/registration ID
- `description` — Optional notes

**Use case:** A holding company with multiple subsidiaries (e.g., AECE Holdings, AECE Manufacturing, AECE Services) can group employees by subsidiary for payroll export.

**Note:** The system does **not** calculate payroll or disburse pay. It only tracks which company an employee belongs to, for administrative grouping.

### 8.4 Org Chart Positions

**Purpose:** Define the hierarchical structure of the organization independently of specific employees.

**What they affect:**
- Org chart display (visual hierarchy)
- Manager/reporting line assignment (employees hold positions; positions have parents)
- Team grouping in "My Team" view

**Fields:**
- `title` — Position name (e.g., "Sales Manager", "Technical Lead")
- `department` — Associated department (optional)
- `parent_position_id` — Parent position in the hierarchy (creates parent-child link)
- `sort_order` — Order among siblings (lower numbers first)
- `is_outsourced` — Boolean; marks position as external/outsourced (visual indicator)
- `tier` — Visual spacing (1 = normal, higher = pushed down; useful for long org charts)

**Hierarchy building:**
1. Create root positions with no parent (e.g., CEO, MD)
2. Create positions with a parent (e.g., Sales Manager reports to VP Sales, who reports to MD)
3. Assign employees to positions via the employee profile

**Tier example:** If you have a CEO with 10 direct reports, set their `tier` to 2, 3, or higher to space them vertically on the chart.

**Difference from Departments:**
- Departments are flat (e.g., "Sales", "Operations")
- Positions are hierarchical (e.g., CEO → VP → Manager → Individual Contributor)
- An org chart displays positions; an employee's department is separate

### 8.5 User Groups

**Purpose:** Group admin users for role-based access control and reporting.

**What they affect:**
- Admin user organization (informational; no access restrictions yet)
- Future: filtering admin actions by group

**Fields:**
- `name` — Group name (e.g., "Finance Admins", "HR Team")
- `description` — Optional details

**Create/Edit/Delete:**
- Accessible via **Settings > User Groups** (admin only)
- Delete is blocked if any admin user is assigned to the group
- To delete, reassign users first

**Typical groups:**
```
- HR Admins (manage employees, leave rules, reports)
- Finance Admins (manage companies, audit logs, payroll export)
- System Admins (manage settings, backups, API keys)
```

---

## Section 9: Employee Administration

### 9.1 Adding an Admin User

**Admin users are created only via the Settings panel**, not via Personnel. This prevents privilege escalation.

1. Navigate to **Settings > General** (or **Settings > Users** if available)
2. Click **Add Admin User**
3. Fill in:
   - **First Name** and **Surname**
   - **Email** (used for login and notifications)
   - **Password** (auto-generated option or custom)
   - **User Group** (optional, for organizational purposes)
4. Click **Create**
5. A welcome email is sent to the address with login credentials and a password reset link

**Roles:** The newly created user is assigned the `admin` role automatically (editable afterward via Personnel if you want to downgrade to `hr`-only).

**First user:** On an empty database, the first user is created via the admin login form on the mode selector.

### 9.2 Role Assignment

**Purpose:** Assign roles (`employee`, `manager`, `hr`, `admin`) to users after creation.

**Access:** Requires the `assign_roles` capability (default: `admin` only).

1. Navigate to **Personnel**
2. Find the employee and click **Edit**
3. Scroll to **Roles** section
4. Check/uncheck role checkboxes:
   - **Employee** — Can submit leave, clock in/out, view own profile
   - **Manager** — Can recommend/approve leave for reports
   - **HR** — Can approve leave, manage leave rules, adjust balances
   - **Admin** — Can manage settings, backups, users, audit logs
5. Click **Save**

**Multi-role behavior:** A user can hold multiple roles. The system allows any action permitted by **any** of their roles (union-based).

**Example:** Assigning `['employee', 'manager']` to a user allows them to submit their own leave and manage reports' leave.

**Changing roles:** Admins can always reassign roles, even to other admins. There is no "super-admin" or "role lock" feature. Revoking the `admin` role from all admins is possible (be careful!).

### 9.3 Bulk Leave Balance CSV Import

**Purpose:** Load leave balances in bulk (e.g., from legacy system migration or backfill).

**Access:** Requires `hr` or `admin` role.

1. Navigate to **Admin > Leave Rules** (or **Admin > Personnel**)
2. Locate **Bulk Import Leave Balances** button
3. Prepare a CSV file with columns:
   ```
   employeeId,leaveType,total,taken,pending
   EMP001,Annual Leave,20,5,0
   EMP001,Sick Leave,10,2,0
   EMP002,Annual Leave,15,0,0
   ```
4. Click **Import**
5. Review validation summary:
   - Rows successfully imported
   - Rows skipped or with errors
   - Warnings (e.g., employee not found)
6. Click **Confirm** to finalize

**Behavior:**
- **Duplicates:** If a row matches an existing employee and leave type, the entire balance is **updated** (replaced)
- **New employees:** Skipped if employee ID doesn't exist (must create employee first)
- **Missing leave type:** Skipped with warning
- **Invalid numbers:** Skipped with error

**Example CSV:**
```csv
employeeId,leaveType,total,taken,pending
EMP001,Annual Leave,20,5,2
EMP001,Sick Leave,10,3,0
EMP001,Family Responsibility Leave,3,1,0
EMP002,Annual Leave,15,0,0
EMP002,Sick Leave,5,0,0
```

### 9.4 Contract History

**Purpose:** Track contract-related events: creation, extensions, conversions, and terminations.

**Where to view:**
- Navigate to **Personnel > Edit [Employee]**
- Scroll to **Contract History** section
- Shows a timeline of events:
  - `created` — Initial hire
  - `extended` — Contract extended (new end date)
  - `converted` — Changed employee type (e.g., Contractor → Permanent)
  - `ended` — Terminated

**What's recorded:**
- `action` — Event type
- `previousEmployeeTypeId` / `newEmployeeTypeId` — Type change (if applicable)
- `previousEndDate` / `newEndDate` — Date change (if applicable)
- `reason` — Free-text explanation (optional)
- `performedBy` — Admin who made the change
- `createdAt` — Timestamp

**Manual event creation:**
1. Click **Add Contract Event**
2. Select action type: Created, Extended, Converted, or Ended
3. Fill in relevant dates and type changes
4. Add a reason (optional but recommended for audit trail)
5. Click **Save**
6. Event is recorded and timestamped

**Effect on leave:**
- Changing `employee_type_id` (e.g., Permanent → Contractor) affects which leave rules apply retroactively
- Setting `terminationDate` triggers immediate termination settlement (pro-rated annual leave)
- Extending `contractEndDate` does not trigger any automatic events

---

## Section 10: Leave Rules Configuration

Leave rules define how much leave each employee type receives and how it accrues over time. The system includes pre-configured BCEA statutory types and allows custom leave types.

> **HR-accessible:** Leave rule configuration requires `hr` or `admin` role.

### 10.1 BCEA Statutory Types Reference Table

These leave types are managed by the BCEA accrual engine (`server/bcea.ts`) and cannot be disabled or deleted. They apply universally to all employees, regardless of employee type.

| Leave Type | Entitlement | Cycle | Accrual | Notes |
|---|---|---|---|---|
| **Annual Leave** | Configurable via rate tiers (default: 15 days/yr for 0–23 months; 20 days/yr for 24+ months) | 12 months (system-wide) | Monthly, pro-rated | Paused by unpaid/maternity/parental/adoption/commissioning. Carry-over up to 6 months (configurable). |
| **Sick Leave** | 30 days (full-time, scales with workDaysPerWeek) | 36 months (per employee) | Graduated first 6 months (1 day per 26 worked), then fixed pool | Notified at 6-month transition. 36-month reset forfeits unused balance. |
| **Family Responsibility Leave (FRL)** | 3 days | 12 months (system-wide, aligns with annual) | Lump sum at cycle start | Eligibility: 4+ months employed AND workDaysPerWeek ≥ 4. |
| **Maternity** | 87 working days | Per event (fixed) | Granted on submission | One-time per pregnancy. |
| **Parental** | 10 days | Per event (fixed) | Granted on submission | Non-birthing partner, per event. |
| **Adoption** | 50 days | Per event (fixed) | Granted on submission | Primary caregiver. |
| **Commissioning Parental** | 50 days | Per event (fixed) | Granted on submission | Surrogacy commissioning parent. |

### 10.2 Accrual Rate Tiers (Annual Leave)

Annual leave entitlement is determined by **length of service**. Tiers are system-wide defaults (HR-editable) and apply to all employees.

**Default tiers:**

| Tier | Minimum Service | Annual Entitlement | Monthly Rate |
|---|---|---|---|
| Tier 1 | 0 months | 15 days | 1.25 days/month |
| Tier 2 | 24 months | 20 days | 1.6667 days/month |

**How tiers work:**
1. On each monthly accrual run, the system calculates the employee's completed months of service
2. The highest tier where `minMonthsOfService ≤ completedMonths` is selected
3. Monthly accrual = `tier.annualEntitlementDays / 12`

**Adding/modifying tiers:**
1. Navigate to **Settings > Leave Rules** (admin) or **Leave Rules > Accrual Rates** (HR)
2. Click **Add Tier**
3. Enter `minimum_months_of_service` (e.g., 0, 24, 60)
4. Enter `annual_entitlement_days` (e.g., 15, 20, 25)
5. Click **Save**
6. Tiers are applied to the next monthly accrual run

**Effect on existing employees:**
- Tier changes are applied **prospectively**—existing accrued balance is not retroactively adjusted
- An employee who crosses a tier boundary mid-month accrues at the new tier rate for the **entire month**
- The change applies to next month's accrual run (1st of month)

**Override:** Individual employees can bypass tier logic via `annual_leave_override_days` on their profile. HR can set a fixed annual entitlement (e.g., 18 days) for a specific employee.

### 10.3 Custom Leave Rule Fields

Custom leave rules allow organizations to define non-statutory leave types (e.g., study leave, special leave, volunteer leave).

**Complete field reference:**

| Field | Type | Default | Purpose |
|---|---|---|---|
| `name` | Text | — | Rule identifier (e.g., "Study Leave") |
| `description` | Text | — | Optional details |
| `leaveType` | Text | — | Leave type identifier; must be unique |
| `employeeTypeId` | Integer | NULL | Restrict rule to specific employee type (NULL = all types) |
| `accrualType` | Enum | none | `none` (approval-only), `lump_sum` (one-time), or `monthly` (recurring) |
| `accrualRate` | Decimal | — | Monthly accrual rate (if `accrualType = monthly`) |
| `lumpSumAmount` | Decimal | — | One-time grant (if `accrualType = lump_sum`) |
| `cycleLengthMonths` | Integer | 12 | Cycle duration (e.g., 12 for annual, 36 for 3-year) |
| `cycleAnchor` | Enum | calendar_year | `calendar_year` (system-wide) or `employment_start_date` (per-employee) |
| `carryOver` | Boolean | false | Can unused balance carry to next cycle? |
| `maxDaysPerCycle` | Integer | NULL | Optional cap (NULL = unlimited) |
| `pausesAnnualAccrual` | Boolean | false | When this leave is taken (approved), does it reduce annual leave accrual for that month? |

**Examples:**

1. **Study Leave (annual, capped)**
   - `accrualType`: lump_sum
   - `lumpSumAmount`: 5
   - `cycleLengthMonths`: 12
   - `cycleAnchor`: calendar_year
   - `carryOver`: false
   - `maxDaysPerCycle`: 5
   - Result: 5 days/year, non-cumulative

2. **Volunteer Leave (monthly accrual)**
   - `accrualType`: monthly
   - `accrualRate`: 0.5
   - `cycleLengthMonths`: 12
   - `cycleAnchor`: calendar_year
   - `carryOver`: true
   - Result: 0.5 days/month = 6 days/year, carries over

3. **Long Service Leave (3-year cycle)**
   - `accrualType`: lump_sum
   - `lumpSumAmount`: 10
   - `cycleLengthMonths`: 36
   - `cycleAnchor`: employment_start_date
   - `carryOver`: false
   - Result: 10 days every 3 years from hire date

### 10.4 Phased Rules

Phased rules allow different entitlements in different periods of employment (e.g., probation vs. permanent).

**Use case:** A new employee accrues at 10 days/year for the first 12 months, then 15 days/year thereafter.

**Create a phased rule:**
1. Create the base leave rule (e.g., "Annual Leave - Custom")
2. Add phases:
   - **Phase 1:** Starts after 0 months, rate 10 days/year
   - **Phase 2:** Starts after 12 months, rate 15 days/year
3. On each accrual run, the system selects the correct phase and accrues at that rate

**Phase fields:**
- `phaseName` — Label (e.g., "Probation")
- `startsAfterMonths` — Phase begins N months after employment start
- `startsAfterDaysWorked` — Or begins after N working days (alternate)
- `accrualType`, `daysEarned`, `periodDaysWorked` — Accrual config for this phase
- `cycleMonths` — Cycle length (if fixed-cycle)
- `maxBalanceDays` — Cap for this phase (e.g., max 10 days in probation)

### 10.5 Public Holidays

**Purpose:** Define national, observance, and religious holidays. These are excluded from working day counts in leave requests and accrual calculations.

**Fields:**
- `name` — Holiday name (e.g., "New Year's Day")
- `date` — Date in YYYY-MM-DD format
- `isRecurring` — Boolean; true for annual holidays, false for one-time dates
- `type` — `public` (national) or `religious` (observance/faith-specific)
- `religionGroup` — NULL (applies to all) or faith identifier (e.g., 'muslim', 'christian', 'jewish', 'hindu')

**Add a public holiday:**
1. Navigate to **Settings > Public Holidays** (admin) or **Leave Rules > Public Holidays** (HR)
2. Click **Add Holiday**
3. Enter name, date, recurring flag, type, and religion (if applicable)
4. Click **Save**

**Examples:**
```
New Year's Day                          | 2025-01-01 | Recurring | public | NULL (all employees)
Christmas Day                           | 2025-12-25 | Recurring | public | NULL (all employees)
Eid al-Fitr 2025                        | 2025-04-09 | One-time  | public | muslim (Muslims only)
Yom Kippur 2025                         | 2025-10-04 | One-time  | public | jewish (Jews only)
Diwali 2025                             | 2025-11-01 | One-time  | public | hindu (Hindus only)
```

**Effect:**
- Recurring holidays match on month+day each year (e.g., Jan 1 is always a public holiday)
- One-time holidays apply only to the specified year
- Religion-specific holidays exclude non-matching employees from the holiday count
- When calculating working days for a leave request, public holidays are subtracted (if employee's religion matches, if applicable)

### 10.6 Unpaid Leave Notice Period

**Purpose:** Enforce advance notice for unpaid leave requests.

**Requirement:** Employees must submit unpaid leave requests at least **7 days** in advance.

**Enforcement:**
- Backend: `POST /api/leave-requests` rejects unpaid leave with a start date < 7 days from today with HTTP 400
- Frontend: The leave request form disables date pickers for dates < 7 days ahead when unpaid leave is selected

**HR override:** HR users can manually create or approve unpaid leave requests without the 7-day notice by using the admin leave request form (permits back-dating and zero-notice submission).

**Rationale:** BCEA does not require unpaid leave; this is a policy setting to prevent abuse. Organizations may adjust this via custom configuration if needed (requires code change; not a settings UI option yet).

---

## Section 11: Leave Workflow Configuration

The leave approval workflow defines how leave requests flow from employee submission to final approval. Two configurations are supported.

### 11.1 2-Stage vs. 3-Stage Approval

**3-stage (default):**
- Employee submits → Manager recommends/opposes → HR approves/rejects
- Manager cannot approve; only recommends
- HR sees manager's recommendation and can override
- Better for large organizations with clear HR governance

**2-stage:**
- Employee submits → Manager approves/rejects → done
- Manager has final approval authority
- HR is bypassed; no HR workflow
- Better for small organizations where managers are trusted signatories

**Toggle:**
- Setting: `hr_approval_stage_enabled` (Settings > General)
- Default: `true` (3-stage enabled)
- Effect: Takes place immediately for new requests; in-flight requests use their original workflow

**Manager without manager (no manager assigned):**
- 3-stage: Request goes directly to HR (`pending_hr`)
- 2-stage: Request is approved automatically (treated as approved at manager stage)

### 11.2 Leave Escalation Reminders

**Purpose:** Notify admins when leave requests are stuck in approval.

**Trigger:**
- Fires every 8 hours for requests in `pending_manager` or `pending_hr` status
- Only triggers if the request has been pending for **more than 3 days**
- Sent to `admin_email`

**Recipient:** The configured admin email (setting: `admin_email`)

**Manual trigger:**
- Admins can manually send escalation reminders from the Leave Requests view
- Button: **Send Escalation Reminder**
- Effect: Sends an email to admin; does not modify request status

**Content:**
- Employee name and leave details
- Days pending
- Direct link to review in the admin panel

**Why used:** Prevents requests from languishing in approval for weeks; acts as a soft deadline nudge.

### 11.3 Cancellation Rules

**Employee:**
- Can cancel their own leave request while in `pending_manager` status
- Cannot cancel once moved to `pending_hr` or approved
- Cancellation decrements `leaveBalances.pending` by the requested days

**Admin:**
- Can cancel in-flight requests from `pending_manager` or `pending_hr`
- Cannot cancel approved/rejected requests without manual balance adjustment
- Reason is captured (optional but recommended for audit)

**Approved leave:**
- Can only be adjusted by HR via manual balance adjustment (PATCH `/api/leave-balances`)
- This allows HR to correct erroneous approvals while maintaining audit trail

### 11.4 Annual Leave Cycle Rollover Parameters

The annual leave cycle defines when balances reset and carry-over expires.

**Parameters:**
- `annual_leave_cycle_start` — Month (1–12) when the cycle resets (default: 1 = January)
- `leave_carry_over_grace_months` — Duration (months) after cycle end during which unused leave is forfeited (default: 6)

**Rollover process (automatic, runs monthly):**
1. On the last day of the month before `annual_leave_cycle_start`, the rollover fires
2. For each employee:
   - `carryOverDays = max(0, total - taken - pending)`
   - `total` is reset to 0 (new cycle)
   - `carryOverExpiry = today + leave_carry_over_grace_months months`
3. Forfeiture warnings are sent:
   - 60 days before expiry
   - 30 days before expiry
4. After expiry:
   - System flags the record for HR review (no auto-forfeit)
   - HR must manually approve forfeiture via balance adjustment

**Example:**
- Cycle start: January (month 1)
- Employee balance at 31 Dec: total=20, taken=15, pending=2
- Unused: 20 - 15 - 2 = 3 days
- Rollover fires: carryOverDays = 3, carryOverExpiry = June 30
- 60d before expiry (May 1): Warning email sent
- 30d before expiry (June 1): Warning email sent
- After June 30: Flag for HR review; carry-over remains until HR acts

---

## Section 12: Attendance Configuration and Operations

The attendance system tracks employee clock-in/out via face recognition or ID lookup. Settings control work hour boundaries and detection of infractions.

### 12.1 Kiosk Mode

**Purpose:** Shared public device for employees to record arrival and departure.

**How it works:**
1. Employee approaches the kiosk (screen displays mode selector)
2. Employee selects **Kiosk Mode**
3. Two options:
   - **Face Recognition:** Camera captures face; in-browser TensorFlow.js model matches against 128-dimensional embeddings stored in DB
   - **ID Lookup:** Employee manually enters ID; system fetches basic info and allows clock-in/out
4. System records timestamp, method, and any infractions (late/early)
5. Screen displays success/infringement message and returns to mode selector

**Face recognition details:**
- Uses **@vladmandic/face-api** (TensorFlow.js models)
- Compares live face to stored embeddings (one per employee, or multiple for accuracy)
- Matching threshold: ~0.6 Euclidean distance (configurable, not in UI yet)
- No authentication required (public device)
- **Privacy:** Photos are not stored; only embeddings (128 float values) are retained
- **Re-registration:** If recognition fails, employee can fall back to ID entry or re-register face

**Auto clock-out:**
- Runs at 23:59 every night (in the configured timezone)
- Any employee clocked in but not clocked out is automatically clocked out
- A notification is sent to the employee
- Alert sent to their manager
- Use case: Prevents "stuck" clock-ins from overnight shifts or errors

### 12.2 Clock Cutoff Settings

See **Section 4: System Settings: Attendance** for detailed field descriptions.

- `clock_in_cutoff` (default 08:00) — Times after this are flagged as late arrival
- `clock_out_cutoff` (default 17:00) — Times before this are flagged as early departure

### 12.3 Auto Clock-Out Reset

**Purpose:** Manually trigger the auto clock-out process if the scheduled job fails (outages, crashes).

**Access:** Admin only.

**Location:** Settings > Attendance, or Admin > Attendance > Auto Clock-Out button

**What it does:**
1. Scans all attendance records from today
2. Finds employees with an "in" record but no corresponding "out"
3. Creates "out" records at 23:59 for each
4. Sends notifications to employees and managers
5. Returns count of employees processed

**When to run:**
- After a service outage (if the scheduled job was skipped)
- At end of day if you notice employees are still clocked in
- Before month-end to ensure all attendance is settled

**Idempotency:** Safe to run multiple times; will not double-clock-out an employee.

### 12.4 Infringement Types and Triggers

Infractions are recorded when attendance times violate configured cutoffs. They do **not** block the clock-in/out; they are flagged for review.

| Infringement | Trigger | Condition | Notification |
|---|---|---|---|
| **Late Arrival** | Clock-in after `clock_in_cutoff` | time > cutoff | Admin email + late_arrival_message_template |
| **Early Departure** | Clock-out before `clock_out_cutoff` | time < cutoff | Admin email + early_departure_message_template |
| **Missed Clock-Out** | Auto clock-out runs for employee | clocked in, no clock-out | Email to employee + alert to manager |

**Handling infractions:**
- Admins review in **Attendance** or **Attendance Reports**
- Reasons can be provided (e.g., "Traffic delay", "Doctor's appointment")
- Reasons are stored in `infringementReason` and visible to HR
- No automatic penalties are applied; HR manually adjusts leave or adds notes

### 12.5 AWOL Detection

**Purpose:** Identify employees absent without approved leave or a recorded clock-in.

**How it works:**
1. Daily (typically at 10:00 AM in configured timezone)
2. System scans each day's attendance
3. For each employee marked `attendanceRequired = true`:
   - Check if employee clocked in (any "in" record for the date)
   - Check if employee has approved leave covering the date
   - Check if employee is terminated (deactivated)
4. If no clock-in **and** no approved leave:
   - Employee is flagged as AWOL
   - Alert is sent to their manager (or admin if no manager)
   - Email includes employee list, date, and action link

**What to do with results:**
1. Manager receives AWOL alert email
2. Manager logs in to confirm absence (check if leave was approved but not recorded, or if employee was sick)
3. Options:
   - **If employee was on leave:** Create a retroactive leave record (HR can back-date)
   - **If employee was sick:** Create sick leave record (may require medical cert)
   - **If employee was absent without reason:** Document and follow disciplinary process (outside system)

**Exclusions:**
- Employees with `attendanceRequired = false` (contractors, consultants, off-site workers)
- Terminated employees (`terminationDate` is set)
- Days covered by approved leave (any type)

---

## Section 13: Email Notifications: Complete Reference

AECE Checkpoint sends 11+ distinct notification types via Postmark. All notifications are templated and include employee context, decision reasons, and action links where applicable.

> **Configuration:** Requires `sender_email` and `admin_email` settings to be valid and Postmark-verified. Without these, notifications are silently skipped.

### Email Notification Types

| # | Function | Trigger | Recipients | Content | Template |
|---|---|---|---|---|---|
| 1 | **Leave Request Submitted** | Employee submits leave request | Manager email (if exists) + admin email | Employee name, leave type, dates, reason, requested days, current balance, action link | `sendLeaveRequestNotification()` |
| 2 | **Leave Workflow Decision** | Manager makes recommendation (3-stage) or HR makes decision | Employee (on approval), HR (if manager recommends on 3-stage) | Request details, decision, comments, updated balance | `sendLeaveStageNotification()` |
| 3 | **Late Arrival Alert** | Employee clocks in after `clock_in_cutoff` | Admin email + manager (if applicable) | Employee name, ID, department, actual time, cutoff, custom message | `sendLateAttendanceNotification()` with `late_arrival_message_template` |
| 4 | **Early Departure Alert** | Employee clocks out before `clock_out_cutoff` | Admin email + manager | Employee name, ID, department, actual time, cutoff, custom message | `sendLateAttendanceNotification()` with `early_departure_message_template` |
| 5 | **Missed Clock-Out Alert** | Auto clock-out runs at 23:59 | Employee + manager | Notification that employee was auto clocked out; request to verify | `sendMissedClockOutNotification()` |
| 6 | **Manager Missed Clock-Out Alert** | Auto clock-out runs (same trigger as #5) | Manager of affected employee | List of employees auto clocked out; request to follow up | `sendManagerMissedClockOutAlert()` |
| 7 | **AWOL Alert** | Daily AWOL detection runs | Manager (grouped by manager) or admin if no manager | List of absent employees, date, request to verify or create leave record | `sendAWOLAlert()` |
| 8 | **Leave Escalation Reminder** | Request pending >3 days; fires every 8 hours | Admin email | Employee name, leave type, dates, days pending, action link | `sendLeaveEscalationReminder()` |
| 9 | **Admin Welcome Email** | New admin user created via Settings | User's email | Welcome, login credentials, password reset link (legacy; credentials now sent separately) | `sendAdminWelcomeEmail()` |
| 10 | **Credentials Email** | Credentials reset requested (via Settings or manual trigger) | User's email | Email address, temporary password, password reset link | `sendAdminCredentialsEmail()` |
| 11 | **Password Reset Email** | User requests password reset (login page) | User's email | Password reset link (1-hour expiry), instructions | `sendPasswordResetEmail()` |
| 12 | **60-Day Carry-Over Warning** | Annual leave cycle rollover; 60 days before carry-over expiry | Employee + HR users | Days at risk, expiry date, action required | (in leave-accrual.ts, calls custom email) |
| 13 | **30-Day Carry-Over Warning** | Annual leave cycle rollover; 30 days before carry-over expiry | Employee + HR users | Days at risk, urgent action required | (in leave-accrual.ts, calls custom email) |
| 14 | **Cycle Reset Notification** | Annual leave cycle resets OR sick leave 36-month reset fires | Employee + HR users | New balance, carry-over details (if any), what changed | (in leave-accrual.ts, calls custom email) |
| 15 | **Termination Settlement** | Employee termination date is set | Admin email + all HR users | Final balance, pro-rated amount, settlement details | (in leave-accrual.ts, calls custom email) |

### Details by Notification

#### Notification 1: Leave Request Submitted

**Trigger:** `POST /api/leave-requests` successful

**Recipients:** Manager email (if `managerId` is set) + admin email

**Content:**
- Employee name, ID, department
- Leave type, dates, reason, working days requested
- Current leave balance (total, consumed, remaining)
- Warning if balance is insufficient

**Contains action link:** Yes, direct to review request

#### Notification 2: Leave Workflow Decision

**Trigger:** Manager recommends (3-stage) or HR approves/rejects

**Recipients:** 
- Employee (always, if decision is approval)
- Employee (on rejection)
- HR email (on manager recommendation in 3-stage)

**Content:**
- Request summary
- Decision + reason/comments from approver
- Updated balance (if approved)

#### Notification 3 & 4: Attendance Infractions

**Trigger:** `clock_in` or `clock_out` that violates cutoff

**Recipients:** Admin email + manager (if manager exists)

**Template:** Customizable via `late_arrival_message_template` and `early_departure_message_template`

**Placeholders available:**
- `{name}`, `{firstName}`, `{surname}` — Employee name
- `{id}` — Employee ID
- `{department}` — Department name
- `{time}` — Actual clock time
- `{cutoff}` — Expected cutoff time
- `{date}` — Current date

#### Notification 5 & 6: Missed Clock-Out

**Trigger:** Auto clock-out runs at 23:59 + finds clocked-in employee

**Recipients:** 
- Notification 5: Employee
- Notification 6: Employee's manager

**Content:**
- Notification that auto clock-out was triggered
- Time of auto clock-out (23:59)
- Request to verify (may indicate shift work, error, etc.)

#### Notification 7: AWOL Alert

**Trigger:** Daily AWOL detection run (typically 10:00 AM)

**Recipients:** Manager (or admin if no manager)

**Content:**
- Date of absence
- List of absent employees (ID, name, department)
- Request to verify (create leave record, confirm absence, etc.)

#### Notification 8: Leave Escalation Reminder

**Trigger:** Request in `pending_manager` or `pending_hr` for >3 days; fires every 8 hours

**Recipients:** Admin email

**Content:**
- Employee name, leave type, dates
- Days pending
- Action link to review

---

## Section 14: Database Backup and Restore

AECE Checkpoint supports both automated Docker backups and manual JSON export/import. Backups are critical for disaster recovery.

> **Admin-only:** Backup and restore functions require `admin` role.

### 14.1 Automated Docker Backup

**How it works:**
- Every 6 hours, the system runs `pg_dump` to export the entire PostgreSQL database
- Output is gzipped and saved to a backup directory on the host
- Retention: 90 days (oldest backups are auto-deleted)
- **Backup container:** A separate service in `docker-compose.yml` manages dumps

**Accessing backups on host:**
- Backups are stored in a Docker volume mounted on the host (typically `/var/lib/docker/volumes/...`)
- Or, if configured, a local directory: `./backups/` relative to docker-compose.yml
- To list: `ls -la ./backups/` (or equivalent in your Docker setup)
- To restore to a different instance: `pg_restore -U postgres -d checkpoint_db < backup-2025-04-09-12.sql.gz`

**Retention policy:**
- All backups older than 90 days are automatically pruned
- No action required; happens automatically

**Limitations:**
- Automated backups are PostgreSQL-native SQL dumps; they do not include Docker configuration or environment variables
- To migrate to a new server, export via JSON (see 14.2) for simpler import

### 14.2 Manual JSON Export

**Purpose:** Full backup including all 15 tables; portable across instances.

**Access:** Admin > Database Backup > Export

**Process:**
1. Click **Export Database as JSON**
2. Browser downloads a file: `checkpoint-backup-YYYY-MM-DD-HHmmss.json`
3. File size: ~1–10 MB depending on data volume

**What's included:**
- departments
- userGroups
- users (passwords hashed)
- employeeTypes
- companies
- leaveRules, leaveRulePhases
- leaveBalances, leaveRequests
- leaveAccrualRecords, sickLeaveTracking
- attendanceRecords
- orgPositions
- publicHolidays
- grievances
- auditLogs

**What's not included:**
- Session data (temporary, rebuilt on next login)
- Postmark settings (stored in environment variables, not DB)

**File format:** JSON array of tables:
```json
[
  {
    "table": "departments",
    "count": 5,
    "data": [...]
  },
  {
    "table": "users",
    "count": 42,
    "data": [...]
  },
  ...
]
```

**Backup strategy recommendations:**
- Export weekly (manual via UI or script)
- Store exports in offsite cloud storage (S3, Google Drive, etc.)
- Test restore once per quarter to verify backups are valid
- Keep at least 4 weeks of backups (rolling rotation)

### 14.3 Authenticated JSON Restore

**Purpose:** Restore data from a JSON export into an existing instance.

**Access:** Admin > Database Backup > Import

**Process:**
1. Click **Import Database from JSON**
2. Select a `.json` file from a previous export
3. System validates file structure:
   - Checks for all expected tables
   - Shows row counts per table
   - Displays warnings if counts are very low or zero
4. Review the summary
5. Click **Restore**
6. Data is imported additively (no overwrites)
7. Confirmation message shows total rows imported

**Validation step:**
- File is parsed and checked for structure before import
- Missing tables are warned (not fatal)
- Very low counts (e.g., 0 users) trigger a confirmation prompt

**Additive behavior:**
- Existing records are **not** overwritten
- New records are inserted
- If a record with the same primary key already exists, import is **skipped** for that row
- Use case: Restore from a point-in-time backup; new data created after backup is preserved

**Failure modes:**
- If import fails mid-process, partial data may be imported (non-atomic; would require manual cleanup)
- Always test restore in a dev environment first

### 14.4 Bootstrap Restore (Empty DB Only)

**Purpose:** Initialize a new instance with data from a previous instance.

**When available:** Only on the mode selector when database has **no users**.

**Use case:** 
- Setting up a replica instance
- Disaster recovery to a new server
- Development setup from production copy (with data anonymization)

**Process:**
1. On empty instance, mode selector shows **Bootstrap Restore** button
2. Click it
3. Upload a JSON export file
4. System validates structure
5. Click **Restore**
6. All data is imported; system is ready to use
7. Admin credentials from the backup are restored; user can log in with original password

**Difference from authenticated restore:**
- Bootstrap assumes the database is completely empty
- Used for initial population, not as a merge operation
- After bootstrap, the system is fully functional (no further setup needed)

### 14.5 Backup Strategy Recommendations

**Best practices:**

1. **Automated backups:** Keep the Docker automated backup enabled. It requires minimal configuration.

2. **Manual exports:** Export JSON weekly (e.g., Sunday nights via a cron job):
   ```bash
   curl -X POST http://localhost:5000/api/admin/backup/export \
     -H "x-api-key: <your-api-key>" \
     -o checkpoint-backup-$(date +\%Y-\%m-\%d).json
   ```

3. **Offsite storage:** Copy exports to a cloud service (AWS S3, Google Drive, Dropbox) within hours of creation.

4. **Retention:** Keep at least:
   - 1 daily backup × 7 days
   - 1 weekly backup × 4 weeks
   - 1 monthly backup × 3 months

5. **Testing:** Once per quarter, perform a test restore in a development environment:
   - Verify data integrity (row counts match)
   - Test employee login
   - Spot-check leave records

6. **Documentation:** Record backup locations, credentials, and restore procedures in your disaster recovery plan.

---

## Section 15: Leave Balance Reference: Rules Engine Deep Dive

This section details the mathematical foundations of leave accrual, balance calculation, and projection. For configuration, see Section 10.

### 15.1 Annual Leave Accrual Formula

**Monthly accrual (primary method):**

```
RATE = determined_rate_per_month (see tier logic below)
active_days = calendar_days_in_month - pausing_leave_days - termination_settlement_days
accrual = RATE × (active_days / calendar_days_in_month)
balance.total += accrual
```

**Rate determination (tier logic):**

```
if employee.annual_leave_override_days is NOT NULL:
    RATE = employee.annual_leave_override_days / 12
else:
    months_of_service = (today - employee.start_date) in months
    tier = max tier where min_months_of_service <= months_of_service
    RATE = tier.annual_entitlement_days / 12
```

**Active days reduction (pausing types):**

When an approved leave request of a "pausing" type overlaps the accrual month:
- `pausing_leave_days += working_days_of_leave_in_month`
- Pausing types: Unpaid, Maternity, Parental, Adoption, Commissioning, any custom with `pauses_annual_accrual = true`
- Non-pausing: Sick, FRL, Annual (itself)

**Example:**
- Employee: 18 months service, no override
- Tier: 15 days/year (rate 1.25/month)
- Month: March (31 days)
- Approved sick leave: 0 days in March (non-pausing, so no reduction)
- Accrual: 1.25 × (31 / 31) = **1.25 days**

**Example 2 (pausing leave):**
- Same employee, same tier
- Approved unpaid leave: 5 working days in March
- Active days: 31 - 5 = 26
- Accrual: 1.25 × (26 / 31) = **1.01 days**

**No rounding:** Exact decimal is stored (1.01, not 1.0). Display rounds to 2 places; calculations use full precision.

### 15.2 Annual Leave Cycle Rollover

**Trigger:** On the last day of the month before `annual_leave_cycle_start` (e.g., if cycle starts Jan 1, rollover fires Dec 31)

**Process:**
1. Calculate unused balance: `unused = total - taken - pending`
2. Set carry-over: `carryOverDays = max(0, unused)`
3. Reset cycle: `total = 0`
4. Set expiry: `carryOverExpiry = today + leave_carry_over_grace_months`
5. Notify employee and HR

**Forfeiture timing:**
- 60 days before expiry: Warning email sent
- 30 days before expiry: Warning email sent
- After expiry: Record flagged for HR review (not auto-forfeited)

**Example:**
- Cycle: January 1–December 31
- Employee balance at Dec 31: total=20, taken=15, pending=2, carryOverDays=0
- Unused: 20 - 15 - 2 = 3
- Rollover sets: carryOverDays=3, total=0, carryOverExpiry=June 30
- June 1: 60-day warning sent
- July 1: 30-day warning sent
- July 1+: HR must manually approve forfeiture; carry-over does not auto-expire

### 15.3 Sick Leave: Graduated Period (First 6 Months)

**Formula (during graduated accrual):**

```
days_worked_in_month = scheduled_working_days - leave_days_taken
cumulative_days_worked += days_worked_in_month
new_credit = floor(cumulative_days_worked / 26) - graduated_days_credited
balance.total += new_credit
graduated_days_credited += new_credit
```

**Key points:**
- Accrues at 1 day per 26 days worked
- "Days worked" = scheduled days minus **all** leave taken (any type)
- Cumulative; once 26 days are worked, employee receives 1 day of sick leave
- Stored per-employee in `sickLeaveTracking` table

**Example:**
- Employee: Month 1–6 (first 6 months)
- Days worked in month 1: 18 (out of 20 scheduled, 2 days sick taken)
- Cumulative: 18, graduated credit: 0 (18 < 26)
- Month 2: 22 days worked, cumulative = 40
- New credit: floor(40/26) - 0 = 1 day
- Balance increases by 1; graduated_days_credited = 1
- Month 3: 20 days worked, cumulative = 60
- New credit: floor(60/26) - 1 = 1 day (2 total, minus 1 already credited)

### 15.4 Sick Leave: Fixed Pool (After 6 Months)

**Transition (automatic, runs monthly):**

On the 1st of the month following the employee's 6-month anniversary:

```
full_entitlement = 30 × (employee.workDaysPerWeek / 5)
days_already_taken = sum of all sick leave taken to date
new_balance = full_entitlement - days_already_taken
balance.total = new_balance
graduated_accrual_active = false
```

**Example:**
- Employee: 6-month work anniversary on July 1
- Full-time (5 days/week): full_entitlement = 30 × (5/5) = 30 days
- Days taken so far: 5 days (during graduated period)
- New balance: 30 - 5 = 25 days
- Part-time (4 days/week): full_entitlement = 30 × (4/5) = 24 days
- New balance would be: 24 - days_taken

**36-month cycle reset:**

When `sick_cycle_start_date + 36 months` is reached:

```
new_entitlement = 30 × (employee.workDaysPerWeek / 5)
days_unused = reset (zeroed)
balance.total = new_entitlement
sick_cycle_start_date = today
graduated_accrual_active = false (remains false)
```

**Note:** Unused sick leave is **lost** at the 36-month boundary; no carry-over.

### 15.5 Family Responsibility Leave (FRL)

**Eligibility (evaluated at grant time):**
1. Employed ≥ 4 months from `start_date`
2. `workDaysPerWeek >= 4` (current value on the grant date)

**Grant (automatic, yearly):**
- On `annual_leave_cycle_start`, if eligible: grant 3 days
- If not eligible: no grant, no subsequent grants until conditions are met
- Once the 4-month threshold is crossed, it is **permanently satisfied** (no re-check on future cycles)

**On 4-month anniversary (before next cycle):**
- If 4 months have elapsed: 3 days granted immediately (no wait for next cycle)

**Change in working days/week:**
- If employee reduces to <4 days/week mid-cycle: no action (retain remaining FRL for cycle)
- Next cycle: if <4 days/week, no FRL granted that cycle (but still satisfy the "4 months employed" gate going forward)

### 15.6 Balance Display Formula

Displayed in the employee's leave view and approval requests:

| Label | Formula |
|---|---|
| **Available** | `total + carryOverDays - taken - pending` |
| **Taken** | `taken` |
| **Pending** | `pending` |
| **Total Entitlement** | `total` (current cycle) |
| **Carry-Over** | `carryOverDays` (with expiry date) |

**Interpretation:**
- **Available** = days the employee can use right now (accrued + carry-over, minus used and pending)
- **Total Entitlement** = days earned in the current cycle (not counting carry-over)
- **Carry-Over** = days from previous cycle(s), still valid until expiry

### 15.7 Future Accrual Projection

When an employee selects a leave end date in a future month, the system projects the balance as of that date.

**When triggered:**
- Leave request form: Employee selects a leave type and end date
- If end date is in a different calendar month from today: projection is calculated
- Non-Annual Leave types (Sick, FRL, etc.): no projection (hard balance check only)

**Algorithm:**

```
current_available = (today) balance
accrual_projection = 0

for each month from (last accrued month) to (month before end_date):
    calculate accrual using RATE (tier), active_days, pausing leaves
    accrual_projection += accrual
    if this month is annual cycle-end month:
        simulate rollover (carry-over calc)

projected_available = current_available + accrual_projection - pending_in_that_period
```

**Example:**
- Today: April 15
- Employee requests leave: June 1–5
- Current available: 8 days
- Accrual projection (May): 1.25 days
- Accrual projection (June 1–5): 0.2 days (pro-rated)
- Projected available on June 5: 8 + 1.25 + 0.2 = **9.45 days**
- Request needs 4 working days → allowed (with note: "future accrual covers this")

**Display:**
- Shows current available
- Shows accrual breakdown by month
- Shows projected available
- Shows coverage: ✓ "Covered by projected accrual" or ⚠️ "Insufficient balance warning"

**Backend endpoint:**

```
GET /api/leave-balances/:userId/projected?leaveType=Annual%20Leave&asOfDate=2025-06-05
```

Returns:
```json
{
  "currentAvailable": 8.0,
  "projectedAvailable": 9.45,
  "projectedAccrual": 1.45,
  "cycleResetOccurs": false,
  "carryOverCreated": null,
  "carryOverExpiry": null,
  "monthsProjected": 2,
  "breakdown": [
    { "month": "2025-05", "accrual": 1.25 },
    { "month": "2025-06", "accrual": 0.2 }
  ]
}
```

### 15.8 Manual Adjustment Audit Trail

HR can directly adjust any leave balance. Adjustments are audit-logged.

**Process:**
1. Navigate to employee's leave balance
2. Click **Adjust Balance**
3. Enter:
   - **New value** (total, taken, or pending — depending on context)
   - **Reason** (mandatory, free-text; e.g., "Correction for mis-recorded leave", "Settlement from legacy system")
4. Click **Save**
5. Audit log entry is created with:
   - `action: 'manual_adjustment'`
   - `entityType: 'leave_balance'`
   - `entityId: <leaveBalanceId>`
   - `changes: { field: { before, after } }`
   - `description: <reason>`

**Visibility:**
- Audit entry is visible in **Reports > Audit Logs**
- Can be filtered by action type, date range, user
- Permanent record; cannot be deleted from UI

---

## Section 16: Audit Logs

Audit logs record administrative actions and changes to sensitive data. All logged actions are permanent and visible to admins.

> **Admin-only:** Viewing and exporting audit logs requires `admin` role.

### 16.1 What's Captured

| Action Type | Details | Trigger |
|---|---|---|
| **manual_adjustment** | Leave balance change, field, old value, new value, reason | HR adjusts leave balance |
| **termination** | Employee termination date set, settlement amount, final balance | Admin sets `terminationDate` on user |
| **role_change** | User roles changed, before/after roles | Admin edits user roles |
| **settings_change** | Setting key, old value, new value (for sensitive settings) | Admin updates settings |
| **leave_decision** | Leave request approved/rejected, decision reason, approver | HR or manager makes decision |
| **historic_entry** | Historic leave record created, reference number, authorized by | Admin creates backfill entry |

### 16.2 Accessing Audit Logs

**Location:** **Admin Insights > Audit Logs** or **Reports > Audit Logs**

**Format:** Table with columns:
- Timestamp (local timezone)
- Actor (admin who performed action, or "system" if automated)
- Action type
- Entity (e.g., "Leave Balance #42", "User: John Doe")
- Description
- Before/After (if applicable)

### 16.3 Filtering

**Available filters:**
- **Action type** (dropdown: all types, or specific)
- **Date range** (from/to date picker)
- **User/Actor** (search by admin name)
- **Entity** (search by employee name, ID, or entity type)

**Example query:** "Show all manual adjustments for John Doe in April 2025"

### 16.4 Retention

**Retention policy:** Permanent. Audit logs are **never deleted** via the UI.

**Archival:** For very large audit logs (rare), consider exporting to CSV annually and storing offline:
1. Navigate to Audit Logs
2. Click **Export to CSV**
3. Save file locally
4. Manage retention per your compliance policies

---

## Section 17: API Reference

The AECE Checkpoint API allows third-party systems to query and manage leave and attendance data. Authentication is via session cookie or `x-api-key` header.

> **Full documentation:** API endpoint details are available in-app at **Settings > API**.

### 17.1 Authentication

**Two methods:**

1. **Session cookie** (authenticated user):
   - User logs in via `/api/auth/login`
   - Session ID is set as `connect.sid` cookie
   - All subsequent requests include the cookie automatically
   - Privileges are based on user's roles

2. **API key** (external integrations):
   - Include header: `x-api-key: <key>`
   - Bypasses session requirement
   - Grants full API access (same as admin user)
   - Keys are managed via **Settings > API**

**Example:**

```bash
# Session auth (after login)
curl http://localhost:5000/api/employees \
  -H "Cookie: connect.sid=<session-id>"

# API key auth (external)
curl http://localhost:5000/api/employees \
  -H "x-api-key: sk-..."
```

### 17.2 Endpoint Categories

**Users & Employees:**
- `GET /api/employees` — List all employees
- `GET /api/employees/:id` — Get employee details
- `POST /api/users` — Create user
- `PATCH /api/users/:id` — Update user
- `GET /api/users/kiosk` — Tile mode employee list (public)

**Leave Requests:**
- `POST /api/leave-requests` — Submit new request
- `GET /api/leave-requests` — List requests (filter by status, user)
- `PATCH /api/leave-requests/:id` — Update request (e.g., manager recommendation)
- `GET /api/leave-requests/:id` — Get request details

**Leave Balances:**
- `GET /api/leave-balances/:userId` — Get balances for employee
- `PATCH /api/leave-balances/:id` — Manual adjustment (HR only)
- `GET /api/leave-balances/:userId/projected` — Future projection

**Attendance:**
- `POST /api/attendance/clock-in` — Clock in (kiosk)
- `POST /api/attendance/clock-out` — Clock out (kiosk)
- `GET /api/attendance/:userId` — Get attendance records
- `GET /api/attendance/daily` — Daily summary (HR)

**Rules & Configuration:**
- `GET /api/leave-rules` — List leave rules
- `POST /api/leave-rules` — Create rule (HR)
- `GET /api/settings/:key` — Get setting value
- `PUT /api/settings/:key` — Update setting (admin only)

**Reports:**
- `GET /api/reports/hr-leave` — HR leave report (filtered by date, type)
- `GET /api/reports/attendance-trends` — Attendance analytics
- `GET /api/reports/bcea-preview` — BCEA statutory compliance report

**Other:**
- `GET /api/departments` — List departments
- `GET /api/companies` — List companies
- `GET /api/org-positions` — Org chart positions
- `GET /api/public-holidays` — Public holidays (with religion filter)
- `GET /api/audit-logs` — Query audit logs (admin only)
- `GET /api/grievances` — Grievances (admin/HR)

### 17.3 Full Documentation Location

In-app documentation includes:
- All endpoint signatures (method, path, parameters)
- Request and response schemas (JSON)
- Authentication requirements per endpoint
- Example curl commands
- Error codes and meanings

**Access:** **Settings > API** tab in the admin panel.

### 17.4 Integration Patterns

**Payroll system:** Query annual leave balances at month-end for payroll processing.

```bash
curl http://localhost:5000/api/leave-balances/EMP001 \
  -H "x-api-key: sk-..." | jq '.[] | select(.leaveType == "Annual Leave")'
```

**Attendance time-reporting export:** Get attendance records for a date range and export to CSV.

```bash
curl "http://localhost:5000/api/attendance/EMP001?from=2025-04-01&to=2025-04-30" \
  -H "x-api-key: sk-..."
```

**Employee data export:** Bulk export all employees for integration with HR systems.

```bash
curl http://localhost:5000/api/employees?export=csv \
  -H "x-api-key: sk-..." > employees-2025-04-09.csv
```

**Custom dashboard:** Use API to build real-time leave balance dashboards in third-party tools.

```javascript
fetch('http://localhost:5000/api/leave-balances/EMP001', {
  headers: { 'x-api-key': 'sk-...' }
})
  .then(r => r.json())
  .then(data => updateDashboard(data))
```

---

## Section 18: Troubleshooting and Maintenance

This section covers common issues, diagnostic steps, and recovery procedures.

### 18.1 Admin Login Fails

**Symptoms:** Email or password rejected; "Invalid credentials" error.

**Steps:**

1. **Verify credentials:**
   - Confirm email address (case-sensitive, though typically lowercase)
   - Check for Caps Lock on keyboard
   - Verify password was entered correctly (no typos)

2. **Use password reset:**
   - Click **Forgot Password** on login page
   - Enter admin email
   - Check email for reset link (may be in spam; sender is `sender_email` setting)
   - Click link (valid for 1 hour)
   - Set new password

3. **Check email configuration:**
   - If password reset email is not received, password reset is broken
   - Verify `sender_email` and `admin_email` settings (Settings > General)
   - Check Postmark dashboard for bounces or errors
   - Confirm Postmark API key is correct (in environment variables)

4. **Verify admin record exists:**
   - If no admins exist, the system shows a setup form on the login page instead
   - Use the setup form to create the first admin

5. **Check logs:**
   - Container logs: `docker logs <container-id>`
   - Look for authentication errors, password hash mismatches
   - Verify database connectivity

### 18.2 Face Recognition Not Matching

**Symptoms:** Kiosk camera captures face but does not recognize employee.

**Causes and solutions:**

| Issue | Cause | Solution |
|---|---|---|
| Poor lighting | Kiosk camera in shadows or backlit | Adjust lighting; ensure face is well-lit |
| Face angle | Employee looking away or tilted | Ask employee to look straight at camera |
| Glasses/sunglasses | Occluded eyes | Ask employee to remove glasses (if safe) |
| Poor registration | Original photo was low quality | Re-register employee's face |
| Multiple faces | Multiple people in frame | Ensure only one face in frame |

**Re-register employee face:**

1. Navigate to **Admin > Personnel > [Employee] > Photo & Face Registration**
2. Click **Re-register Face**
3. Camera opens; employee looks at camera
4. Multiple angles are captured (front, left, right, with/without glasses if applicable)
5. Click **Save**
6. Embeddings are updated in database

**Fallback:** Kiosk allows ID entry if face recognition fails. Employee can manually enter their ID.

**Tuning (advanced):** Matching threshold is hardcoded at ~0.6 Euclidean distance in `client/src/lib/face-recognition.ts`. Lower threshold = more lenient (more false positives); higher = stricter (more rejections). Requires code change and redeploy.

### 18.3 Emails Not Sending

**Symptoms:** Notifications are not received; no error messages in UI.

**Diagnostic steps:**

1. **Check settings:**
   - Navigate to **Settings > General**
   - Verify `admin_email` is set and valid (e.g., `admin@example.com`)
   - Verify `sender_email` is set and valid (e.g., `noreply@example.com`)
   - If either is blank, emails are silently dropped

2. **Check Postmark API key:**
   - Container logs: `docker logs <container-id> | grep -i postmark`
   - Look for: "POSTMARK_API_KEY not configured" or similar
   - Verify environment variable is set: `docker inspect <container-id> | grep POSTMARK`
   - If missing, add to `.env` or `docker-compose.yml`

3. **Test Postmark directly:**

```bash
curl https://api.postmarkapp.com/email \
  -X POST \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "X-Postmark-Server-Token: <POSTMARK_API_KEY>" \
  -d '{
    "From": "noreply@example.com",
    "To": "test@example.com",
    "Subject": "Test",
    "HtmlBody": "<p>Test email</p>",
    "MessageStream": "dev-stream"
  }'
```

Expected response: `200 OK` with `MessageID`.

4. **Check Postmark dashboard:**
   - Log in at `postmarkapp.com`
   - Navigate to **Activity** stream
   - Filter by sent/bounced/rejected
   - Look for your test email
   - If bounced: reason (e.g., invalid address, domain not verified)
   - If missing: API call did not reach Postmark (network issue, bad token)

5. **Verify domain is Postmark-verified:**
   - Postmark > **Sender Signatures**
   - Confirm your domain (e.g., `example.com`) is listed and verified (green checkmark)
   - If not verified: add SPF/DKIM records to your DNS; Postmark will guide you

6. **Check firewall/network:**
   - Container must have outbound HTTPS access to `api.postmarkapp.com:443`
   - If behind corporate proxy: configure proxy settings in container (requires env var setup)

### 18.4 Leave Balances Incorrect

**Symptoms:** Balance does not match expected (too high, too low, or negative).

**Diagnostic steps:**

1. **Review accrual records:**
   - Navigate to **Admin > Reports > Accrual Records** (if available) or **Audit Logs**
   - Search for the employee and leave type
   - Verify accrual is being credited each month
   - Check for errors (e.g., accrual = 0 unexpectedly)

2. **Verify employment start date:**
   - Navigate to **Personnel > [Employee] > Profile**
   - Check `Start Date` (used to calculate tier and months of service)
   - Verify it matches hire date
   - If wrong, correct it; next month's accrual uses the corrected date

3. **Check pausing leaves:**
   - If employee has unpaid/maternity leave approved, it reduces annual leave accrual for that month
   - Navigate to **Leave Calendar** and confirm leave is approved
   - If leave should not be pausing, edit the leave type settings

4. **Manual adjustment with audit trail:**
   - If balance is still incorrect, HR can directly adjust:
   - Navigate to **Personnel > [Employee] > Leave Balances**
   - Click **Adjust** on the balance
   - Enter new value and **mandatory reason** (e.g., "Corrected for accrual calculation error from March")
   - Audit log entry is created
   - Contact support if the error is systemic (affects many employees)

5. **Check for monthly accrual run failures:**
   - See **18.5: Monthly accrual did not run** below

### 18.5 Monthly Accrual Did Not Run

**Symptoms:** Balances have not increased; employees report no monthly accrual on the 1st of the month.

**Trigger:** Monthly accrual should fire automatically on the **1st of each month** (at midnight in the configured timezone).

**Diagnostic steps:**

1. **Check container logs:**
   - `docker logs <container-id> | grep -i "accrual\|cron\|monthly"`
   - Look for success messages (e.g., "Monthly accrual completed: 42 employees processed")
   - Look for errors (e.g., "Database connection failed")

2. **Verify timezone setting:**
   - Navigate to **Settings > General > Timezone**
   - Confirm it matches your organization's timezone
   - Accrual runs at midnight (00:00) in this timezone
   - If timezone was recently changed, accrual may have run at the old time

3. **Check scheduled job configuration:**
   - Container startup log: `docker logs <container-id> | head -20`
   - Look for: "Scheduled accrual job registered" or similar
   - If missing, job was not registered (possibly configuration error)

4. **Verify database connectivity:**
   - Container logs: Look for database errors
   - Test: `docker exec <container-id> psql -U postgres -d checkpoint_db -c "SELECT COUNT(*) FROM users"`
   - If command fails: DB connection issue (network, credentials, service stopped)

5. **Manually trigger accrual (testing only):**
   - Container logs should show accrual has run; if it has not, contact support
   - There is no UI button to manually trigger (would require code change)
   - After determining root cause, accrual can be re-run safely (idempotent; same month can be run multiple times without double-accrual)

### 18.6 Container/Service Issues

**Symptoms:** Container won't start, API is unreachable, or app crashes.

**Docker inspection:**

```bash
# Check container status
docker ps | grep checkpoint

# If not running, check logs
docker logs <container-id> --tail 100

# Restart container
docker-compose down && docker-compose up -d

# Check database
docker-compose ps  # Verify postgres service is running
docker logs <postgres-container-id>

# Inspect environment
docker inspect <container-id> | grep -A 20 "Env"
```

**Common issues:**

| Issue | Symptoms | Solution |
|---|---|---|
| **Port in use** | `Address already in use :5000` | Stop conflicting service or change port in docker-compose.yml |
| **Database connection fail** | `ECONNREFUSED postgres:5432` | Verify postgres service is running; check DATABASE_URL env var |
| **Missing env vars** | Various errors, API errors | Check `.env` file and docker-compose.yml environment section |
| **Disk full** | Random errors, database crashes | Check disk space: `df -h` |
| **Out of memory** | Container exits without error | Increase memory limit in docker-compose.yml; check resource leaks in logs |

### 18.7 Data Migration

**Scenario:** Migrating from old instance to new instance (same or different server).

**Process:**

1. **Export from old instance:**
   - Admin > Database Backup > Export
   - Download JSON file (save to safe location)

2. **Deploy new instance:**
   - Set up Docker containers (postgres + app)
   - Ensure database is empty (first start)

3. **Import to new instance:**
   - If new instance has no users, use Bootstrap Restore (mode selector)
   - If new instance already has data, use Admin > Database Backup > Import
   - Upload the JSON file

4. **Verify migration:**
   - Check row counts match (export should show summary)
   - Log in with old admin credentials
   - Spot-check leave records, employee data, settings
   - Test email notifications (Settings > General, test send)
   - Run a test leave request through workflow

5. **Notes:**
   - **Additive import:** Existing data is not overwritten; new rows are added
   - **Passwords:** Hashed passwords are migrated (employees keep old password)
   - **Sessions:** Not migrated (temporary; users log in again)
   - **Environment-specific:** Settings like `sender_email` and `admin_email` may differ; verify after import

---

## Summary

This System Reference Manual provides complete technical documentation for AECE Checkpoint administrators and advanced users. It covers:

- **Architecture & Roles:** System design, user roles, capabilities
- **Settings & Configuration:** All configurable parameters with defaults, effects, and warnings
- **Organisational Structure:** Departments, employee types, companies, org chart
- **Employee Administration:** User creation, role assignment, contract tracking
- **Leave Management:** Rules, accrual calculations, balance formulas, projections
- **Attendance:** Kiosk operations, cutoff settings, infringement detection, AWOL
- **Email Notifications:** 15+ notification types with triggers and content
- **Backup & Recovery:** Automated and manual backup, restore procedures
- **Audit & Compliance:** Logging, trail audit, data retention
- **API Integration:** Authentication, endpoints, integration patterns
- **Troubleshooting:** Common issues and diagnostic steps

For operational procedures and UI navigation, refer to the **HR Quick Reference** guide. For feature specifications and architectural decisions, see the **System Architecture Documentation (SAD)** in `/docs/sad/`.

---

## Appendix A: Settings Quick Reference

| Setting Key | Type | Default | Format | Effect |
|---|---|---|---|---|
| `admin_email` | Text | (empty) | Email(s), newline-separated | Recipient for alerts and escalations |
| `sender_email` | Text | (empty) | Email address | "From" address for outbound mail |
| `timezone` | Text | Africa/Johannesburg | IANA identifier | All timestamps, scheduled jobs |
| `annual_leave_cycle_start` | Integer | 1 | 1–12 | Month of annual cycle reset |
| `leave_carry_over_grace_months` | Integer | 6 | 1+ | Months after cycle for carry-over validity |
| `hr_approval_stage_enabled` | Boolean | true | true/false | 2-stage or 3-stage workflow |
| `clock_in_cutoff` | Time | 08:00 | HH:MM | Late arrival threshold |
| `clock_out_cutoff` | Time | 17:00 | HH:MM | Early departure threshold |
| `late_arrival_message_template` | Text | {name} (ID: {id}) clocked in late at {time}. | Templated text | Infringement notification |
| `early_departure_message_template` | Text | {name} (ID: {id}) left early at {time}. | Templated text | Infringement notification |
| `company_name` | Text | AECE Checkpoint | Free text | Displayed throughout UI |
| `company_logo` | Text | (empty) | Base64 data URI | Logo image |
| `primary_color` | Text | #1e40af | Hex color | Main brand color |
| `accent_color` | Text | #3b82f6 | Hex color | Secondary brand color |
| `term_employee` | Text | Employee | Singular noun | Label for staff member |
| `term_department` | Text | Department | Singular noun | Label for organizational unit |
| `term_clock_in` | Text | Clock In | Verb phrase | Label for arrival |
| `term_clock_out` | Text | Clock Out | Verb phrase | Label for departure |

---

**End of System Reference Manual**
