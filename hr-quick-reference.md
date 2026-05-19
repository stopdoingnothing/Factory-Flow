# AECE Checkpoint HR Quick Reference

Fast lookup guide for daily HR tasks in leave management, attendance, and employee administration.

---

## Morning Checklist

1. **Leave Requests** — Filter `pending_hr` in Dashboard. Review and decide (approve/reject). Older requests first.
2. **Escalation Reminders** — Check for requests pending >3 days at manager or HR stage. Follow up if needed.
3. **AWOL Alerts** — Scan email for absent employees. Check attendance records. Escalate confirmed absences.
4. **Carry-Over Forfeiture Warnings** — Flag any 60-day or 30-day warnings. Review audit trail before action.
5. **Attendance Infringements** — Review late arrivals, early departures, missed clock-outs. Investigate patterns.

---

## Common Tasks

| Task | Steps |
|------|-------|
| **Approve a Leave Request** | 1. Open request (filter `pending_hr`) 2. Review manager recommendation 3. Check employee balance 4. Click Approve 5. Leave auto-deducted |
| **Reject a Leave Request** | 1. Open request 2. Enter rejection reason (mandatory) 3. Click Reject 4. Reason auto-sent to employee & manager |
| **Add a New Employee** | 1. Go to Employee Directory 2. Click Add Employee 3. Enter name, ID, department, role 4. Set leave year start date 5. Assign annual leave balance (1.25/mo) 6. Save |
| **Adjust Leave Balance Manually** | 1. Open employee record 2. Go to Leave Balances 3. Click Adjust 4. Select leave type 5. Enter new balance 6. **Enter reason** (mandatory, audited) 7. Save |
| **Activate Statutory Leave (Maternity/Parental/Adoption/Commissioning)** | 1. Open employee record 2. Go to Leave Setup 3. Enable leave type 4. Enter effective date 5. System auto-allocates statutory entitlement 6. Save |
| **Terminate an Employee** | 1. Open employee record 2. Go to Employment Status 3. Click Terminate 4. Enter last day 5. Calculate final carry-over/forfeiture 6. Confirm termination 7. Access revoked |
| **Register Employee Face (Biometric)** | 1. In Attendance, click Register Face 2. Position face in frame 3. Capture (system stores biometric) 4. Test scan 5. Confirm registration |
| **Add Manual Attendance Entry** | 1. Go to Attendance 2. Click Add Manual Entry 3. Select employee & date 4. Enter clock-in/out times 5. Enter reason (optional) 6. Submit |
| **Mark Attendance Infringement** | 1. Go to Attendance 2. Find infringement flagged entry 3. Click Mark Infringement 4. Select type (late/early/absent) 5. Auto-notified to employee & manager 6. Save |
| **Update Grievance Status** | 1. Go to Grievances 2. Open case 3. Update Status dropdown (open/under review/resolved/closed) 4. Add notes if needed 5. Save |
| **Add Public Holiday** | 1. Go to Calendar/Holidays 2. Click Add Holiday 3. Enter date, name, region (if regional) 4. Save 5. System auto-exempts from absence flagging |
| **Run Auto Clock-Out Reset** | 1. Go to Maintenance > Batch Jobs 2. Select "Reset Missed Clock-Outs" 3. Choose date range 4. Preview affected records 5. Run (auto-marked as administrative entry) |

---

## Leave Status Guide

| Status | Location | Next Actor | Notes |
|--------|----------|-----------|-------|
| **pending_manager** | Awaiting Manager | Manager (recommends only) | Employee waiting; not yet at HR desk |
| **pending_hr** | Awaiting HR | HR (approves/rejects) | Manager already decided; HR makes final call |
| **approved** | Closed | — | Leave deducted; employee notified |
| **rejected** | Closed | — | Reason sent to employee; no balance change |
| **cancelled** | Closed | — | Employee or HR cancelled; no auto-reversal |

---

## Leave Types at a Glance

| Type | Accrual | Rules | Who Approves |
|------|---------|-------|--------------|
| **Annual** | 1.25 days/month | Carry-over capped per policy; doesn't auto-forfeit | HR |
| **Sick** | 30 days / 36-month cycle | First 6 months: 1 per 26 worked. Medical cert required if >2 consecutive days | HR |
| **Family Responsibility (FRL)** | 3 days/year | Requires 4+ months employed AND 4+ days/week | HR |
| **Maternity** | Statutory (varies by jurisdiction) | Activated per employee lifecycle | HR |
| **Parental** | Statutory (varies by jurisdiction) | Activated per employee lifecycle | HR |
| **Adoption** | Statutory (varies by jurisdiction) | Activated per employee lifecycle | HR |
| **Commissioning** | Statutory (varies by jurisdiction) | Activated per employee lifecycle | HR |
| **Unpaid** | N/A (discretionary) | 7-day notice required | HR |

---

## Key Rules to Remember

- **Manager can only recommend** — HR makes the final approve/reject decision. Manager input is advisory.
- **Rejection reason is mandatory** — Form won't submit without text. Keep it concise and professional.
- **Manual balance adjustments are audited** — Reason field is required and permanently logged. Every change is traceable.
- **Sick leave first 6 months** — Employees accrue 1 day per 26 worked. Don't adjust without checking audit trail for fraud risk.
- **FRL has two gates** — Must have 4+ months employed AND work 4+ days/week. Both must be true.
- **Carry-over doesn't auto-forfeit** — You must manually action the expiry flag. System warns at 60d and 30d before forfeiture date.
- **Medical certificates** — Required if employee uses >2 consecutive sick days in one episode. Don't approve without cert if triggered.
- **Escalation reminder threshold is >3 days** — System alerts if request stuck at any stage past this point. Action it.
- **AWOL is confirmed by attendance** — If no clock-in, no clock-out, AND no approved leave, mark as infringement.
- **Face registration is per-device** — Employee may need re-registration if biometric scanner replaced or recalibrated.
- **Termination finalizes leave** — Remaining carry-over either paid out or forfeited per policy. Can't be undone.
- **Public holiday exempts from absence** — If employee absent on public holiday, they're not flagged. Manual entries still recorded.

---

## Email Notifications You'll Receive

| Email Trigger | Required Action |
|---------------|-----------------|
| **New leave request submitted** | Check if it went to manager or directly to HR. If manager: wait for recommendation. If HR: action within 2 days. |
| **Manager forwards [RECOMMENDED]** | Review manager's rationale. Check balance. Approve if compliant. |
| **Manager forwards [NOT RECOMMENDED]** | Read rejection reason. Decide if you agree or override. Notify both parties. |
| **AWOL alert** | Check employee attendance records. If confirmed (no clock-in, no leave), escalate to manager. |
| **Late arrival flagged** | Informational. Act only if pattern (>2 in week). Mark infringement if deliberate. |
| **Early departure flagged** | Informational. Act only if pattern. Document if recurring issue. |
| **Missed clock-out** | Informational. Employee or manager can add manual entry. HR can run batch reset. |
| **Escalation reminder** | Request pending >3 days. Prioritize review. Contact manager if stuck at their stage. |
| **Carry-over forfeiture warning (60d)** | First warning. Review if employee aware of upcoming deadline. |
| **Carry-over forfeiture warning (30d)** | Final warning. Verify with employee before expiry. Last chance to take leave. |
| **Cycle reset notification** | Informational. New annual/sick/FRL cycle started. Balances updated automatically. |
| **Termination confirmation** | Verify leave payout/forfeiture. Update access controls. File final records. |

---

## Quick Filters & Reports

**In Dashboard:**
- `pending_hr` → Requests waiting for your decision
- `pending_manager` → Requests waiting for manager recommendation
- `approved_last_7d` → Recently approved (audit trail)
- `rejected_last_7d` → Recently rejected (audit trail)
- `attendance_infringements` → Flagged absences/tardiness

**Common Reports:**
- **Leave Audit Trail** — Search by employee or date range. Shows all balance changes.
- **Attendance Summary** — Days present, absent, infringed. Exportable to Excel.
- **Carry-Over Report** — Upcoming forfeiture dates. Reminder to action.
- **Statutory Leave Register** — Maternity/Parental/Adoption/Commissioning status and dates.

---

## Troubleshooting Quick Hits

| Issue | Fix |
|-------|-----|
| **Employee says balance is wrong** | Check audit trail (Adjust Balance history). Verify accrual rules applied. Recalculate if needed. |
| **Manager says request stuck** | Check if `pending_hr`. If yes, prioritize. If `pending_manager`, remind manager to decide. |
| **Face registration fails** | Check device/scanner calibration. Retry in good light. If persistent, use manual attendance entry instead. |
| **Missed clock-out piles up** | Run batch reset job (Maintenance > Batch Jobs). Review for fraud pattern before auto-marking. |
| **Employee contests infringement** | Check timestamp against their manual entry request. If reasonable, remove mark. Document decision. |
| **Carry-over forfeiture date passed** | If not yet actioned, escalate to manager. After forfeiture, balance can't be recovered (audit only). |

---

## Hotkeys & Shortcuts

- **Dashboard:** Press `/` to search employee by name/ID
- **Leave Request:** Press `R` to reject (opens reason field)
- **Leave Request:** Press `A` to approve (confirms if balance sufficient)
- **Employee Record:** Press `B` to jump to balances
- **Attendance:** Press `I` to mark infringement on selected entry
- **Any Table:** Press `Ctrl+E` to export to CSV

---

**Last Updated:** April 2026 | **Version:** 1.0
