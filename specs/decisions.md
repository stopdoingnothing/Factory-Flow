# Architecture & Implementation Decisions

---

## DEC-001 — Leave balance fields: `taken` vs `pending`

**Date:** 2026-04-01  
**Status:** Implemented

### Background

The `leave_balances` table has three fields used to track consumed leave:

| Field | Type | Intended meaning |
|---|---|---|
| `total` | `real` | Entitlement ceiling for the period (set by BCEA recalc on startup) |
| `taken` | `real` | Days fully consumed (historic backfill entries only) |
| `pending` | `real` | Days soft-reserved by any active request |

### Problem discovered

The main approval workflow (Manager → HR → MD) **never wrote to `taken` or `pending`**. Only two code paths updated these fields:

- **Historic entry creation** — directly increments `taken`
- **Admin-cancel of an approved request** — decremented `taken`

As a result `pending` was always 0 and `taken` only reflected historic backfill, causing the employee dashboard to overstate available balance.

### Definition agreed

`pending` and `taken` are deliberately kept separate because the word "pending" has two valid meanings:

1. **In-flight** — submitted but not yet approved or rejected
2. **Approved future** — approved, but the dates haven't passed yet

Both reduce what the employee actually has available to book. The distinction is visible through the request's `status` field — not through separate balance columns.

**Soft-reserve on submission (Option A)** was chosen:

- Submitting a request immediately reserves days in `pending`
- This prevents the same-user race condition where two non-overlapping requests each pass the balance check independently but together exceed the entitlement
- The "locked" period feels acceptable given the company's fast 3-stage approval chain (~20 people)

### Field semantics (finalised)

```
available = total + carryOverDays - taken - pending

taken   = historic backfill entries only (unchanged)
pending = ALL active (non-rejected, non-cancelled) non-historic requests
```

`pending` is decremented when a request is rejected at any stage, cancelled by the employee, or cancelled by an admin. It is **not** moved to `taken` on approval — the dates are still in the future. A future cron job will handle moving approved-past days from `pending` → `taken` as part of the escalation reminder work (P1 backlog).

### Implementation

| Event | `pending` | `taken` |
|---|---|---|
| Request submitted | +days | — |
| Rejected (any stage) | −days | — |
| Employee cancel | −days | — |
| Admin cancel (approved) | −days | — |
| Admin cancel (historic) | — | −days (existing behaviour) |
| MD approves | — | — |

### Implementation status

- [x] Server-side validation uses dynamic computation as a safety double-check
- [x] `POST /api/leave-requests` — increment `pending` on creation
- [x] `manager-decision` / `hr-decision` / `md-decision` (rejected) — decrement `pending`
- [x] Employee cancel (`DELETE /api/leave-requests/:id`) — decrement `pending`
- [x] Admin cancel — decrement `pending` for non-historic, `taken` for historic
- [ ] Cron: move approved-past days `pending` → `taken` (P1 backlog, with escalation reminders)

---

## DEC-003 — Statutory leave types

**Date:** 2026-04-01  
**Status:** Implemented

### Types added

| Leave type | BCEA section | Entitlement | Working days used |
|---|---|---|---|
| Maternity Leave | s25 | 4 consecutive months | 87 |
| Parental Leave | s25A | 10 consecutive days | 10 (industry norm: working days) |
| Adoption Leave | s25B | 10 consecutive weeks | 50 |
| Commissioning Leave | s25C | 10 consecutive weeks | 50 |

### Design decisions

**Event-based, not accrual-based.** These types do not accrue over time — the entitlement exists by virtue of employment, not tenure. The `total` is provisioned as a fixed value.

**Create-only on startup.** The BCEA recalc at startup only creates balance records for statutory types if they don't already exist. It never updates them. This means HR can manually adjust a balance (e.g. an employee has already taken 3 months maternity elsewhere before joining) and the adjustment survives restarts. Accrual types (Annual, Sick, FRL) are still recalculated every startup as before.

**Balance check applies.** Because a balance record exists, the standard balance check in `POST /api/leave-requests` enforces the entitlement ceiling — an employee cannot submit more than their remaining statutory entitlement.

**Parental leave note.** BCEA s25A says "10 consecutive days" without specifying working vs calendar. Industry norm (and what payroll systems use) is working days. This interpretation is used here.

**Naming fix included.** `LeaveRequest.tsx` previously sent shortcodes (`"annual"`, `"sick"`, `"maternity"`) instead of the full names used everywhere else in the system. This caused the balance check to silently skip all employee-submitted requests. Fixed in this item — all values now use full names (`"Annual Leave"`, `"Sick Leave"`, etc.). "Paternity Leave" renamed to "Parental Leave" to match BCEA terminology. "Special Leave" removed (not a BCEA type — can be submitted as Unpaid Leave or handled via admin).

---

## DEC-002 — Server-side leave validation approach

**Date:** 2026-04-01  
**Status:** Implemented

### Validations added to `POST /api/leave-requests`

1. **Date range sanity** — `startDate` must be ≤ `endDate`
2. **Employment start date gate** — leave cannot start before `user.startDate`
3. **Overlap detection** — new request cannot overlap any existing active (non-rejected, non-cancelled) request for the same employee
4. **Balance check** — available days must cover the requested working days

### Balance check implementation note

Because `taken`/`pending` are unreliable (see DEC-001), the balance check computes consumed days dynamically:

```
consumed = balance.taken                                      // historic only
         + Σ working_days(r) for all active non-historic      // live requests
           requests of the same leaveType
available = balance.total + balance.carryOverDays - consumed
```

This is correct in the interim. Once DEC-001 is fully implemented (pending/taken kept accurate), the validation can simplify to `balance.total + balance.carryOverDays - balance.taken - balance.pending`.

### Leave types without a balance record

If no balance record exists for the requested leave type, the balance check is **skipped** — the request proceeds. This applies to leave types not yet configured in the system (e.g., future statutory types). Validation of these types is left to the approval workflow.

---

## DEC-005 — Unpaid leave 7-day notice period

**Date:** 2026-04-01  
**Status:** Implemented

### Rule

Unpaid leave requests must be submitted at least 7 calendar days before the start date. Requests with less than 7 days' notice are rejected at the server with HTTP 400 and error code `NOTICE_PERIOD_REQUIRED`.

### Bypass (discretion)

A manager or admin may submit an unpaid leave request on behalf of an employee with short notice by including `bypassNoticeCheck: true` and a non-empty `bypassReason` string in the request body. The bypass is:

1. Recorded in the audit log (`action: notice_period_bypass`) with the actor, days of notice, and reason.
2. Appended to the leave request's `adminNotes` field so it is visible during the approval workflow.

### Why 7 days?

BCEA s37 requires written notice for temporary absence. Seven calendar days is the industry-standard minimum and aligns with common payroll cut-off cycles. The threshold is currently hardcoded; making it configurable via settings is a P3 backlog item.

---

## DEC-004 — Sick leave probationary rule (BCEA s22)

**Date:** 2026-04-01  
**Status:** Implemented

### BCEA text

- **s22(1):** During every sick leave cycle of 36 months, an employee is entitled to sick leave equal to 6 weeks of work (30 days for a 5-day week).
- **s22(2):** During the first 6 months of employment, an employee is entitled to 1 day's paid sick leave for every 26 days worked.

### Previous behaviour (incorrect)

The BCEA engine pro-rated 30 days linearly across 36 months from day 1. This both overstated entitlement during probation (employee was shown more days than s22(2) allows) and understated it after month 6 (employee had to wait for the full 30 days to "accrue" rather than receiving them immediately).

### Decision: strict BCEA interpretation

| Period | Entitlement |
|---|---|
| Months 0–5 (< 6 months employed) | 1 day per 26 days worked |
| Month 6+ (first cycle onwards) | 30 days for the full 36-month cycle, available immediately |

**Why full entitlement immediately at month 6:** s22(1) grants the full cycle amount unconditionally. s22(2) is a temporary restriction on that right, applicable only during the first 6 months of employment. Once the restriction lifts, the full s22(1) entitlement is available — BCEA does not authorise further pro-rating within the cycle.

**Why no pro-rating on subsequent cycles:** s22(2) applies to "the first six months of employment", not to the start of each 36-month cycle. An employee starting their second cycle immediately has 30 days.

### Working days approximation during probation

Exact attendance records exist but the BCEA recalc runs at startup without loading per-employee attendance. Working days are approximated as `months × 21.67` (5-day week, 52 weeks/12 months). The difference from actual is small (±1–2 days over 6 months) and acceptable given the probationary entitlement is also small. A future improvement could use actual attendance records.

### Implementation

`server/bcea.ts` — `calculateBceaEntitlements()`: the sick leave block now branches on `totalMonths < 6`. The startup recalculation in `server/index.ts` calls this function and upserts balances, so all employees are updated on next restart.
