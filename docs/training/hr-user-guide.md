# HR User Guide: AECE Checkpoint Leave Management System

Welcome to AECE Checkpoint! This guide will help you get fully up to speed on your first week as an HR user. By the end, you'll be able to handle every routine HR task without needing to ask for help.

## Table of Contents

1. [Welcome & Orientation](#section-1-welcome--orientation)
2. [Your Daily Workflow](#section-2-your-daily-workflow)
3. [Managing Leave Requests](#section-3-managing-leave-requests)
4. [Employee Management (Personnel)](#section-4-employee-management-personnel)
5. [Leave Balances](#section-5-leave-balances)
6. [Configuring Leave Rules](#section-6-configuring-leave-rules)
7. [Attendance Management](#section-7-attendance-management)
8. [Grievance Management](#section-8-grievance-management)
9. [Reporting & Audit](#section-9-reporting--audit)
10. [Face Registration](#section-10-face-registration)
11. [Common Scenarios & Edge Cases](#section-11-common-scenarios--edge-cases)
12. [Quick Help Reference](#section-12-quick-help-reference)

---

## Section 1: Welcome & Orientation

### 1.1 What is AECE Checkpoint and why HR uses it

AECE Checkpoint is an automated leave management system that replaces manual Excel tracking. It handles employee leave requests, attendance tracking via face recognition, payroll compliance, and generates the reports you need for audits. Your job as HR is to approve leave requests, manage employee profiles, track attendance, and ensure everything stays compliant with South African labour law (BCEA).

### 1.2 Your role vs. manager vs. employee

The system has three main user types you'll interact with:

- **Employee** — submits leave requests, views their own leave balance, clocks in/out
- **Manager** — reviews their direct reports' leave requests and makes a **recommendation** (but doesn't approve; that's your job)
- **You (HR)** — makes the final **approval** or **rejection** decision on all leave requests; manages employee profiles; configures policies; views everything

The key thing to understand: **Managers recommend, you decide.** A manager's "not recommended" is just their opinion. You can override it if you choose to.

### 1.3 Logging in

You'll receive a login email with your credentials (or an admin will provide them).

1. Open your browser and go to your system URL (ask admin if you're unsure)
2. You'll see a login screen
3. Enter your email address and password
4. Click "Log In"
5. You'll land on your Dashboard

> **Note:** If your face has been registered in the system, you can also click "Use Face Recognition" to log in with your camera instead of typing your password.

### 1.4 Dashboard orientation

Once logged in, you'll see a navigation menu on the left. Here's what each section does:

- **Dashboard** — Your home screen with key stats: pending requests, employees on leave today, clock-in status, recent activity
- **Leave Requests** — All leave requests in the system; where you approve/reject
- **Leave Calendar** — Visual calendar showing who's on approved leave
- **Attendance** — Clock in/out records, infringement flags, manual entry
- **Personnel** — Employee directory; where you create, edit, terminate employees
- **Grievances** — Employee grievances; where you review and resolve them
- **Leave Rules** — Configure custom leave types and holidays
- **Org Chart** — Visual organization structure
- **Reports** — Leave reports, audit logs, BCEA previews
- **Settings** — System configuration (advanced; admin-only features)

---

## Section 2: Your Daily Workflow

### 2.1 Morning checklist

Every morning, spend 5 minutes on this checklist:

1. **Check Leave Requests** — Navigate to Leave Requests, filter by "Pending HR". Are there any requests waiting for your decision? Aim to decide on requests within 24 hours of the manager's recommendation.
2. **Check Attendance Flags** — Navigate to Attendance, look for infringement badges (red flags). Any employees clocking in late or leaving early? If a pattern emerges, flag it with their manager.
3. **Check Escalation Reminders** — Look in your email inbox. Did you receive any "leave request escalation" emails? These are requests that have been pending for more than 3 days and need action.
4. **Check AWOL Alerts** — Did you get an email about "absent without leave" (AWOL) employees? Review and coordinate with managers on the list.
5. **Check Carry-Over Warnings** — Are there any emails about annual leave carry-over expiring soon? You may need to remind employees to use their balance.

### 2.2 Understanding the notification emails you'll receive

You'll receive automated emails from the system. Here's what each one means:

| Email Subject | What triggered it | What you should do |
|---|---|---|
| New leave request submitted | Employee submitted a request | Wait for manager's recommendation, then review and decide |
| [NOT RECOMMENDED] leave forwarded to HR | Manager said "no" to an employee's request | Read the manager's notes; decide if you agree or override |
| Escalation reminder: pending leave | Request has been pending >3 days | Find the request and make a decision urgently |
| AWOL alert | Employees worked without clocking in AND have no approved leave | Check attendance records; follow up with managers |
| Late arrival flag | Employee clocked in after your cutoff time | Informational; act only if it's a pattern |
| Early departure flag | Employee clocked out before your cutoff time | Informational; act only if it's a pattern |
| Employee missed clock-out | Employee still "clocked in" at end of day | Informational; system auto-clocked them out at 23:59 |
| Carry-over approaching expiry (60 days) | Annual leave carry-over will expire soon | Inform the employee they should use their balance |
| Carry-over approaching expiry (30 days) | Annual leave carry-over expiry is urgent | Inform the employee urgently; they're losing days soon |
| Employee termination settlement | An employee was terminated | Review their final balance for payroll |

### 2.3 When to act vs when to wait

Some notifications require action; others are just informational.

**Act immediately:**
- Pending HR leave requests (decision needed)
- AWOL alerts (coordinate with managers)
- Carry-over expiry (notify employee)

**Act if a pattern emerges:**
- Late arrival / early departure flags (one or two isn't usually a problem)
- Missed clock-out (expected occasionally)

**Just acknowledge / file:**
- Manager decision forwarded (you'll review it when you process the request)
- Termination settlement (use it for payroll reference)

---

## Section 3: Managing Leave Requests

### 3.1 How the three-stage workflow works

Leave requests follow a three-step approval process:

```
Employee submits
        ↓
   Manager reviews and recommends
        ↓
   HR makes final decision (approve/reject)
        ↓
   Employee is notified
```

Here's what happens at each stage:

**Employee submits:**
- Employee fills out a form: leave type, dates, reason, any supporting documents
- System checks for basic errors (dates, balance, overlaps)
- Request is automatically sent to the employee's manager (status: `pending_manager`)

**Manager reviews:**
- Manager sees the request in their queue
- Manager can click "Recommend" or "Not Recommend" and add notes
- Either way, the request moves to your queue (status: `pending_hr`)

**You decide:**
- You see the manager's recommendation (green banner = "Recommend", red banner = "Not Recommend")
- You can override the manager's opinion; their recommendation is just advisory
- You click "Approve" or "Reject"
- Employee is notified of your decision

> **Important:** Managers can only *recommend*. They cannot approve or reject. You have the final authority.

### 3.2 Finding pending requests

1. Click **Leave Requests** in the left nav
2. Look for requests with status `Pending HR` (filter available at the top)
3. Sort by date to see oldest-first (so you prioritize requests that have been waiting longest)

### 3.3 Reviewing a request

When you click on a request, you'll see a panel with:

- **Employee name and ID** — at the top
- **Leave type** — e.g., "Annual Leave"
- **Dates** — start and end date, total working days calculated
- **Reason** — what the employee wrote
- **Current balance** — how many days they have available, how many they're taking, how many remain
- **Manager recommendation** — a green or red banner showing the manager's view and their notes
- **Medical certificate flags** — if applicable (for sick leave >2 days, or Friday-Monday patterns, or adjacent to public holidays)
- **Admin notes** — any system-generated warnings (e.g., balance projection note, overlap warning)
- **Documents** — any attachments the employee uploaded (e.g., medical cert, family documents)

Read all of this before deciding.

### 3.4 Approving a request

1. Open the leave request (as above)
2. Scroll down to the "Approval" section
3. Click the green **Approve** button
4. (Optional) Add a comment explaining your decision
5. Click **Confirm**
6. The system will:
   - Update the employee's leave balance (move days to "pending")
   - Change the request status to `Approved`
   - Send the employee an email notification

### 3.5 Rejecting a request

1. Open the leave request
2. Scroll down to the "Approval" section
3. Click the red **Reject** button
4. **Enter a reason** (required — the system won't let you skip this)
5. Click **Confirm**
6. The system will:
   - Restore any reserved days to the employee's balance
   - Change the request status to `Rejected`
   - Send the employee an email notification with your reason

> **Warning:** Once you reject a request, the action is permanent and audit-logged. Make sure your reasoning is clear, because the employee may appeal.

### 3.6 Overriding a "not recommended" decision

Managers sometimes recommend rejection for reasons that you might disagree with. You can approve a request even if the manager said "no".

Here's when you might override:

- Manager said "no" due to team coverage, but you have strategic reasons to approve anyway
- Manager misunderstood the policy (e.g., said "no" to FRL when the employee is eligible)
- An error in the system led the manager to a wrong conclusion

**How to override:**

1. Open the request (which has the red "Not Recommend" banner from the manager)
2. Click **Approve** anyway
3. In your comment field, briefly explain why you're overriding (e.g., "Manager concerned about coverage, but executive sign-off obtained for this period")
4. Confirm
5. Your comment will be visible to the manager and in audit logs

### 3.7 Medical certificate requirements

For sick leave, the system automatically flags requests that need a medical certificate:

**The flag appears if:**
- The request is for more than 2 consecutive days, OR
- The request starts on a Monday (suspicious pattern), OR
- The request starts after a public holiday (Friday-Monday sandwich), OR
- The request ends on a Friday before a public holiday

**What you should do:**

1. When you see a request with a medical certificate flag, check the **Documents** section
2. Look for an attached medical certificate (PDF, image, etc.)
3. If no document is attached and the flag is present, **you may reject the request** with a note asking for the certificate
4. Alternatively, you can approve it conditionally, with a comment like "Approved pending receipt of medical certificate"

> **Note:** Policy is that you should not approve a flagged sick leave request without a document unless there's a good reason (e.g., employee is in hospital without access to a phone). When in doubt, ask for the cert.

### 3.8 Half-day requests

Some employees request half-days (AM or PM). The system tracks this:

- **AM leave:** Employee takes morning off, works afternoon
- **PM leave:** Employee works morning, takes afternoon off
- **Working days deduction:** Each half-day = 0.5 days

Example: An employee takes Mon-Tue (2 days) plus Wed AM (0.5 days) = 2.5 days total.

When you approve, the balance will reflect this correctly. No special action needed on your part.

### 3.9 Watching for balance warnings in admin notes

When you review a request, you might see a note in the **Admin Notes** section like:

**"[Balance note]"** — The employee currently doesn't have enough balance, but our accrual projection shows they will by the time they take leave. Approving now is safe; they'll accumulate the days in time.

**"[Balance warning]"** — The employee doesn't have enough balance AND our projection shows they won't accumulate enough in time either. Approving requires your discretion; you may need to override with an exception or ask the employee to adjust dates.

If you see a balance warning, you can still approve if you choose to (your discretion), but do so intentionally. Add a comment like "Discretionary approval; employee aware of shortfall."

### 3.10 Historic leave entry

Sometimes you need to backfill leave from physical records (e.g., converting from an old system).

1. Click **Leave Requests**
2. Look for a button labeled **"Add Historic Entry"** (usually near the top)
3. Fill in:
   - **Employee** — search by name or ID
   - **Leave type** — e.g., "Annual Leave"
   - **Dates** — the period this leave covers
   - **Reason** — e.g., "Backfilled from leave record dated 2025-01-15"
   - **Authorized by** — the name of the person who approved it originally (e.g., "John Smith")
   - **Reference number** — from the original leave book or system (e.g., "LB-2025-001")
4. Click **Save**
5. The system will:
   - Mark it as `Approved` automatically (because it's historic)
   - Deduct the working days immediately from the employee's balance
   - Audit-log the entry for compliance

> **Note:** Historic entries are assumed to be accurate. Don't use this for current leave requests; use the normal submit flow instead.

---

## Section 4: Employee Management (Personnel)

### 4.1 Navigating the employee list

1. Click **Personnel** in the left nav
2. You'll see a table of all employees
3. Use the search box to find by name or employee ID
4. Click a column header to sort (e.g., "Department")
5. Use filters (e.g., "Department") to narrow down the list

### 4.2 Creating a new employee

1. Click the green **"+ Add Person"** button
2. Fill in the form. Here's what each field does:

**REQUIRED fields (must fill):**
- **Employee ID** — A unique identifier, e.g., "AECE1001" or "EMP-001". Choose a format and stick with it.
- **First Name** — Self-explanatory
- **Surname** — Self-explanatory
- **Email** — The employee's work email (needed for leave notifications)
- **Role** — Select "Employee" (unless they're also a manager)
- **Department** — Which team/department they belong to
- **Employee Type** — Permanent, Contractor, Part-Time, etc. (affects leave entitlements)

**STRONGLY RECOMMENDED fields (leave blank only if unknown):**
- **Start Date** — **Critical.** This is when the system starts accruing leave for them. If you leave it blank, no leave will accrue. If you back-date it, the system will accrue retroactively.
- **Work Days per Week** — How many days they work per week (usually 5). This affects sick leave entitlements and FRL eligibility.
- **Manager ID** — Who their direct manager is. Needed for leave approvals.
- **National ID** — For compliance and tax purposes
- **Tax Number** — For payroll
- **Next of Kin** — For HR records
- **POPIA Waiver** — Mark if they've signed the privacy waiver

**OPTIONAL fields:**
- **Mobile, Home Address** — Contact details
- **Contract End Date** — If they're a fixed-term contractor
- **Org Position** — For org chart placement
- **Payroll Company** — If you have multiple payroll entities

3. Click **Save**
4. The system will:
   - Create the employee record
   - Auto-generate a temporary password (see 4.3)
   - Create three leave balances: Annual, Sick, Family Responsibility
   - Run accrual backfill if the start date is in the past
   - Send a welcome email to the employee

### 4.3 Getting and sharing a new employee's password

When you create an employee, the system auto-generates a password. Here's how to find and share it:

1. After saving, you'll see a blue banner at the top saying "Auto-generated password: `[password]`"
2. Copy this password
3. Send it to the employee securely (email is not ideal; use your password management system or print and hand over)
4. The employee logs in with their email and this password
5. They're prompted to change it on first login

> **Tip:** If the employee forgets their password later, click their name in Personnel, then click "Resend Credentials". A password reset email will be sent.

### 4.4 Editing an employee's record

1. Click the employee's name in the list
2. Click the **"Edit"** button
3. Update the fields you need to change
4. Click **Save**

**Important:** Some changes have downstream effects:

- **Changing start date** → Leave balance recalculation runs immediately
- **Changing work days per week** → Affects future FRL eligibility and sick leave accrual rates
- **Changing manager ID** → Future leave requests will go to the new manager
- **Changing employee type** → May affect which leave rules apply to them

If you make a significant change mid-employment, it's worth adding an audit note. Use **Leave Balances** (Section 5) to add a note explaining the change.

### 4.5 Setting an annual leave override

Some employees negotiate custom annual leave rates (e.g., a senior executive gets 25 days instead of the default 15–20).

1. Find the employee in Personnel
2. Click to edit their record
3. Look for the field **"Annual Leave Override Days"**
4. Enter the number (e.g., 25)
5. Save

This will:
- **Permanently** set their annual leave to that number per year
- **Bypass** the standard tiered system
- Be **audit-logged** so you can explain why

> **Warning:** Once set, the override stays until you clear it. Don't use this casually; only for intentional exceptions.

### 4.6 Terminating an employee

1. Find the employee in Personnel
2. Click to edit their record
3. Look for the field **"Termination Date"**
4. Enter the date (e.g., 2025-03-31)
5. Click **Save**
6. The system will:
   - Mark the employee as terminated
   - Run a final leave settlement (pro-rating for the partial month)
   - Send you an email with the final balance (use this for payroll)
   - Prevent the employee from clocking in/out or submitting new requests

> **Important:** You can only terminate an employee by setting a termination date. You can't delete them.

### 4.7 Reactivating a terminated employee

If an employee is rehired or their termination was a mistake:

1. Find the employee in Personnel
2. Click to edit
3. Clear the **"Termination Date"** field
4. Click **Save**
5. The system will mark them as active again

---

## Section 5: Leave Balances

### 5.1 How to read a leave balance

When you click on an employee in Personnel, you'll see their leave balances for each type. Here's what each number means:

| Number | Meaning |
|---|---|
| **Available** | How many days they can still take. Formula: (Total + Carry-over) − (Taken + Pending) |
| **Total Entitlement** | How many days they've earned for the current cycle. E.g., 15 days/year for annual leave. |
| **Carry-over** | Days they didn't use last cycle and carried forward. Shows an expiry date (usually 6 months into the new cycle). |
| **Taken** | Days they've already used (historic + settled approved requests). |
| **Pending** | Days from approved requests that haven't occurred yet. |

**Example:**
- Total: 15 days
- Carry-over: 5 days (expiry: 30 June 2025)
- Taken: 3 days
- Pending: 2 days
- **Available: 15 days = (15 + 5) − (3 + 2) = 15**

### 5.2 Making a manual adjustment

If a balance is wrong (e.g., an error, a dispute resolution, a special grant), you can adjust it manually.

1. Click the employee in Personnel
2. Find their leave balance in the **Leave Balances** section
3. Click **"Adjust"** next to the balance you want to change
4. Enter the adjustment:
   - Positive number → add days
   - Negative number → remove days
5. **In the "Reason" field, enter why you're making this adjustment** (mandatory and audit-logged)
6. Click **Save**

Examples of reasons:
- "Correction: system recorded 3 days as taken; should be 2 days. Adjustment reverses 1 day."
- "Special grant: employee negotiated additional 3 days as part of retention agreement."
- "BCEA recalculation: employee anniversary triggered update to 20-day tier."

> **Warning:** The reason is **permanently recorded** in the audit log. Be clear and document-able; you may need to defend this adjustment later.

### 5.3 Activating statutory leave types per employee

Some leave types (Maternity, Parental, Adoption, Commissioning) are off by default. You activate them per employee when needed.

1. Find the employee in Personnel
2. Scroll to **Leave Balances**
3. Look for a button labeled **"Activate New Leave Type"** or similar
4. A dropdown appears showing available types (Maternity, Parental, etc.)
5. Select the type
6. The system will create a balance with the statutory number of days
7. Click **Save**

The employee can now request that leave type.

### 5.4 Bulk CSV import of balances

If you need to import multiple balance corrections at once (e.g., go-live data migration, large batch correction):

1. Click **Leave Balances** in the nav
2. Look for a button **"Bulk Import"**
3. Prepare a CSV file with columns:
   - `employeeId` — the employee's ID
   - `leaveType` — e.g., "Annual Leave"
   - `total` — the number of days
   - `taken` — days already used
   - `pending` — days pending approval
4. Upload the file
5. The system will show a preview of changes
6. Click **Confirm**

If an employee already has a balance of that type, the system will update it. If not, it will create it.

### 5.5 Annual leave carry-over

At the end of each year (when the annual leave cycle resets), here's what happens:

1. **Days carried forward** — Any unused days roll into the new year
2. **Carry-over expiry** — Carried days expire 6 months into the new cycle (configurable in Settings, but usually 6 months)
3. **Forfeiture warnings** — You'll get emails 60 days and 30 days before expiry reminding you the employee has unspent balance
4. **Expiry flag** — When the expiry date passes, the system flags it for HR review
5. **Manual forfeiture** — You must manually remove the carry-over days from the balance (the system won't auto-forfeit)

**What you should do:**

- When you receive the 60-day warning, email the employee: "You have X carry-over days expiring on [date]. Please plan to use them or they will be forfeited."
- When you receive the 30-day warning, send an urgent reminder.
- When the expiry date passes, check the employee's balance. If they still have carry-over days, make a manual adjustment (Section 5.2) to remove them, with reason: "Carry-over forfeiture as of [expiry date]."

### 5.6 Sick leave: first 6 months vs full pool

Sick leave accrues differently depending on how long the employee has been with you:

**First 6 months (graduated accrual):**
- Sick leave accrues at **1 day per 26 days worked**
- Example: an employee works 130 days, they accrue 5 sick days
- You'll see a note in their balance showing they're in "Probation Period"

**After 6 months (full entitlement):**
- At the 6-month mark, the system grants the full entitlement: **30 days per 3-year cycle** (for a 5-day/week worker)
- For part-time workers, it's scaled: 30 × (work days per week ÷ 5)
- Any days they already accrued remain; the full pool is added on top

**3-year cycle reset:**
- Every 3 years, the sick leave pool resets to 30 days (or the scaled equivalent)
- The employee receives an email saying their sick leave has reset
- Any days they didn't use in the prior 3-year period are forfeited

> **Important:** Don't manually adjust sick leave during the first 6 months unless you're correcting an error. The system tracks days worked automatically.

### 5.7 FRL eligibility check

Family Responsibility Leave (3 days per year) has eligibility rules:

- **4+ months employment** — They must have worked for you for at least 4 months
- **4+ days per week** — They must work at least 4 days per week (part-timers may not qualify)

Both conditions must be met.

If an employee asks, "Why don't I have FRL?", check:

1. Their start date (has 4 months passed?)
2. Their work days per week (is it 4 or more?)

If one of these is missing, explain it to the employee and tell them when they'll become eligible. When they meet both conditions, the next monthly accrual cycle will grant them FRL.

---

## Section 6: Configuring Leave Rules

### 6.1 BCEA leave type defaults

South Africa's Basic Conditions of Employment Act (BCEA) defines three main leave types:

| Leave Type | Entitlement | How it accrues | Cycle |
|---|---|---|---|
| **Annual Leave** | 1.25 days/month (15 days/year) | Monthly, starting month 1 | 12 months (calendar year) |
| **Sick Leave** | 30 days | Graduated first 6 months (1 per 26 worked), then full pool | 36 months |
| **Family Responsibility Leave** | 3 days | Lump sum, granted once eligible | 12 months |

These are managed by the system's BCEA engine. You don't create them in the custom rules section; they're built-in.

### 6.2 Annual leave rate tiers

The system has a tiered annual leave system (configurable):

**Default tiers:**
- **Tier 1** — 0–23 months of employment → 15 days/year (1.25 days/month)
- **Tier 2** — 24+ months of employment → 20 days/year (1.67 days/month)

This means employees get a raise in their annual leave rate after 2 years.

**If you need to change the tiers:**

1. Click **Leave Rules** in the nav
2. Look for the section **"Accrual Rate Tiers"**
3. Edit the thresholds (e.g., change "24 months" to "36 months")
4. Click **Save**

The new rates apply to the next accrual run (monthly). Existing employees will not retroactively recalculate.

### 6.3 Creating a custom leave type

You can add custom leave types like "Study Leave", "Parental Leave Top-Up", etc.

1. Click **Leave Rules** in the nav
2. Click **"+ Create New Leave Rule"**
3. Fill in:

| Field | What to enter |
|---|---|
| **Leave Type Name** | E.g., "Study Leave" (must be unique) |
| **Description** | E.g., "Approved study for professional development" |
| **Accrual Type** | Choose one: |
| | **None** — Approval-only (you grant when needed, doesn't accrue) |
| | **Lump Sum** — Employees get a fixed number of days per cycle, e.g., "3 days per year" |
| | **Monthly** — Accrues monthly, e.g., "0.5 days per month" |
| **Days Earned** | For monthly: how many days per month (e.g., 0.5). For lump sum: how many per cycle. |
| **Cycle Length** | How long the cycle is in months. E.g., 12 = 1 year, 36 = 3 years. |
| **Cycle Anchor** | When the cycle starts: "Calendar Year" (all employees reset Jan 1) or "Employment Start Date" (each employee's cycle based on their start date) |
| **Carry-over Allowed** | Toggle: can unused days roll into the next cycle? |
| **Max Days per Cycle** | Optional cap, e.g., "Can't accrue more than 10 days per year" |
| **Pauses Annual Accrual** | Toggle: does time on this leave count as "inactive" for annual leave? (E.g., time on unpaid leave doesn't count toward annual accrual) |
| **Employee Type** | Which employee types get this (e.g., "Permanent Only") |

4. Click **Save**

The custom type is now available for HR to activate per employee (see Section 5.3).

### 6.4 Phased leave rules

If you want a leave type to have different accrual rates at different points in an employee's tenure:

1. Create a leave rule (as above)
2. After saving, click the rule again
3. Look for a section **"Phases"**
4. Click **"+ Add Phase"**
5. Fill in:
   - **Phase Name** — E.g., "Probation", "Post-Probation"
   - **Starts After** — E.g., "after 6 months" or "after 0 months" (for the first phase)
   - **Accrual in This Phase** — Different rate from the main rule
6. Click **Save**

Example use case: Probation period (first 6 months) accrues at 0.5 days/month; post-probation accrues at 1 day/month.

### 6.5 Public holidays

You manage the public holiday calendar here. Public holidays don't count as leave days (e.g., if an employee is on leave on a public holiday, that day doesn't deduct from their balance).

1. Click **Leave Rules** → **Public Holidays** (or a similar nav item)
2. Click **"+ Add Holiday"**
3. Fill in:
   - **Holiday Name** — E.g., "Christmas Day"
   - **Date** — E.g., "2025-12-25"
   - **Recurring** — Toggle: is this an annual holiday (same date every year) or one-off?
   - **Religion** — Leave blank for all employees, or select "Muslim", "Jewish", "Christian", "Hindu" for religion-specific holidays
4. Click **Save**

> **Tip:** Religion-specific holidays (e.g., Eid, Diwali) are only excluded from leave day counts for employees whose religion field matches. A Christian employee on Eid is still on leave, just working if not approved.

### 6.6 Unpaid leave notice period

Unpaid leave requires 7 days' advance notice by default. If an employee requests unpaid leave with less than 7 days' notice, the system flags it for your discretion.

When you see a request like this:

1. You'll see a **"[Unpaid leave notice period waived]"** note in the admin notes
2. The manager will have added reasoning
3. You can approve it anyway (your discretion) or reject it
4. If you approve, add a comment like: "Discretion exercised; employee circumstances warrant exception"

This is recorded in the audit log, so you're covered if anyone questions it later.

---

## Section 7: Attendance Management

### 7.1 What attendance records show

An attendance record is a single clock-in or clock-out event. Here's what you see:

| Field | Meaning |
|---|---|
| **Date** | The day of the clock event |
| **Employee** | Who clocked in/out |
| **Clock-In Time** | When they arrived, e.g., 08:15 |
| **Clock-Out Time** | When they left, e.g., 17:30 |
| **Method** | How they clocked in: Face, ID, Manual, or Kiosk |
| **Infringement Flag** | Red badge if: clocked in after cutoff (Late), clocked out before cutoff (Early), or still clocked in at end of day (Missed Clock-Out) |

### 7.2 Filtering and searching

1. Click **Attendance** in the nav
2. Use the date range picker to zoom in on a specific period
3. Use the search box to find by employee name or ID
4. Click the "Infringement" filter to see only flagged records
5. Sorting: Click a column header to sort ascending/descending

### 7.3 Editing an attendance record

If a record is wrong (e.g., clock time off by 5 minutes, wrong employee):

1. Find the record
2. Click **"Edit"**
3. Update:
   - **Clock-in time** — e.g., change 08:20 to 08:15
   - **Clock-out time** — e.g., change 17:25 to 17:30
   - **Date** — if the record is on the wrong day
4. Optionally update the infringement flag and reason
5. Click **Save**

The record is audit-logged, so you can see who made the change and when.

### 7.4 Adding manual attendance entries

For employees who don't clock in electronically (e.g., remote workers):

1. Click **Attendance** → **Manual Entry** tab
2. Select the **employee**
3. Select the **date**
4. Enter **clock-in time** and **clock-out time**
5. Click **Save**

**For bulk entry** (e.g., multiple employees on the same date):

1. Click **Attendance** → **Bulk Entry** tab
2. Upload a CSV with columns: `employeeId`, `clockInTime`, `clockOutTime`, `date`
3. Review the preview
4. Click **Import**

### 7.5 Infringement types

Three types of infringements are automatically flagged:

| Infringement | What triggers it | What to do |
|---|---|---|
| **Late Arrival** | Clock-in after your clock-in cutoff time (e.g., after 08:30) | Informational; follow up if it's a pattern. May indicate disciplinary issue. |
| **Early Departure** | Clock-out before your clock-out cutoff time (e.g., before 17:00) | Informational; might be legitimate (appointment, half-day). Follow up if pattern. |
| **Missed Clock-Out** | Still clocked in at end of day (auto-reset runs at 23:59) | Informational; system auto-clocked them out. Only action if repeated. |

If you spot an infringement that's a mistake (e.g., kiosk was offline that day), you can click **Edit**, toggle the infringement flag, and add a reason like "Kiosk offline; rectified manually on [date]."

### 7.6 AWOL detection

AWOL = "Absent Without Leave." The system detects when an employee:
- Had **no clock-in record** AND
- Had **no approved leave** for that day

1. Click **Attendance** → **AWOL** tab
2. Set a date range
3. The report shows all AWOL employees
4. Click an employee to see their record
5. Follow up: confirm they were actually absent; update approvals if leave was forgotten; issue discipline if unexcused

### 7.7 Attendance trends

The **Trends** tab shows patterns over time:

- **Clock-in consistency** — Is the employee consistently late? On time?
- **Infringement frequency** — How many late arrivals in the past month?
- **AWOL patterns** — Any specific days they tend to miss?

Use this to identify problems (e.g., "This employee is late every Monday").

### 7.8 Exporting attendance reports

To export a printable report:

1. Click **Attendance** → **Reports** tab
2. Set your filters (date range, employee, department, infringement type)
3. Click **Export to PDF**
4. A PDF downloads with all the matching records

Use this for audits, employee reviews, or disciplinary files.

---

## Section 8: Grievance Management

### 8.1 What gets submitted through grievances

Employees can submit grievances about:

- **Harassment** — Bullying, intimidation
- **Discrimination** — Based on gender, race, religion, disability
- **Safety** — Workplace hazards, unsafe conditions
- **Policy** — Disagreement with how a policy was applied
- **Other** — Anything else employment-related

Grievances can target:
- **The company** — A general workplace issue
- **A specific employee** — An allegation against a manager or coworker

### 8.2 Reviewing new grievances

1. Click **Grievances** in the nav
2. Look for grievances with status **"Submitted"**
3. Click one to open it
4. Read:
   - Employee name and date submitted
   - Category (Harassment, Safety, etc.)
   - Full description
   - Target (Company or specific employee)
   - Any attachments

### 8.3 Updating grievance status

1. Open the grievance
2. Click the status dropdown
3. Choose:
   - **Submitted** — Initial state (no action yet)
   - **In Review** — You're investigating
   - **Resolved** — You've taken action (disciplinary, policy change, etc.)
   - **Rejected** — The allegation was unfounded
   - **Closed** — You've documented the outcome and closed the file

> **Note:** "Resolved" = you took action; "Rejected" = the allegation wasn't substantiated. Only use "Closed" when you've fully documented the case.

### 8.4 Resolving a grievance

1. Open the grievance
2. In the **"Admin Notes"** field, document:
   - What you investigated
   - Who you interviewed
   - What actions you took (discipline, mediation, etc.)
   - Outcome
3. In the **"Resolution"** field, write a brief summary for the employee (what you found and what will happen next)
4. Click **"Update Status"** → select **"Resolved"** or **"Rejected"**
5. Click **Save**
6. The employee may be sent a notification (depending on settings)

### 8.5 Confidentiality reminders

Grievance details are visible to all HR and Admin users. **Best practice:**

- **Don't discuss cases informally** — Keep notes professional and factual
- **Document thoroughly** — You may need to defend your handling of the case later
- **Be impartial** — Especially if the grievance targets another manager or employee
- **Keep timelines** — Note when you received the complaint, when you investigated, when you communicated outcome

---

## Section 9: Reporting & Audit

### 9.1 HR leave reports

Reports are available under **Reports** or in a **Reporting** section:

| Report Type | What it shows |
|---|---|
| **By Leave Type** | How many days of each type (Annual, Sick, etc.) were taken. Sorted by usage. |
| **By Department** | Which departments used the most leave. Useful for understanding team patterns. |
| **Sick Leave Flags** | Requests that had medical certificate flags (>2 days, Friday-Monday, etc.). |
| **Excessive Sick Leave** | Employees with 3+ sick leave requests in the period. Flags potential abuse patterns. |

### 9.2 Running a report

1. Click **Reports**
2. Select the report type
3. Set filters:
   - **From/To dates** — The reporting period
   - **Department** — Optional; leave blank for all departments
   - **Employee Type** — Optional; e.g., "Permanent Only"
4. Click **Generate**
5. The report displays as a table
6. Click **Export to PDF** if you want to save it

### 9.3 BCEA SA preview

This shows you what an employee's statutory entitlements *should* be, useful for audits:

1. Go to **Reports** → **BCEA SA Preview** (or find it in **Leave Balances**)
2. Select an **employee**
3. The system shows:
   - **Monthly accrual rate** for annual leave based on their tenure
   - **Sick leave entitlement** (graduated if <6 months, full if 6+ months)
   - **FRL eligibility** (yes/no with reason)
   - Notes explaining the basis for each figure

Use this when:
- An employee disputes their balance ("Should be X days")
- You're auditing for BCEA compliance
- You need to explain statutory entitlements to an employee

### 9.4 Audit logs

Every significant action is logged: who did it, when, and what changed.

1. Click **Reports** → **Audit Logs** (or **Admin Insights** → **Audit Logs**)
2. Filter by:
   - **Action type** — e.g., "manual_adjustment", "leave_approved", "user_terminated"
   - **Date range**
   - **User** — Who made the action
3. Read the **"Changes"** column to see before/after values

Common audit log entries you'll check:
- Manual balance adjustments (to verify the reason was documented)
- User role changes (who was made HR? When?)
- Leave approval decisions (did you approve/reject?)
- Settings changes (who changed the clock-in cutoff time?)

---

## Section 10: Face Registration

### 10.1 Why it matters

The kiosk has two modes:

- **Face recognition** (fast) — Employee stands in front of the camera, it recognizes them automatically
- **ID entry** (slower) — Employee enters their ID number

Employees without registered faces must use ID entry. Registering faces speeds up the kiosk and is preferred.

### 10.2 Registering a face

1. Find the employee in **Personnel**
2. Click to edit their profile
3. Look for a section **"Face Registration"** or **"Register Face"**
4. Click **"Capture Face"**
5. A webcam prompt appears on your screen
6. Have the employee face the camera
7. Click **"Capture Photo"**
8. The system extracts face features and stores them
9. Click **Save**

The employee can now use face recognition at the kiosk.

### 10.3 Tips for a good capture

- **Lighting** — Good, even lighting. Avoid harsh shadows on the face.
- **Alignment** — Employee should face the camera straight-on, eyes level
- **Distance** — Face should fill 1/3 to 1/2 of the frame
- **No glasses** — If possible, remove glasses or sunglasses (they can reduce recognition accuracy)
- **Environment** — Capture in an environment similar to the kiosk (same lighting, if possible)

### 10.4 Re-registering

If face recognition starts failing (employee has grown a beard, changed hairstyle, gotten glasses), re-register:

1. Find the employee in Personnel
2. Click **"Re-register Face"** (or click Edit, then capture again)
3. Follow steps 5–9 above
4. The old face photo is replaced

---

## Section 11: Common Scenarios & Edge Cases

### 11.1 Employee submits leave but has no manager

If an employee has no manager assigned:

1. Their leave request automatically goes to status **`pending_hr`** (not `pending_manager`)
2. You'll see it in your queue directly (the manager stage is skipped)
3. You review and decide as normal

**What to do:** Assign a manager to the employee ASAP if they should have one (see Section 4.4).

### 11.2 Employee disputes their leave balance

If an employee says their balance is wrong:

1. Check the **BCEA SA Preview** (Section 9.3) to see what their entitlement *should* be
2. Check **Leave Balances** to see their current balance
3. Check the **audit logs** to see if any manual adjustments were made (and why)
4. If the balance is genuinely wrong (e.g., system error), make a manual adjustment (Section 5.2) with a clear reason
5. If the employee misunderstands the policy, explain it to them

Example explanation: "Your leave rate changes from 15 days/year to 20 days/year after 24 months of employment. You've been with us 26 months, so you're on the 20-day tier. In the current year, you've earned 16.7 days (20 ÷ 12 × 10 months), taken 3 days, so available is 13.7 days."

### 11.3 Employee added months after their actual start date

If an employee's start date is set to today but they actually started 3 months ago:

1. Update the **start date** to the correct date (edit their record in Personnel)
2. The system will **automatically run a backfill accrual** in the background
3. Within a few minutes, their leave balance will jump (3 months of accrual added)
4. Verify the balance looks correct (e.g., 3 months × 1.25 days/month = 3.75 days for annual leave)

> **Tip:** This happens often during go-live. Don't worry; the accrual backfill is automatic.

### 11.4 Employee changes from part-time to full-time

If an employee's work days per week changes (e.g., from 3 days/week to 5 days/week):

1. Edit their record in Personnel
2. Update the **"Work Days per Week"** field
3. Save

This affects:
- **Future sick leave accrual** — Recalculated based on the new work days per week
- **FRL eligibility** — Rechecked (they now need only ≥4 days/week, so if they were below that, they may now be eligible)

For current balances, the change applies going forward; historic balances don't recalculate.

### 11.5 Carry-over approaching expiry

When carry-over is about to expire:

1. **60 days before expiry** — You'll get an email. Forward it to the employee: "You have X days of carry-over expiring on [date]. Please use them."
2. **30 days before expiry** — You'll get an urgent email. Send an urgent reminder to the employee.
3. **On expiry date** — The balance will be flagged in the system. **You must manually remove the carry-over days** (see Section 5.2, "Making a manual adjustment") with reason: "Carry-over forfeited as of [date]."

The system doesn't auto-forfeit; you have to do it manually so it's audit-logged.

### 11.6 Manager is on leave

If an employee's manager is away and a leave request lands in the manager's queue:

**Option 1 — Escalate to HR:**
- Tell the employee, "Your manager is on leave. I'll review your request myself" (skip the manager stage, approve/reject directly).

**Option 2 — Reassign manager:**
- Temporarily assign the employee to another manager (e.g., acting manager) in Personnel (see Section 4.4).
- The next request will go to the new manager.

**Option 3 — Wait:**
- If the request is not urgent, wait for the manager to return (they'll see the request when they get back).

### 11.7 Balance projection note

If a request has a **"[Balance note]"** in the admin notes (Section 3.9):

- The employee **currently** doesn't have enough balance
- But **by the time they take the leave**, our projection shows they will have accrued enough
- Approving is safe; they won't be short

This is common for annual leave near the start of the year (Jan/Feb) when the balance is still building.

---

## Section 12: Quick Help Reference

### 12.1 Key terminology glossary

| Term | Meaning |
|---|---|
| **BCEA** | Basic Conditions of Employment Act (South African labour law) |
| **Pending Manager** | Leave request is waiting for the manager's recommendation |
| **Pending HR** | Leave request is waiting for your (HR's) approval/rejection decision |
| **Approved** | You've approved the request; employee can now take the leave |
| **Rejected** | You've rejected the request; days are refunded to the employee |
| **Cancelled** | Employee withdrew their request |
| **Settled** | An approved request's dates have passed; the days have moved from "pending" to "taken" |
| **Carry-over** | Days not used at the end of a cycle that carry forward to the next cycle |
| **Forfeiture** | Days that expire at the end of the grace period and are removed from the balance |
| **Graduated accrual** | Accrual rate is lower during a probationary period (e.g., first 6 months) |
| **Pausing leave type** | A leave type that pauses other accrual (e.g., unpaid leave pauses annual leave accrual) |
| **Infringement** | A clock-in/out that violates your attendance policy (late, early, missed) |
| **AWOL** | Absent Without Leave — an employee who didn't clock in and has no approved leave |

### 12.2 Date format reminder

Throughout the system, dates are entered in **DD/MM/YYYY** format.

Example:
- 25/03/2025 = 25 March 2025
- 01/12/2025 = 1 December 2025

### 12.3 Who to contact for what

| Issue | Who to contact |
|---|---|
| Leave request decision | (You; you're HR) |
| Employee created but no password | Resend via Personnel panel; or contact Admin |
| Attendance kiosk offline | Contact your IT/Admin team |
| System is slow or buggy | Contact Admin |
| Can't find a setting | Check Section 6 or contact Admin |
| Legal question about BCEA | Consult your company's labour lawyer or ask Admin (they may have legal advice resources) |
| Technical issue with the system | Contact Admin with a description and the date/time of the issue |

---

## Closing

You've now read through every routine HR task in AECE Checkpoint. The system is designed to be intuitive, but don't hesitate to refer back to this guide or ask your admin for clarification. You've got this! 🎉

For a quick reminder of common tasks, print out the **HR Quick Reference Card** (in the docs folder) and keep it on your desk.

Good luck!
