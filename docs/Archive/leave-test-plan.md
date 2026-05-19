# Leave Application & Approval — Test Plan & Sign-Off

**Project:** Factory Flow
**Feature:** Leave Application & Approval Workflow
**Date:** 2026-04-03
**Branch:** SDN
**Prepared by:** _______________

---

## 1. Scope

This test plan covers the end-to-end leave workflow including:

- Employee leave submission and validation
- Multi-stage approval (Manager → HR → MD)
- Leave balance tracking
- Email notifications
- Employee cancellation and admin cancel
- Escalation reminders
- Historic leave entry management

---

## 2. Test Environment

| Item | Value |
|------|-------|
| Frontend | `http://localhost:5173` |
| API | `http://localhost:3000` |
| Database | Local dev (PostgreSQL) |
| Email | Verified via server logs / test inbox |

**Preconditions:**

- At least one employee account with a configured manager
- An employee account with no manager (to test HR-direct path)
- HR admin and MD admin accounts
- Leave balances seeded for test employees
- Public holidays seeded in DB

---

## 3. Test Cases

### Module A — Leave Submission (Employee)

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| A-01 | Submit valid Annual Leave | Log in as employee → Apply for 3 days Annual Leave, future dates, with reason | Request created with `pending_manager` status; pending balance incremented by 3 | ☐ | |
| A-02 | Submit leave with no manager | Use employee with no `reportsToPositionId` / `managerId` | Status starts as `pending_hr`; notification sent to admin email | ☐ | |
| A-03 | End date before start date | Set endDate < startDate | Error: "End date must be on or after start date" | ☐ | |
| A-04 | Start date before employment start | Set startDate < user.startDate | Error: "Leave cannot start before your employment start date" | ☐ | |
| A-05 | Overlapping leave dates | Submit leave where dates overlap an existing pending/approved request | Error: "These dates overlap with an existing leave request" | ☐ | |
| A-06 | Overlap with rejected/cancelled leave | Submit dates that overlap a `rejected` or `cancelled` request | Request accepted (no false overlap) | ☐ | |
| A-07 | Insufficient balance | Request more days than available balance | Error: "Insufficient {type} balance. Available: X day(s), requested: Y day(s)" | ☐ | |
| A-08 | Unpaid leave — no notice check | Submit Unpaid Leave starting in < 7 days, no bypass | Error: "Unpaid leave requires 7 days' notice. This request starts in N day(s)" | ☐ | |
| A-09 | Unpaid leave — manager bypass | Submit same as A-08 but with `bypassNoticeCheck=true` and `bypassReason` | Request created; audit log entry written; admin notes contain bypass reason | ☐ | |
| A-10 | Sick Leave > 2 days — med cert flag | Submit 3+ day Sick Leave | `requiresMedCert=true`; flags include `exceeds_2_days` | ☐ | |
| A-11 | Sick Leave on Monday — med cert flag | Submit Sick Leave starting on a Monday | `requiresMedCert=true`; flag includes `mon_start_or_post_holiday` | ☐ | |
| A-12 | Sick Leave ending on Friday — med cert flag | Submit Sick Leave ending on a Friday | `requiresMedCert=true`; flag includes `fri_end_or_pre_holiday` | ☐ | |
| A-13 | Unpaid Leave — balance check skipped | Submit Unpaid Leave with zero balance | Request accepted (no balance check for Unpaid) | ☐ | |
| A-14 | Leave spanning a public holiday | Apply for Annual Leave that includes a public holiday | Working days exclude the public holiday (e.g. 5 calendar days = 4 working days) | ☐ | |
| A-15 | Weekend exclusion in day count | Submit leave Mon–Fri over a week with a weekend | Days counted = 5, not 7 | ☐ | |
| A-16 | Religion-specific holiday exclusion | Employee with matching religion applies over their religious holiday | Holiday excluded from day count | ☐ | |
| A-17 | File attachment upload | Submit leave with a PDF/image document attached | Document stored; visible in admin review | ☐ | |
| A-18 | Submit leave — notification to manager | Submit valid request | Email received by manager + admin_email recipients | ☐ | |

---

### Module B — Manager Stage

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| B-01 | Manager recommends | HR stage enabled → Manager clicks "Recommend" | Status → `pending_hr`; HR receives notification email | ☐ | |
| B-02 | Manager not recommended | Manager clicks "Not Recommended" | Status → `pending_hr`; HR notified with "NOT RECOMMENDED" flag | ☐ | |
| B-03 | HR stage disabled — recommended → MD | HR stage setting = `false` → Manager recommends | Status → `pending_md`; MD receives notification | ☐ | |
| B-04 | Manager cannot reject | Manager review dialog | No "Reject" option available; can only recommend/not recommend | ☐ | |
| B-05 | Manager notes persisted | Manager adds notes | Notes stored in `managerNotes`; visible to HR/MD in review dialog | ☐ | |

---

### Module C — HR Stage

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| C-01 | HR approves request | HR clicks "Approve" | Status → `pending_md`; MD receives notification | ☐ | |
| C-02 | HR rejects request | HR clicks "Reject" with notes | Status → `rejected`; pending balance decremented; employee notified | ☐ | |
| C-03 | HR blocked — sick leave, no med cert | Sick leave with `requiresMedCert=true` and no documents | Cannot approve; error shown | ☐ | |
| C-04 | HR approves sick leave with document | Upload med cert doc → HR clicks Approve | Approval proceeds normally | ☐ | |
| C-05 | HR notes persisted | HR adds notes | Notes stored in `hrNotes`; visible to MD | ☐ | |

---

### Module D — MD Stage (Final Approval)

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| D-01 | MD approves request | MD clicks "Approve" on `pending_md` request | Status → `approved`; `finalizedById` set; employee notified with approval email | ☐ | |
| D-02 | MD rejects request | MD clicks "Reject" | Status → `rejected`; pending balance decremented; employee notified | ☐ | |
| D-03 | MD bypasses HR | Request at `pending_hr` → MD approves directly | Status → `approved`; `hrDecision = 'skipped'`; employee notified | ☐ | |
| D-04 | MD reject from pending_hr | Request at `pending_hr` → MD rejects | Status → `rejected`; pending balance decremented; employee notified | ☐ | |
| D-05 | MD notes persisted | MD adds notes on approval/rejection | Notes stored in `mdNotes` | ☐ | |

---

### Module E — Employee Cancellation

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| E-01 | Cancel pending_manager request | Employee cancels while at manager stage | Status → `cancelled`; pending balance decremented | ☐ | |
| E-02 | Cancel pending_hr request | Employee cancels while at HR stage | Status → `cancelled`; pending balance decremented | ☐ | |
| E-03 | Cancel pending_md request | Employee cancels while at MD stage | Status → `cancelled`; pending balance decremented | ☐ | |
| E-04 | Cannot cancel approved request | Employee attempts to cancel an `approved` leave via employee UI | Action blocked / endpoint returns error | ☐ | |

---

### Module F — Admin Cancel

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| F-01 | Admin cancels approved leave | Admin cancels a non-historic approved request | Status → `cancelled`; pending balance decremented; audit log created | ☐ | |
| F-02 | Admin cancels historic leave | Admin cancels a historic entry | Status → `cancelled`; `taken` field decremented (not pending) | ☐ | |
| F-03 | Audit log on admin cancel | Admin cancels any leave | Audit log entry with `action='admin_cancel_leave'` | ☐ | |

---

### Module G — Leave Balance

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| G-01 | Pending balance increments on submit | Submit leave request | `pending` field increases by requested working days | ☐ | |
| G-02 | Pending balance decrements on rejection | Request rejected by HR or MD | `pending` field decreases by requested days | ☐ | |
| G-03 | Pending balance decrements on cancel | Employee or admin cancels | `pending` field decreases | ☐ | |
| G-04 | Carry-over days included in available | Employee has carry-over days | Available = total + carryOverDays - (taken + consumed) | ☐ | |
| G-05 | Carry-over expiry respected | CarryOverExpiry date has passed | Carry-over days = 0 in available calculation | ☐ | |
| G-06 | No balance configured | Apply for leave type with no balance record | Error: "No {leaveType} balance configured" | ☐ | |

---

### Module H — Escalation Reminders

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| H-01 | No reminder under 3 days | Leave pending for 2 days | No escalation email sent | ☐ | |
| H-02 | Reminder at 3+ days — manager stage | Leave at `pending_manager` for 3+ days → trigger endpoint | Reminder email sent to manager | ☐ | |
| H-03 | Reminder at 3+ days — HR stage | Leave at `pending_hr` for 3+ days | Reminder email sent to admin_email HR recipients | ☐ | |
| H-04 | Reminder at 3+ days — MD stage | Leave at `pending_md` for 3+ days | Reminder email sent to admin_email MD recipients | ☐ | |
| H-05 | Manual escalation trigger | POST `/api/leave-requests/send-escalation-reminders` | Returns count of emails sent | ☐ | |

---

### Module I — Historic Leave Entry (Admin)

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| I-01 | Create historic entry | Admin submits historic leave form | Leave created with `isHistoric=true` and `status=approved`; `taken` balance incremented | ☐ | |
| I-02 | Edit historic entry | Admin edits dates on historic entry | Entry updated; balance adjusted if days changed | ☐ | |
| I-03 | Delete historic entry | Admin permanently deletes historic entry | Entry removed; no orphan balance | ☐ | |

---

### Module J — Leave Calendar

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| J-01 | Approved leave appears on calendar | After MD approval | Leave visible on both employee and admin calendar views | ☐ | |
| J-02 | Pending leave does not appear | Request still pending | Not shown on calendar | ☐ | |
| J-03 | Department filter | Filter by department | Only that department's approved leave shown | ☐ | |
| J-04 | Month navigation | Click forward/back month | Calendar updates; leaves shown for correct month | ☐ | |

---

### Module K — Email Notifications (End-to-End)

| ID | Test | Steps | Expected Result | Pass | Notes |
|----|------|-------|----------------|------|-------|
| K-01 | New request email to manager | Submit leave | Manager receives email with employee name, leave type, dates, balance | ☐ | |
| K-02 | New request email to admin_email | Submit leave | All `admin_email` recipients receive notification | ☐ | |
| K-03 | Stage forwarded email | Manager recommends → HR notified | HR email contains employee details, leave info, action link | ☐ | |
| K-04 | Approval email to employee | MD approves | Employee receives "Leave Request Approved" email | ☐ | |
| K-05 | Rejection email to employee (HR) | HR rejects | Employee receives "Leave Request Rejected" email | ☐ | |
| K-06 | Rejection email to employee (MD) | MD rejects | Employee receives "Leave Request Rejected" email | ☐ | |

---

## 4. Out of Scope

- BCEA recalculation (`/api/leave-balances/recalculate-sa`) — covered under balance management
- Bulk balance CSV import — separate admin utility
- Leave rules configuration UI (`LeaveRulesSection.tsx`)

---

## 5. Defect Log

| ID | Test Case | Description | Severity | Status | Resolution |
|----|-----------|-------------|----------|--------|------------|
| | | | | | |

---

## 6. Sign-Off

| Role | Name | Signature | Date | Result |
|------|------|-----------|------|--------|
| Tester | | | | ☐ Pass / ☐ Fail |
| Developer | | | | ☐ Pass / ☐ Fail |
| Product Owner | | | | ☐ Pass / ☐ Fail |
| QA Lead | | | | ☐ Pass / ☐ Fail |

---

**Overall result:**

```
[ ] PASS — APPROVED FOR RELEASE
[ ] FAIL — BLOCKED
```

**Total test cases:** 62
**Passed:** _____ / 62
**Failed:** _____
**Blocked:** _____

**Defects raised:** _______________

**Notes / Conditions on approval:**

_______________________________________________________________________________

_______________________________________________________________________________
