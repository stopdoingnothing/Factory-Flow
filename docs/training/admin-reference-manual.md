# System Reference Manual: AECE Checkpoint Administration

This is the authoritative technical reference for system administrators and advanced users managing AECE Checkpoint. It covers every configurable setting, system capability, and administrative function.

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
12. [Attendance Configuration & Operations](#section-12-attendance-configuration--operations)
13. [Email Notifications: Complete Reference](#section-13-email-notifications-complete-reference)
14. [Database Backup & Restore](#section-14-database-and-restore)
15. [Leave Balance Engine: Deep Dive](#section-15-leave-balance-engine-deep-dive)
16. [Audit Logs](#section-16-audit-logs)
17. [API Reference](#section-17-api-reference)
18. [Troubleshooting & Maintenance](#section-18-troubleshooting--maintenance)

---

## Section 1: System Architecture Overview

### 1.1 What AECE Checkpoint is

AECE Checkpoint is a self-hosted workforce management system consisting of:

- **Frontend:** React-based single-page application (SPA) with responsive design
- **Backend:** Express.js REST API handling all business logic
- **Database:** PostgreSQL relational database
- **Email:** Postmark SMTP service for transactional notifications
- **Deployment:** Docker containerized application with docker-compose orchestration
- **Scale:** Designed for 20–500 employee organizations

### 1.2 Role hierarchy and capabilities matrix

| Role | Description | Capabilities |
|---|---|---|
| **Employee** | Base role; all users have this | Submit leave requests, view own balance, clock in/out, view org chart, submit grievances |
| **Manager** | Added capability for supervisor-level users | View direct reports' leave requests, make manager-stage recommendations, view direct reports' attendance |
| **HR** | Added capability for HR personnel | Approve leave requests at HR stage, manage all employees, configure leave rules, view audit logs, manage settings |
| **Admin** | Super-user with all capabilities | HR capabilities + system settings (branding, permissions, API key), manage departments/companies/positions, backup/restore, database operations |

**Additive model:** A user can hold multiple roles. Roles are not hierarchical; there is no implicit inheritance. For example:
- User = `[employee, manager]` — can do both employee and manager tasks
- User = `[employee, hr, admin]` — can do all tasks
- Admin implicitly satisfies any role check

### 1.3 Admin vs HR capabilities: what admin can do that HR cannot

| Capability | HR | Admin |
|---|---|---|
| Approve/reject leave at HR stage | ✓ | ✓ |
| Manage employee profiles (create/edit/delete) | ✓ | ✓ |
| Configure leave rules and custom types | ✓ | ✓ |
| Manage public holidays | ✓ | ✓ |
| View audit logs | ✓ | ✓ |
| Change system settings (timezone, clock cutoffs, emails) | ✓ | ✓ |
| Branding configuration (company name, logo, colors) | ✗ | ✓ |
| Role permissions configuration | ✗ | ✓ |
| Create admin users | ✗ | ✓ |
| Manage departments, companies, org positions | ✗ | ✓ |
| Database backup/restore/export | ✗ | ✓ |
| API key management | ✗ | ✓ |

> **Admin-only:** Features marked above are restricted to the admin role.

### 1.4 Mode selection screen

When a user first visits the system URL without a session, they see a "Mode Selection" screen with two options:

- **Employee Portal** — Full login with email + password (or face recognition). Leads to the portal dashboard.
- **Attendance Kiosk** — Face recognition or tile-select attendance clocking. No login required; uses device camera or touchscreen.

---

## Section 2: Initial Setup Checklist

### 2.1 First-time setup sequence

Follow this order when setting up a fresh AECE Checkpoint instance:

1. **Timezone** — Set to your company's timezone (default: Africa/Johannesburg). Affects all timestamps and auto clock-out times.
2. **Admin Email** — Configure the email address(es) that receive system notifications. This is critical for observability.
3. **Sender Email** — Set the "from" address for outbound emails (must be Postmark-verified).
4. **Clock-In/Out Cutoffs** — Set the times after which clock-in is flagged as late and before which clock-out is flagged as early.
5. **Departments** — Create all departments your organization uses (e.g., Engineering, Sales, HR).
6. **Employee Types** — Define employment categories (Permanent, Contractor, Part-Time, etc.).
7. **Companies/Payroll Entities** — If you have multiple payroll entities, create them here.
8. **Org Positions** — Build the organizational hierarchy (Director > Manager > Supervisor > Employee).
9. **Leave Rules** — If you have custom leave types beyond BCEA defaults, configure them.
10. **Public Holidays** — Load your holiday calendar for the year.
11. **Branding** — Upload company logo, set colors, customize terminology.
12. **Role Permissions** — Adjust which UI sections each role can see (optional; defaults are sane).
13. **Create Employees** — Bulk import or manually create employee records.

### 2.2 Bootstrap restore from backup

If you have a backup JSON file from another instance and want to restore it to a fresh AECE Checkpoint:

1. Ensure the target database is **empty** (no users, no records)
2. Visit the home URL (you'll see a "Mode Selection" screen because there's no authenticated session)
3. Look for a button **"Restore from Backup"** or click the settings icon
4. Select your backup JSON file
5. Review the validation summary (number of records, tables affected)
6. Click **Confirm Restore**

The system will import all data from the backup. This is useful for:
- Migrating from a test instance to production
- Disaster recovery

> **Note:** This button is only visible when the database is empty. Once you have users or records, you must use the authenticated import function (see Section 14.3).

### 2.3 Verifying email delivery

To confirm that Postmark is configured and emails are sending:

1. Navigate to **Settings** → **General tab**
2. Look for a button **"Send Test Email"** (or similar)
3. Enter a test recipient email address
4. Click **Send**
5. Check the recipient's inbox for a test email from `noreply@aece.co.za`

If the email doesn't arrive:
- Check that `admin_email` and `sender_email` are set correctly
- Verify the Postmark API key is configured (ask your admin/DevOps team)
- Check the Postmark dashboard for bounce or block records

---

## Section 3: System Settings: General

All settings are configured via **Settings** → **General Tab**.

### 3.1 `admin_email`

**Purpose:** Email address(es) that receive all system notifications: leave request submissions, AWOL alerts, late arrival flags, escalation reminders, etc.

**Format:** Email address(es), one per line. Example:
```
hr@company.com
hrmanager@company.com
```

**Default:** Not set (empty)

**Effect if changed:** Updates to the current setting apply immediately. Existing pending notifications will not be re-sent to the new address.

**Warning:** If this is not set, HR/managers may miss critical notifications. Always configure this.

---

### 3.2 `sender_email`

**Purpose:** The "from" address on all outbound emails. Must be verified with Postmark.

**Format:** A single email address, e.g., `noreply@aece.co.za`

**Default:** `noreply@aece.co.za`

**Effect if changed:** All future emails use the new sender address. Existing emails cannot be changed.

**Important:** The email address must be:
- Valid and well-formed
- Verified in your Postmark account (contact Postmark support if needed)
- Consistent with your domain (to avoid spam flagging)

---

### 3.3 `timezone`

**Purpose:** The system's timezone, used for timestamp calculations, auto clock-out times, and leave cycle calculations.

**Format:** IANA timezone identifier, e.g., `Africa/Johannesburg`, `UTC`, `America/New_York`

**Default:** `Africa/Johannesburg`

**Effect if changed:** All future timestamps are calculated in the new timezone. Existing timestamps are NOT retroactively recalculated.

**Warning:** Changing timezone mid-year can cause confusion. Do not change lightly.

---

### 3.4 `annual_leave_cycle_start`

**Purpose:** The month the system uses as the start of the 12-month annual leave and FRL cycle.

**Format:** Month number, 1–12, e.g., `1` for January, `4` for April

**Default:** `1` (January)

**Effect if changed:** The next cycle reset will use the new month. Existing balances are not retroactively reset.

**Example:** If you set this to `4`, the annual leave year runs April 1 – March 31 instead of Jan 1 – Dec 31.

---

### 3.5 `leave_carry_over_grace_months`

**Purpose:** The number of months after the annual leave cycle ends before carry-over days are forfeited.

**Format:** Number of months, e.g., `6` means 6 months from cycle end

**Default:** `6`

**Effect if changed:** New carry-over expirations will use the new grace period. Existing carry-over expirations are not recalculated.

**Example:** Cycle ends Dec 31. Grace period is 6 months. Carry-over expires June 30. On July 1, carry-over days are flagged for HR to forfeit.

---

### 3.6 `hr_approval_stage_enabled`

**Purpose:** Toggle between two-stage and three-stage leave approval workflow.

**Format:** Boolean (`true` or `false`)

**Default:** `true` (three-stage is standard)

**Options:**
- `true` — Three-stage workflow: Employee → Manager (recommends) → HR (decides)
- `false` — Two-stage workflow: Employee → Manager (approves directly)

**Effect if changed:** Immediately affects new requests. Existing pending requests keep their current workflow.

---

## Section 4: System Settings: Attendance

All settings are configured via **Settings** → **Attendance Tab**.

### 4.1 `clock_in_cutoff`

**Purpose:** Time after which a clock-in is flagged as late arrival.

**Format:** HH:MM in 24-hour format, e.g., `08:30`, `09:00`

**Default:** `08:30` (8:30 AM)

**Effect if changed:** Clock-ins at or before this time are on-time; after this time are flagged as late. The change applies to all future clock-ins.

**Example:** If set to `09:00`, an employee clocking in at 09:01 is flagged as late.

---

### 4.2 `clock_out_cutoff`

**Purpose:** Time before which a clock-out is flagged as early departure.

**Format:** HH:MM in 24-hour format, e.g., `16:30`, `17:00`

**Default:** `16:30` (4:30 PM)

**Effect if changed:** Clock-outs at or after this time are on-time; before this time are flagged as early. The change applies to all future clock-outs.

**Example:** If set to `17:00`, an employee clocking out at 16:59 is flagged as early departure.

---

### 4.3 `late_arrival_message_template`

**Purpose:** Email body template for late arrival notifications sent to managers and admin.

**Format:** Plain text with optional placeholders: `{name}`, `{id}`, `{time}`, `{cutoff}`, `{date}`

**Default:** 
```
{name} ({id}) clocked in at {time} on {date}, which is after the cutoff of {cutoff}.
```

**Example customization:**
```
Employee {name} (ID: {id}) arrived at {time} on {date}. Cutoff is {cutoff}. Please follow up if this is a pattern.
```

---

### 4.4 `early_departure_message_template`

**Purpose:** Email body template for early departure notifications.

**Format:** Plain text with placeholders: `{name}`, `{id}`, `{time}`, `{cutoff}`, `{date}`

**Default:** 
```
{name} ({id}) clocked out at {time} on {date}, which is before the cutoff of {cutoff}.
```

---

## Section 5: System Settings: Branding

All settings are configured via **Settings** → **Branding Tab**.

### 5.1 `company_name`

**Purpose:** Displayed in page titles, email footers, PDF headers, and the portal header.

**Format:** Plain text, up to 50 characters

**Default:** `AECE Checkpoint`

**Effect:** All displays are updated immediately.

---

### 5.2 `company_logo`

**Purpose:** Image displayed in the top-left of the portal header and in PDF exports.

**Format:** Image file (PNG, JPG), converted to base64 for storage

**Default:** AECE default logo

**Effect:** Updated immediately in the header and next PDF export.

---

### 5.3 `primary_color`, `accent_color`

**Purpose:** Hex color codes for buttons, badges, highlights, and UI accents.

**Format:** Hex color code, e.g., `#0056B3`, `#28A745`

**Default:** Blue (`#0056B3`) and green (`#28A745`)

**Effect:** All UI elements using these colors update immediately upon save.

---

### 5.4 Terminology Overrides

Allow customization of common terms throughout the UI.

| Setting | Purpose | Default |
|---|---|---|
| `term_employee` | What to call "Employee" | "Employee" |
| `term_department` | What to call "Department" | "Department" |
| `term_clock_in` | What to call "Clock In" | "Clock In" |
| `term_clock_out` | What to call "Clock Out" | "Clock Out" |

**Example:** If you set `term_employee` to "Staff Member", all UI labels change from "Employee" to "Staff Member".

---

## Section 6: System Settings: Role Permissions

> **Admin-only:** This setting is only visible to users with the admin role.

Configure which UI sections and capabilities each role can see and use.

### 6.1 What role permissions control

Permissions are feature flags that toggle UI visibility and action buttons. Two categories:

- **Navigation permissions** — Whether a role sees a menu item
- **Capability permissions** — Whether a role can perform an action (e.g., delete an employee)

### 6.2 Navigation Permissions (12 keys)

| Permission Key | Label | Default Roles | What it controls |
|---|---|---|---|
| `apply_for_leave` | Apply for Leave | employee, manager, hr | Whether role sees "Leave Request" nav item |
| `my_attendance` | My Attendance | employee, manager, hr | Whether role sees "My Attendance" nav item |
| `my_profile` | My Profile | employee, manager, hr | Whether role sees "My Profile" nav item |
| `grievances` | Grievances | employee | Whether role sees "Grievances" nav item |
| `admin_insights` | Admin Insights | hr, admin | Whether role sees "Dashboard" nav item (admin view) |
| `personnel` | Personnel | hr, admin | Whether role sees "Personnel" nav item |
| `my_team` | My Team | manager, hr, admin | Whether role sees "My Team" nav item |
| `org_chart` | Org Chart | employee, manager, hr, admin | Whether role sees "Org Chart" nav item |
| `leave_requests` | Leave Requests | hr, admin | Whether role sees "Leave Requests" nav item |
| `attendance` | Attendance | hr, admin | Whether role sees "Attendance" nav item |
| `attendance_reports` | Attendance Reports | hr, admin | Whether role sees "Attendance Reports" nav item |
| `leave_calendar` | Leave Calendar | manager, hr, admin | Whether role sees "Leave Calendar" nav item |

### 6.3 Personnel Page Capabilities (7 keys)

| Permission Key | Default Roles | What it controls |
|---|---|---|
| `add_person` | hr, admin | Whether role can create new employees |
| `export_pdf` | hr, admin | Whether role can export employee data as PDF |
| `missing_information_report` | hr, admin | Whether role can generate a report of incomplete profiles |
| `edit_employee` | hr, admin | Whether role can edit employee details |
| `terminate_reactivate_employee` | hr, admin | Whether role can terminate or reactivate employees |
| `delete_employee` | admin | Whether role can delete employee records |
| `assign_roles` | admin | Whether role can change a user's roles |

**Note:** `add_admin` is hardcoded to admin only and is not configurable via this UI.

### 6.4 How to change permissions

1. Navigate to **Settings** → **Role Permissions Tab**
2. For each role (Employee, Manager, HR), see a list of toggles
3. Toggle each feature on/off as desired
4. Click **Save Permissions**
5. Changes take effect immediately without a page reload

### 6.5 Multi-role user behavior

A user can have multiple roles. When checking if a user can perform an action:
- `canSee(permission)` returns `true` if ANY of the user's roles has the permission
- `canDo(action)` returns `true` if ANY of the user's roles has the action capability

**Example:** A user with roles `[manager, hr]` can see the "Leave Requests" nav item if either the manager OR hr role has `leave_requests` permission (by default, only hr does, so the user sees it).

### 6.6 Warning: minimum viable permissions

If you remove all permissions from a role, users with only that role will see:
- A mostly empty Dashboard (no nav items visible)
- A warning banner: "Your account has no permissions. Contact an administrator."

This is a valid state for testing or temporarily disabling a role.

---

## Section 7: System Settings: API Key

> **Admin-only:** This setting is only visible to users with the admin role.

### 7.1 Purpose of the external API key

The API key authenticates third-party integrations (e.g., payroll systems, reporting tools) to call AECE Checkpoint endpoints. It's a static bearer token used in the `X-Api-Key` HTTP header.

**Authenticated endpoints available with API key:**
- All GET endpoints (read-only access to employees, leave balances, attendance, reports)
- Most POST/PATCH endpoints (full API surface)
- Exceptions: login, password reset (session-only)

**Use cases:**
- Payroll system querying leave balances for deduction calculations
- BI tool pulling attendance and leave reports
- Legacy HR system syncing employee data

### 7.2 Viewing the current API key

1. Navigate to **Settings** → **API Tab**
2. The API key is displayed in a text field, **masked by default** (shows `••••••••` for security)
3. Click the **eye icon** to reveal the full key
4. Copy the key to clipboard (button provided)

### 7.3 Regenerating the API key

1. Navigate to **Settings** → **API Tab**
2. Click **Regenerate API Key**
3. Confirm the action (a warning appears: "The old key will be invalidated immediately")
4. A new key is generated and displayed
5. **All requests using the old key will immediately fail**
6. Update any integrations with the new key before revoking the old one

> **Warning:** Regeneration is immediate. Give integrations time to update before revoking.

### 7.4 API endpoint documentation

1. Navigate to **Settings** → **API Tab**
2. Look for a section **"Endpoint Documentation"** or **"Available Endpoints"**
3. A list displays all available endpoints with:
   - HTTP method (GET, POST, PATCH, DELETE)
   - URL path (e.g., `/api/employees`, `/api/leave-requests`)
   - Request/response examples (often in a collapsible section)
   - Required authentication method (API key or session)

### 7.5 Security considerations

- **Treat API keys as credentials** — Do not share in Slack, email, or version control
- **Rotate periodically** — Regenerate the key every 6–12 months
- **Limit scope** — If possible, use a separate account with minimal permissions for API integrations
- **Monitor usage** — Check audit logs for API key usage patterns

---

## Section 8: Organisational Structure Configuration

> **Admin-only:** Most of these settings are only visible to users with the admin role.

### 8.1 Departments

**Purpose:** Grouping employees by team/functional area for reporting, leave calendar filtering, and org structure.

**Create a department:**
1. Navigate to **Settings** → **Departments Tab** (or admin > Departments)
2. Click **+ New Department**
3. Enter name (e.g., "Engineering", "Sales", "HR") and optional description
4. Click **Save**

**Edit a department:**
1. Find the department in the list
2. Click **Edit**
3. Change name or description
4. Click **Save**

**Delete a department:**
1. Click the department
2. Click **Delete**
3. **Deletion is blocked if any employees are assigned to this department**. Reassign employees first.

---

### 8.2 Employee Types

**Purpose:** Categorizing employees by contract type (Permanent, Contractor, Part-Time, etc.). Affects which leave rules apply to them.

**Create an employee type:**
1. Navigate to **Admin** → **Employee Types** (or Settings → Employee Types)
2. Click **+ New Type**
3. Enter:
   - **Name** (e.g., "Permanent", "Contractor")
   - **Leave Label** — What to call leave for this type (e.g., "Leave" for permanent, "Unavailable" for contractors)
   - **Has Leave Entitlement?** — "yes" or "no" (contractors may not have entitlements)
   - **Is Permanent?** — "yes" or "no" (Contractors have end dates; Permanent don't)
   - **Is Default?** — "yes" or "no" (the default type for new employees)
4. Click **Save**

**Example employee types:**
- **Permanent:** Has Leave Entitlement = yes, Is Permanent = yes, Is Default = yes
- **Contractor:** Has Leave Entitlement = no, Is Permanent = no, Is Default = no
- **Part-Time:** Has Leave Entitlement = yes, Is Permanent = yes, Is Default = no

---

### 8.3 Companies / Payroll Entities

**Purpose:** Tracking which payroll company an employee belongs to (for multi-entity organizations).

**Create a company:**
1. Navigate to **Admin** → **Companies**
2. Click **+ New Company**
3. Enter name (e.g., "AECE SA (Pty) Ltd") and optional registration number
4. Click **Save**

**Assign an employee to a company:**
1. Navigate to **Personnel**
2. Click the employee
3. In the edit form, select **Company**
4. Click **Save**

---

### 8.4 Org Chart Positions

**Purpose:** Defining the organizational hierarchy (reporting structure, titles) independent of employees.

**Create a position:**
1. Navigate to **Admin** → **Org Positions**
2. Click **+ New Position**
3. Enter:
   - **Title** (e.g., "CEO", "Engineering Manager", "Developer")
   - **Department** (e.g., "Engineering")
   - **Parent Position** (who does this position report to? e.g., CEO's parent is none; Manager's parent is CEO)
   - **Sort Order** (controls left-to-right order in org chart)
   - **Is Outsourced** — "yes" or "no" (visual indicator for outsourced roles)
   - **Tier** (controls vertical spacing; higher = lower on org chart)
4. Click **Save**

**Hierarchy example:**
```
CEO (no parent)
├─ CFO (parent: CEO)
│  ├─ Accountant (parent: CFO)
│  └─ Payroll Officer (parent: CFO)
└─ Engineering Manager (parent: CEO)
   ├─ Senior Developer (parent: Engineering Manager)
   └─ Developer (parent: Engineering Manager)
```

---

### 8.5 User Groups

**Purpose:** Grouping admin-level users for organizational context (e.g., "HR Team", "Finance Team").

**Create a user group:**
1. Navigate to **Settings** → **User Groups Tab**
2. Click **+ New Group**
3. Enter name (e.g., "HR Team") and optional description
4. Click **Save**

**Assign a user to a group:**
1. Navigate to **Personnel**
2. Click the user
3. In the edit form, select **User Group**
4. Click **Save**

---

## Section 9: Employee Administration

> **Admin-only:** Most of these functions are restricted to users with the admin role.

### 9.1 Adding an admin user

Only the admin role can create new admin users (not available via Personnel).

1. Navigate to **Settings** → **User Management** (or Admin panel)
2. Look for a button **"+ Add Admin User"**
3. Fill in:
   - **Name** (first name and surname)
   - **Email** (work email, must be unique)
   - **Password** (system-generated; will be sent to them)
   - **User Group** (optional; for organizational grouping)
4. Click **Save**
5. An email is sent to the new admin with credentials

---

### 9.2 Role assignment

Any admin user can change another user's roles.

1. Navigate to **Personnel**
2. Click the user
3. In the edit form, look for **Roles** (checkboxes for employee, manager, hr, admin)
4. Check/uncheck as needed:
   - `[x] employee` — All users need this
   - `[ ] manager` — Check if they manage direct reports
   - `[ ] hr` — Check if they approve leave
   - `[ ] admin` — Check if they manage settings
5. Click **Save**

**Examples:**
- New hire: `[x] employee`
- Team lead: `[x] employee, [x] manager`
- HR officer: `[x] employee, [x] hr`
- System admin: `[x] employee, [x] admin` (admin implicitly includes HR)

---

### 9.3 Bulk leave balance CSV import

Import multiple leave balance records at once (e.g., go-live data migration, batch corrections).

1. Navigate to **Leave Balances**
2. Click **Bulk Import**
3. Prepare a CSV file with columns:
   - `employeeId` — The employee's ID (must exist in the system)
   - `leaveType` — Type name, e.g., "Annual Leave", "Sick Leave"
   - `total` — The number of days (decimal allowed, e.g., 3.5)
   - `taken` — Days already used (decimal allowed)
   - `pending` — Days pending approval (decimal allowed)
4. Upload the file
5. The system validates and shows a preview:
   - Number of records to import
   - Number of updates vs. new creates
   - Any errors (e.g., employee not found)
6. Click **Confirm Import**

**CSV example:**
```
employeeId,leaveType,total,taken,pending
AECE1001,Annual Leave,15,3,2
AECE1001,Sick Leave,30,1,0
AECE1002,Annual Leave,15,0,0
AECE1002,Sick Leave,30,2.5,0
```

---

### 9.4 Contract history

Track contract extensions, type changes, and employment milestones.

**View a user's contract history:**
1. Navigate to **Personnel**
2. Click the user
3. Look for the **"Contract History"** tab
4. A timeline shows all recorded events (created, extended, converted, ended)

**Add a contract event manually:**
1. In the same Contract History tab, click **+ Add Event**
2. Select the action (created, extended, converted, ended)
3. For extended/converted: enter old values and new values
4. Enter a reason (e.g., "Contract extended due to project continuation")
5. Click **Save**

---

## Section 10: Leave Rules Configuration

### 10.1 BCEA statutory leave types reference

These are built-in and managed by the system. Do **not** create custom rules for these.

| Leave Type | Entitlement | Accrual Method | Cycle | BCEA Section |
|---|---|---|---|---|
| **Annual Leave** | 1.25 days/month (min 15 days/year) | Monthly (tiered) | 12 months calendar year | § 20 |
| **Sick Leave** | 30 days (full time, 5-day week) | Graduated 1/26 first 6 months, then full | 36 months rolling | § 22 |
| **Family Responsibility Leave** | 3 days | Lump sum per cycle | 12 months calendar year | § 27 |
| **Maternity Leave** | 87 days (4 weeks before, post-birth non-working) | Statutory, once triggered | Per pregnancy | § 25(2) |
| **Parental Leave** | 10 days | Statutory, once triggered | Per birth | § 25A(1) |
| **Adoption Leave** | 50 days | Statutory, once triggered | Per adoption | § 25A(3) |
| **Commissioning Parental Leave** | 50 days | Statutory, once triggered | Per arrangement | § 25A(4) |

---

### 10.2 Accrual rate tiers for annual leave

The system supports tiered annual leave rates based on tenure.

**Default tier setup:**
- **Tier 1** — 0–23 months of service → 15 days/year (1.25 days/month)
- **Tier 2** — 24+ months of service → 20 days/year (1.67 days/month)

**Modify tiers:**
1. Navigate to **Leave Rules** → **Accrual Rate Tiers** (or similar)
2. Edit the threshold months and corresponding annual days
3. Click **Save**

**Effect:** New accrual calculations use the updated tiers. Existing balances do not retroactively recalculate until the next monthly accrual run.

---

### 10.3 Custom leave rule field reference

Create custom leave types (study leave, bereavement leave, etc.) with these settings.

| Field | Options / Format | Purpose | Example |
|---|---|---|---|
| `leaveType` | Text (unique) | Name of the leave type | "Study Leave" |
| `description` | Text | Human description | "Approved study for professional development" |
| `accrualType` | none / lump_sum / monthly | How days are granted | "monthly" = 0.5 days/month |
| `daysEarned` | Decimal | Days earned in accrual type period | 0.5 for monthly; 5 for annual |
| `periodDaysWorked` | Integer | (For per-days-worked accrual) days worked to earn daysEarned | Not applicable for monthly/lump_sum |
| `cycleLengthMonths` | Integer | How long the cycle is (months) | 12 (annual); 36 (3 years) |
| `cycleAnchor` | calendar_year / employment_start_date | When cycle resets | calendar_year = all reset Jan 1 |
| `carryOverAllowed` | true / false | Can unused days carry to next cycle? | true (allow carry-over) |
| `maxDaysPerCycle` | Integer | Optional cap on maximum accrual per cycle | 10 (max 10 days/year) |
| `pausesAnnualAccrual` | true / false | Does time on this leave count as inactive for annual accrual? | true (unpaid leave pauses annual) |
| `employeeTypeApplicability` | Array | Which employee types can use this | ["Permanent", "Part-Time"] (not Contractors) |

**Example 1: Study Leave (lump sum, annual)**
- leaveType: "Study Leave"
- accrualType: "lump_sum"
- daysEarned: 5 (5 days per year)
- cycleLengthMonths: 12

**Example 2: Bereavement Leave (approval-only)**
- leaveType: "Bereavement Leave"
- accrualType: "none" (HR grants as needed)
- carryOverAllowed: false

---

### 10.4 Phased leave rules

Define different accrual rates for different periods of an employee's tenure with the same leave type.

**Use cases:**
- Probation period (first 6 months) gets lower accrual; post-probation gets higher
- Year 1 gets one rate; Year 2+ gets another

**Create a phase:**
1. Open or create a leave rule
2. Click **+ Add Phase**
3. Fill in:
   - **Phase Name** — e.g., "Probation"
   - **Starts After Months** — e.g., 0 (from start) or 6 (after 6 months)
   - **Accrual in This Phase** — Different rate from the main rule
4. Click **Save**

**Example:**
- Main rule: "Study Leave", 1 day/month
- Phase 1: "Probation" (0–6 months), 0 days/month
- Phase 2: (After 6 months, defaults to main rule 1 day/month)

---

### 10.5 Public holidays configuration

**Add a holiday:**
1. Navigate to **Leave Rules** → **Public Holidays**
2. Click **+ New Holiday**
3. Enter:
   - **Name** — e.g., "Christmas Day"
   - **Date** — e.g., "2025-12-25"
   - **Recurring** — true = same date every year; false = one-off
   - **Type** — "public" or "religious"
   - **Religion** — blank (for everyone) or specific (Muslim, Christian, Jewish, Hindu)
   - **Description** — optional notes
4. Click **Save**

**Effect:** The date is excluded from leave day calculations. For example, if an employee is on leave on a public holiday, that day doesn't count as a leave day.

---

### 10.6 Unpaid leave notice period configuration

The system enforces a default 7-day advance notice period for unpaid leave. Employees who request unpaid leave with <7 days' notice trigger a flag for HR discretion.

> **Note:** The notice period is currently hardcoded at 7 days. In a future version, it will be configurable via Settings.

---

## Section 11: Leave Workflow Configuration

### 11.1 Two-stage vs three-stage approval

**Three-stage workflow (default):** Employee → Manager (recommends) → HR (decides)
**Two-stage workflow:** Employee → Manager (approves directly)

**Toggle between them:**
1. Navigate to **Settings** → **General Tab**
2. Find the setting `hr_approval_stage_enabled`
3. Set to `true` (three-stage) or `false` (two-stage)
4. Click **Save**

**Effect:**
- **Three-stage:** Manager makes a recommendation; HR can approve/reject (may override manager's recommendation)
- **Two-stage:** Manager's decision is final; request approved/rejected at manager stage
- **Changing mid-cycle:** Existing pending requests keep their current workflow. New requests use the new workflow.

---

### 11.2 Leave escalation reminders

Requests pending more than 3 days automatically trigger reminder emails.

**How it works:**
- Runs every 8 hours
- Identifies requests still in pending_manager or pending_hr status that are >3 days old
- Sends email to the responsible party (manager or HR) with a list of overdue requests

**Manual trigger:**
1. Navigate to **Leave Requests**
2. Look for a button **"Send Escalation Reminders"** (or similar)
3. Click to immediately send reminders for all overdue requests (doesn't wait for the scheduled job)

---

### 11.3 Cancellation rules

| Status | Employee can cancel? | Admin can cancel? | Effect |
|---|---|---|---|
| `pending_manager` | Yes | Yes | Reserved days restored to pending balance |
| `pending_hr` | No (request state is locked) | Yes | Reserved days restored to pending balance |
| `approved` | No | Yes | Days restored; if settled, reduced from taken balance |
| `rejected` | No | No | Already rejected; no balance change |
| `cancelled` | N/A | — | Already cancelled; no further change |

---

### 11.4 Annual leave cycle rollover parameters

Configure when and how annual leave cycles reset.

**Settings:**
- `annual_leave_cycle_start` (Section 3.4) — Month when the cycle resets (e.g., 1 for January)
- `leave_carry_over_grace_months` (Section 3.5) — How many months after cycle end before carry-over expires (e.g., 6)

**Example:**
- Cycle starts January 1
- Employee earns 15 days in the 12-month cycle (Jan 1 – Dec 31)
- On Dec 31, if they have unused days, those carry forward
- Carry-over expires 6 months later (June 30)
- On July 1, carry-over is flagged for forfeit if not yet used

---

## Section 12: Attendance Configuration & Operations

### 12.1 Kiosk mode

The attendance kiosk is a face-recognition or tile-based clock-in/out system requiring no login.

**Face recognition kiosk:**
- Employee stands in front of a camera (e.g., a tablet mounted at the entrance)
- The system recognizes their face by matching against stored face descriptors
- Clock-in or clock-out is recorded automatically
- If no match, employee falls back to ID entry

**Tile mode kiosk:**
- Screen displays a grid of employee photo tiles
- Employee taps their tile
- Clock-in or clock-out is recorded automatically
- Managers can approve logins for employees without passwords

**Configuration:**
1. Navigate to **Settings** → **Kiosk Tab** (if available)
2. Select mode (Face or Tile)
3. Configure any additional options (timeout, camera settings, etc.)

---

### 12.2 Clock cutoff settings

Covered in Section 4.1 and 4.2. These determine what clock times are flagged as late/early.

---

### 12.3 Auto clock-out reset

The system runs an automatic clock-out reset every night (usually at midnight in your configured timezone).

**What it does:**
1. Finds all employees still clocked in from the prior day
2. Creates an automatic clock-out record at 23:59 of the prior day
3. Sends emails to the employee and their manager
4. Runs AWOL detection (identifies employees with no clock-in and no approved leave)
5. Runs leave escalation reminders

**Manual trigger:**
If the scheduled job fails or you need to run it manually:
1. Navigate to **Attendance**
2. Look for a button **"Run Auto Clock-Out"** (or **"Run Nightly Reset"**)
3. Click to execute immediately

---

### 12.4 Infringement types and triggers

Three types of infringements are automatically flagged:

| Type | Trigger | Email Recipients | Use Case |
|---|---|---|---|
| **Late Arrival** | Clock-in after `clock_in_cutoff` | Manager, admin_email | Tracking tardiness patterns |
| **Early Departure** | Clock-out before `clock_out_cutoff` | Manager, admin_email | Tracking early departures (legitimate or not) |
| **Missed Clock-Out** | Employee still clocked in at end of day (auto-reset applies) | Employee, manager | Notification that system auto-clocked them out |

---

### 12.5 AWOL detection

Runs nightly as part of the auto-reset job.

**Identifies:** Employees with NO clock-in record AND NO approved leave for the previous day.

**Sends:** Email to the employee's manager (grouped; one email per manager listing all their AWOL reports) or admin_email if no manager assigned.

**Action:** Manager/HR should:
1. Verify the employee was actually absent
2. Check if leave was mistakenly not approved or not visible
3. Issue appropriate discipline (verbal warning, written warning, etc.) if unexcused

---

## Section 13: Email Notifications: Complete Reference

Postmark sends all notifications using the configured `sender_email` address. All outbound email bodies are templated and can be partially customized (e.g., late/early arrival messages).

### Email Notification Matrix

| # | Email Function | Trigger | Recipients | Subject | Content | Customizable? |
|---|---|---|---|---|---|---|
| 1 | sendLeaveRequestNotification | Employee submits leave request | Manager (if assigned) + admin_email | "New Leave Request" | Employee name, leave type, dates, balance context | Partially |
| 2 | sendLeaveStageNotification | Manager makes decision (forwards to HR) OR HR approves (notifies employee) | HR emails + employee (on approval) | "[Manager Forwarded]" or "[Approved]" | Request details, manager recommendation, HR decision | Partially |
| 3 | sendLateAttendanceNotification | Clock-in after `clock_in_cutoff` | Manager + admin_email | "Late Arrival Alert" | `late_arrival_message_template` with placeholders | Yes (template) |
| 4 | sendMissedClockOutNotification | Auto clock-out runs at 23:59 | Employee | "Missed Clock-Out" | System clocked you out at 23:59 | No |
| 5 | sendManagerMissedClockOutAlert | Auto clock-out runs | Manager + admin_email | "Team Member Missed Clock-Out" | Employee name, date, auto clock-out time | No |
| 6 | sendAWOLAlert | AWOL detected (no clock-in, no leave) | Manager (grouped per manager) or admin_email | "AWOL Report" | List of employees, dates, action items | No |
| 7 | sendLeaveEscalationReminder | Request pending >3 days (every 8 hours) | Manager (pending_manager) or admin_email (pending_hr) | "[Escalation] Pending Leave Request(s)" | List of overdue requests, approval links | No |
| 8 | sendAdminWelcomeEmail | New admin user created | New admin's email | "Welcome to AECE Checkpoint" | Login credentials (legacy; now uses password reset) | No |
| 9 | sendAdminCredentialsEmail | POST /resend-credentials called | User's email | "Password Reset Link" | Time-limited reset link (1 hour) | No |
| 10 | sendPasswordResetEmail | POST /auth/request-reset called | User's email | "Password Reset Link" | Time-limited reset link (1 hour) | No |
| 11 | (Carry-over 60-day warning) | Monthly accrual run; carry-over expiry in 60 days | Employee + HR | "Carry-Over Expiry Warning" | Days expiring soon; remind to use | No |
| 12 | (Carry-over 30-day warning) | Monthly accrual run; carry-over expiry in 30 days | Employee + HR | "[URGENT] Carry-Over Expiry" | Days expiring soon; urgent reminder | No |
| 13 | (Carry-over expiry flag) | Carry-over grace period elapsed | HR | "Carry-Over Forfeiture Flag" | Expired carry-over; manual action needed | No |
| 14 | (Sick leave 6-month transition) | Employee reaches 6 months employment | Employee + HR | "Sick Leave Pool Granted" | Full sick pool now available (30 days or scaled) | No |
| 15 | (Sick leave 36-month reset) | 36-month sick cycle resets | Employee + HR | "Sick Leave Cycle Reset" | Old cycle ended; new pool granted; old days forfeited | No |
| 16 | (Termination settlement) | terminationDate set | All HR users | "Employee Termination Settlement" | Final leave balances for payroll | No |

---

## Section 14: Database Backup & Restore

### 14.1 Automated Docker backup

The system includes an automated backup container that:
- Runs `pg_dump` every 6 hours
- Compresses the dump with gzip
- Stores it in the `./data/backups/` directory (on the host machine)
- Retains 90 days of backups (older ones are deleted automatically)

**Accessing backup files:**
1. SSH into the host server
2. Navigate to the backup directory (path varies; usually `/path/to/factory-flow/data/backups/`)
3. List the backups: `ls -lh *.sql.gz`
4. Each file is named with a timestamp: `aece-backup-2025-04-09-14-30-00.sql.gz`

**Offsite backup recommendation:**
- Periodically copy backups to cloud storage (S3, Azure Blob, etc.)
- Retention: keep at least 30 days of daily backups offsite

---

### 14.2 Manual JSON export

Export the entire database as a single JSON file (portable, easy to restore).

1. Navigate to **Admin** → **Database Backup**
2. Click **Export to JSON**
3. A JSON file downloads (filename: `aece-backup-YYYY-MM-DD.json`)
4. File size: typically 1–10 MB depending on data volume

**What's included:** All tables and records (15 data categories):
- Users (employees, roles, passwords hashed)
- Leave balances, requests, rules
- Attendance records, settings
- Public holidays, grievances, notifications
- All audit logs
- Org structure (departments, positions, companies)

---

### 14.3 Authenticated JSON restore

Import a JSON backup into the current AECE Checkpoint instance.

1. Navigate to **Admin** → **Database Backup**
2. Click **Import from JSON**
3. Select the JSON file
4. The system validates the file structure and shows a preview:
   - Number of records per table
   - Any validation errors
5. Click **Confirm Import**

**Behavior:**
- **Additive restore:** New records are inserted; existing records with the same primary key are **not** overwritten
- **Use case:** Restoring deleted data without wiping current changes

**To perform a full restore** (overwrite all data), contact your admin/DevOps team to:
1. Drop and recreate the database
2. Then run the JSON import

---

### 14.4 Bootstrap restore (empty database)

For disaster recovery or fresh instance setup.

1. Ensure the database is completely empty (no users, no records)
2. Visit the system URL (you'll see the "Mode Selection" screen)
3. Click **"Restore from Backup"** or similar button
4. Select a backup JSON file
5. Review the preview
6. Click **Confirm Restore**

After the restore, the system is fully populated. Users can log in immediately.

---

### 14.5 Backup strategy recommendations

**Daily backups:**
- Automated Docker backups every 6 hours are sufficient for operational recovery

**Weekly manual JSON export:**
- Every Friday, export a JSON backup
- Store locally and upload to cloud storage (e.g., S3)
- Retain for 30 days

**Monthly offsite archive:**
- Keep one monthly backup in cold storage for compliance/audit purposes

**Disaster recovery testing:**
- Monthly: restore a backup to a test instance
- Verify data integrity
- Time the restore process so you know RPO/RTO

**Retention policy:**
- On-host automated backups: 90 days
- Cloud backups: 30 days (rolling)
- Archive: 2 years (for compliance)

---

## Section 15: Leave Balance Engine: Deep Dive

### 15.1 Annual leave accrual formula

**Monthly accrual calculation:**
```
Monthly accrual = Tier Rate × (Active Days in Month / Total Calendar Days in Month)
```

**Tier determination:**
- `0–23 months employment` → Tier 1: 15 days/year (1.25 days/month)
- `24+ months employment` → Tier 2: 20 days/year (1.67 days/month)
- Custom override via `annualLeaveOverrideDays` → bypass tier logic entirely

**Pausing leave types:**
If an employee is on a "pausing" leave type (e.g., unpaid leave with `pausesAnnualAccrual: true`), those days do **not** count as active for accrual. Example:
- Employee takes 5 days of unpaid leave (pausing) in March
- That month's active days = 22 (not 21 for the unpaid)
- Annual accrual still runs on the full month

**Example:**
- Employee: 10 months tenure, Tier 1 (15 days/year = 1.25 days/month)
- March: 22 active days, 31 calendar days
- Accrual: 1.25 × (22 / 31) = 0.89 days (March accrual)

---

### 15.2 Annual leave cycle rollover

At the end of the annual cycle (default Dec 31):

1. **Balance snapshot:** Current balance = accrual + carry-over − taken − pending
2. **Carry-over calculation:** Unused days at cycle end = Balance − 0 = Balance (if positive)
3. **Grace period:** Carry-over expires 6 months later (default June 30)
4. **Forfeiture email:** 60-day warning (May 1), then 30-day urgent (July 1)
5. **Expiry flag:** On July 1, if carry-over is still present, a flag appears in HR's queue
6. **Manual action:** HR must manually reduce the balance (see Section 5.2) to forfeit the carry-over

**Example:**
- Employee ends 2024 with 8 days unused
- These 8 days carry forward to 2025
- Carry-over expires June 30, 2025
- May 1, 2025: HR gets 60-day warning email
- July 1, 2025: System flags carry-over for forfeit
- HR manually removes the 8 days with audit reason: "Carry-over forfeiture as of 2025-06-30"

---

### 15.3 Sick leave: graduated accrual (first 6 months)

For the first 6 months of employment, sick leave accrues at:
```
Graduated accrual = Days worked × (1 / 26)
```

The system tracks cumulative days worked and credits accrual accordingly.

**Example:**
- Employee starts 2025-01-01
- By 2025-06-30 (6-month mark), they've worked 130 days
- Sick leave credited: 130 ÷ 26 = 5 days
- On day 181 (6 months exactly), the system grants the full 30-day pool
- Total sick balance becomes 35 days (5 + 30)

**Tracking:**
- Use the `sickLeaveTracking` table to monitor cumulative days worked
- Do **not** manually adjust sick leave during the graduated period unless correcting an error

---

### 15.4 Sick leave: fixed pool (after 6 months)

After 6 months of employment, the employee is granted the full statutory entitlement:

**5-day/week employees:**
```
Sick leave entitlement = 30 days per 36-month cycle
```

**Part-time employees (scaled by work days per week):**
```
Sick leave entitlement = 30 × (work days per week / 5)
```

**Example:**
- 3-day/week part-time employee
- Entitlement: 30 × (3 / 5) = 18 days per 36-month cycle

**36-month cycle reset:**
Every 3 years, the cycle resets. The employee's balance resets to the full entitlement, and any unused days from the prior cycle are forfeited.

---

### 15.5 Family Responsibility Leave

**Eligibility:**
- 4+ months of employment **AND**
- 4+ days per week work schedule

**Entitlement:**
- 3 days per 12-month annual cycle (lump sum, not accrued)
- No carry-over (unused days are forfeited at cycle end)
- Resets on the annual leave cycle start date (default Jan 1)

**Example:**
- Employee starts 2025-03-01, works 5 days/week
- Eligible for FRL on 2025-07-01 (4 months later)
- But wait—cycle reset is Jan 1, so they're already mid-cycle
- FRL is granted immediately: 3 days available until 2025-12-31
- On 2026-01-01 (new cycle), 3 days refresh (or forfeit if unused)

---

### 15.6 Balance display formula

| Balance Item | Formula | Purpose |
|---|---|---|
| **Available** | (Total + Carry-over) − (Taken + Pending) | Days the employee can take now |
| **Total Entitlement** | Accrued + Granted for cycle | Days earned for the current cycle |
| **Carry-over** | Days not used from prior cycle | Days that rolled forward (with expiry date) |
| **Taken** | Days from settled/historic requests | Days already used |
| **Pending** | Days from approved but unsettled requests | Days from approved requests not yet occurred |

**Example:**
- Total: 15 (earned for cycle)
- Carry-over: 3 (with expiry 2025-06-30)
- Taken: 5 (used so far)
- Pending: 2 (from approved request next week)
- **Available = (15 + 3) − (5 + 2) = 11 days**

---

### 15.7 Future accrual projection

When an employee requests leave, the system projects their balance at the time they'll take the leave.

**Use case:** Employee has 8 days available today, but requests 10 days of leave next month. Projection shows they'll accrue 1.25 days in the interim, bringing available to 9.25 days—still short, but shows they're close.

**Projection logic:**
1. Current available balance
2. Add accrual for each month between now and leave start date
3. Subtract any other pending approvals
4. Result: projected balance at leave start date

**Messages:**
- **"[Balance note]"** — Projection shows they'll have enough by leave start. Safe to approve.
- **"[Balance warning]"** — Projection shows they'll still be short. Discretion required.

---

### 15.8 Manual adjustment audit trail

Every manual balance adjustment is logged in the audit log with:
- Actor (who made the change)
- Before/after values
- Mandatory reason (provided by HR)
- Timestamp

**Audit log format:**
```
Action: manual_adjustment
Entity: leave_balance
Changes: {
  total: { before: 15, after: 18 },
  reason: "Correction: employee negotiated additional 3 days"
}
```

---

## Section 16: Audit Logs

### 16.1 What's captured

Every significant action is logged to the `audit_logs` table:

| Action | Logged Details |
|---|---|
| `update_user_profile` | User ID, fields changed (role, termination date, start date, email, department), before/after values |
| `manual_adjustment` | Balance ID, total/taken/pending before/after, reason provided |
| `create_historic_leave` | Leave request ID, employee, type, dates, authorizedBy, referenceNumber |
| `admin_cancel_leave` | Request ID, status before cancel, balance adjustment applied |
| `update_setting` | Setting key, old value, new value |
| `user_login` | User ID, timestamp |
| `create_user` | New user ID, initial roles |
| `user_terminated` | User ID, termination date, settlement amount (if applicable) |
| `notice_period_bypass` | Leave request ID, bypass reason, actor |
| `user_role_assignment` | User ID, roles before/after |

---

### 16.2 Accessing audit logs

1. Navigate to **Reports** → **Audit Logs** (or **Admin Insights** → **Audit Logs**)
2. You'll see a table of recent events (last 1000 records)
3. Columns: Timestamp, Actor, Action, Entity Type, Entity ID, Changes, Description

---

### 16.3 Filtering and searching

- **Date range picker** — Narrow to a time period
- **Action type dropdown** — Filter by action (create_user, manual_adjustment, etc.)
- **User search** — Filter by actor (who performed the action)
- **Export** — Download the current view as CSV

---

### 16.4 Retention policy

- **Logs are permanent** — Never deleted (unless you manually delete them from the database, which is not recommended)
- **Searchable** — Full-text search on descriptions and changes
- **Immutable** — Once logged, cannot be modified

---

## Section 17: API Reference

### 17.1 Authentication

Two methods:

**Session-based (portal login):**
- User logs in via email + password
- A session cookie is issued
- All subsequent requests include the cookie
- Available to all authenticated users

**API key (for integrations):**
- External systems include `X-Api-Key: [api_key]` header
- Available to all endpoints except password reset and login
- Useful for third-party integrations (payroll, BI tools, etc.)

---

### 17.2 Key endpoint categories

| Category | Endpoints | Purpose |
|---|---|---|
| **Users** | GET /api/users, POST /api/users, PUT /api/users/:id, DELETE /api/users/:id | Manage employee records |
| **Leave Requests** | GET /api/leave-requests, POST /api/leave-requests, PATCH /api/leave-requests/:id | Submit and approve leave |
| **Leave Balances** | GET /api/leave-balances, PATCH /api/leave-balances/:id | Query and adjust balances |
| **Attendance** | GET /api/attendance, POST /api/attendance, PATCH /api/attendance/:id | Clock in/out, view records |
| **Leave Rules** | GET /api/leave-rules, POST /api/leave-rules, DELETE /api/leave-rules/:id | Configure custom leave types |
| **Settings** | GET /api/settings, PATCH /api/settings | View and change system settings |
| **Reports** | GET /api/reports/leave, GET /api/reports/attendance | Export data |
| **Audit** | GET /api/audit-logs | Access audit trail |

---

### 17.3 Full documentation location

In-app API documentation is available at:
1. Navigate to **Settings** → **API Tab**
2. Look for a section **"Endpoint Documentation"**
3. A list shows all endpoints with request/response schemas and examples

---

### 17.4 Integration patterns

**Payroll system query:**
```
GET /api/leave-balances?userId=AECE1001&leaveType=Annual%20Leave
Header: X-Api-Key: [api_key]
```
Response: Current balance for annual leave deduction calculations.

**BI tool attendance export:**
```
GET /api/attendance?from=2025-04-01&to=2025-04-30
Header: X-Api-Key: [api_key]
```
Response: All attendance records for the period, ready for reporting.

---

## Section 18: Troubleshooting & Maintenance

### 18.1 Admin login fails

**Symptoms:** "Invalid email or password" error when admin tries to log in.

**Diagnosis:**
1. Verify the email address is spelled correctly (case-insensitive)
2. Verify Caps Lock is not on
3. Check that the user exists in the database (navigate to Personnel, search for the user)
4. Check that the user has the `admin` role

**Resolution:**
- If the password is forgotten, click **"Forgot Password"** on the login screen
- A password reset email will be sent (if email is configured)
- If email is not configured, ask another admin to reset the password via the Settings panel
- Or, use the database to reset the password (requires admin/DevOps team)

---

### 18.2 Face recognition not matching

**Symptoms:** Employee's face is not recognized at the kiosk; they must use ID entry.

**Causes:**
- Face descriptor not registered (employee is new)
- Poor capture quality (lighting, alignment)
- Employee has changed appearance (beard, glasses, hairstyle)
- Camera quality or distance issue

**Resolution:**
1. Re-register the employee's face (see Section 10.2)
2. Ensure good lighting and alignment
3. Have the employee remove glasses if possible
4. Test the new face registration at the kiosk

---

### 18.3 Emails not sending

**Symptoms:** Notifications aren't received; no email in admin's inbox.

**Diagnosis:**
1. Check **Settings** → **General** → `admin_email` is set correctly
2. Check **Settings** → **General** → `sender_email` is set and Postmark-verified
3. Check the Postmark dashboard for bounce records (email address invalid)
4. Check the Postmark dashboard for hard bounces or blocks

**Resolution:**
1. Verify email addresses are correct (no typos)
2. If a sender email is not verified in Postmark, contact Postmark support
3. If an admin email has soft-bounced, correct the address in settings
4. Re-run the email that failed (manually trigger escalation reminders, resend credentials, etc.)

---

### 18.4 Leave balances appear incorrect

**Symptoms:** Employee has wrong leave balance; doesn't match BCEA calculations.

**Diagnosis:**
1. Check employee's start date (affects accrual)
2. Check tier system (0–23 months = Tier 1; 24+ = Tier 2)
3. Check for any manual adjustments (audit log)
4. Check for pausing leave types (unpaid leave might have paused annual accrual)
5. Use BCEA SA Preview (Section 9.3) to compare against statutory entitlement

**Resolution:**
1. If start date is wrong, correct it (see Section 4.2)
2. Run the monthly accrual manually (ask admin/DevOps)
3. If a manual adjustment was made in error, make a correcting adjustment (Section 5.2)
4. If the accrual logic itself is wrong, contact the development team

---

### 18.5 Monthly accrual did not run

**Symptoms:** Employees' annual leave balances didn't increase on month end.

**Diagnosis:**
1. Check server logs for accrual job errors
2. Verify the server is running and the database is accessible
3. The accrual engine is idempotent (safe to re-run)

**Resolution:**
1. Check server status; restart if needed
2. Manually trigger the accrual job (ask admin/DevOps team)
3. Accrual is safe to re-run—employees won't be double-credited

---

### 18.6 Container or service issues

**Symptoms:** The application is down, slow, or unreachable.

**Common commands (for DevOps/admin):**
```bash
# Check container status
docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps

# View logs
docker-compose logs -f api

# Restart services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart api

# Verify database connectivity
docker-compose exec api npm run db:check
```

---

### 18.7 Data migration considerations

If importing a JSON backup into a new instance:

1. **Validation summary:** Review the import preview before confirming
2. **Additive restore:** New records are added; existing records are **not** overwritten
3. **For a clean restore:** Drop and recreate the database first, then import
4. **Test in a staging environment first** before importing to production
5. **Verify data integrity** after import (spot-check employee records, balances, audit logs)

---

## Conclusion

This manual covers every administrative function in AECE Checkpoint. For further support, contact your system administrator or development team.

**Key takeaways:**
- Configure settings in order (Section 2.1)
- Use role permissions to customize UI per role (Section 6)
- Monitor audit logs for compliance (Section 16)
- Test backups regularly (Section 14.5)
- Escalate technical issues to DevOps (Section 18)
