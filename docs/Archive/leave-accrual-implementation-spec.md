# Leave Accrual Engine — Implementation Specification

*Version 1.3 | Updated: 2026-04-04 | Revision: Per-employee rate override*
*Parent Spec: f921f141-183f-4a23-bffe-9f52c739401a (Leave Management System)*

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-04-03 | Initial specification |
| 1.1 | 2026-04-04 | Gap analysis refinements: configurable rate tiers, cycle boundary constraints, mandatory adjustment reasons, sick leave transition clarification, Appendix A. |
| 1.2 | 2026-04-04 | Cycle definition corrections. Separated three distinct cycle types: system-wide calendar cycle (Annual Leave, FRL), per-employee employment-anchored cycle (Sick Leave), and per-leave-type configurable cycle (Custom). Removed per-employee leave_cycle_start_date field. Added system-wide annual_leave_cycle_start setting. Sick leave cycle anchored to exact employment_start_date (mid-month allowed). Custom leave types get cycle_anchor field. |
| 1.3 | 2026-04-04 | Per-employee rate override. Added optional `annual_leave_override_days` field on employee profile. When set, overrides tier-based rate permanently until HR changes it. Tiers remain as the default for employees without an override. Updated rate determination logic, processing order, edge cases, and tests. |

---

## 1. Purpose

This document specifies exactly how the leave accrual engine must behave. It is intended to be consumed by a coding agent and eliminates all ambiguity by documenting every design decision, formula, edge case, and expected outcome. Every decision marked **[DECIDED]** has been confirmed by the product owner and must not be re-interpreted.

---

## 2. Glossary

| Term | Definition |
|---|---|
| **Annual Leave Cycle** | A 12-month period defined by the system-wide `annual_leave_cycle_start` setting. Defaults to 1 January - 31 December. Same for all employees. Also governs FRL. |
| **Sick Leave Cycle** | A 36-month period starting from each employee's `employment_start_date`. Per-employee, can start mid-month. |
| **Custom Leave Cycle** | A cycle whose length and anchor are defined per custom leave type by HR. |
| **Accrual Run** | The scheduled process that credits leave to employee balances. |
| **Pro-ration** | Calculating a partial month's accrual based on the fraction of the month the employee was active. |
| **Grace Period** | The 6-month window after an annual leave cycle ends, during which unused prior-cycle leave may still be taken before forfeiture. |
| **BCEA** | Basic Conditions of Employment Act (South Africa). The governing legislation. |
| **Active Days** | Calendar days in the month during which the employee was employed and not on unpaid or accrual-pausing leave. |
| **Accrual Rate Tier** | A configurable rule that determines the annual leave accrual rate based on months of service. |
| **RATE** | The applicable monthly_accrual_rate for an employee, determined by their accrual rate tier. |

---

## 3. Cycle Definitions

This section defines the three distinct cycle types used across the system. Each leave type is governed by exactly one cycle type.

### 3.1 Annual Leave Cycle (System-Wide Calendar Cycle)

**[DECIDED] The annual leave cycle is defined by a system-wide setting, the same for all employees.**

| Setting | Type | Default | Constraint |
|---|---|---|---|
| `annual_leave_cycle_start` | month-day | 1 January | Must be the 1st of a month. HR can change this system-wide (e.g., to 1 March for financial year alignment). |

The cycle runs for 12 months from this date. Example: if set to 1 March, the cycle runs 1 March 2026 - 28 February 2027.

**Leave types governed by this cycle:** Annual Leave, Family Responsibility Leave.

Because the start is always the 1st of a month and the accrual run processes whole calendar months, the cycle boundary always aligns with month boundaries. No mid-month split is ever needed.

HR can change the system-wide start date. When changed, the system must handle the transition: the current cycle is shortened or extended to bridge to the new start date. This is a rare administrative action and should require confirmation.

### 3.2 Sick Leave Cycle (Per-Employee Employment-Anchored)

**[DECIDED] The sick leave cycle always starts on the employee's exact `employment_start_date`, even if mid-month.**

The cycle runs for 36 months. Example: employee starts 15 March 2026, sick leave cycle runs 15 March 2026 - 14 March 2029.

This means the sick leave cycle boundary CAN fall mid-month. However, this does not affect accrual calculations because sick leave is not accrued monthly after the first 6 months — it is a fixed pool. The only event that occurs at cycle boundaries is the 36-month reset, which grants a new lump-sum entitlement. This reset should be processed on the exact cycle boundary date, not deferred to the next accrual run.

**Leave types governed by this cycle:** Sick Leave only.

### 3.3 Custom Leave Cycle (Per-Leave-Type Configurable)

**[DECIDED] When HR creates a custom leave type, they choose a cycle anchor.**

| cycle_anchor value | Behaviour |
|---|---|
| `calendar_year` | Uses the same system-wide `annual_leave_cycle_start` date as Annual Leave. Same for all employees. |
| `employment_start_date` | Uses each employee's `employment_start_date` as the cycle start. Per-employee, can be mid-month. |

The `cycle_length_months` field (defined in Section 8.1) determines how long each cycle runs.

**Leave types governed by this cycle:** All custom/configurable leave types (e.g., Study Leave).

---

## 4. Accrual Run — Timing & Trigger

**[DECIDED] The accrual process runs on the 1st of each month and credits leave for the prior calendar month.**

- The run for March service executes on 1 April.
- The run must process every employee whose `status = 'active'` at any point during the prior month — including employees who were terminated/deactivated partway through.
- Employees whose `employment_start_date` is in the future (not yet started) are skipped entirely.
- The accrual run must be **idempotent**: if triggered twice for the same month, the second run must detect the existing accrual record and produce no duplicate credits. Implementation: each accrual record must include an `accrual_period` field (e.g., `"2026-03"`) and the engine must check for an existing record with the same `employee_id`, `leave_type`, and `accrual_period` before inserting. If a record exists, skip.
- Each accrual event must produce an audit log entry (see Section 12).
- **Sick leave 36-month resets** are an exception: because the sick leave cycle can start mid-month, the reset should be checked daily or triggered on the exact cycle boundary date, not deferred to the monthly accrual run. Alternatively, the monthly run can check whether a 36-month boundary has passed since the last reset and process it retroactively.

---

## 5. Annual Leave Accrual

### 5.1 Base Rule & Rate Determination

**[DECIDED] The annual leave accrual rate is determined by a two-level system: system-wide tiers provide the default, and an optional per-employee override takes precedence when set.**

#### Rate Determination Logic (executed for each employee during every accrual run):

```
if employee.annual_leave_override_days is NOT NULL:
    RATE = employee.annual_leave_override_days / 12
else:
    tier = highest tier where min_months_of_service <= employee's completed months
    RATE = tier.annual_entitlement_days / 12
```

**[DECIDED] When a per-employee override is set, it is permanent until HR explicitly changes or clears it. Tier boundary crossings do NOT affect employees with an override — tier logic is skipped entirely.**

#### System-Wide Tiers (default for employees without an override)

The system must support a table of accrual rate tiers:

| Field | Type | Description |
|---|---|---|
| `min_months_of_service` | integer | Minimum completed months of service for this tier to apply (inclusive). |
| `annual_entitlement_days` | decimal | Total annual leave days per 12-month cycle at this tier. |
| `monthly_accrual_rate` | decimal | Derived: `annual_entitlement_days / 12`. This is the value used in all accrual formulas. |

Default configuration (must be pre-loaded but editable by HR):

| Tier | Min Months | Annual Entitlement | Monthly Rate |
|---|---|---|---|
| 1 | 0 | 15 days | 1.25 days/month |
| 2 | 24 | 20 days | 1.6667 days/month |

HR can add, edit, or remove tiers. The accrual engine determines which tier applies based on completed months of service (from `employment_start_date` to the last day of the accrual month).

**Important:** When an employee crosses a tier boundary mid-month (e.g., they hit 24 months on the 15th), the new rate applies to the **entire month's** accrual. The system does not split a month between two rates.

#### Per-Employee Override

**[DECIDED] The override is stored as `annual_leave_override_days` on the employee profile — a nullable decimal representing annual entitlement days. The system derives the monthly rate as `annual_leave_override_days / 12`.**

- When `NULL`: tiers apply as normal.
- When set (e.g., `18`): `RATE = 18 / 12 = 1.5 days/month`. Tiers are completely ignored for this employee.
- HR can set, change, or clear the override at any time. Changes take effect from the next accrual run.
- Setting or clearing the override must be audit-logged with the HR user, old value, new value, and reason.

Use cases: senior hires with negotiated entitlements, contractual exceptions, employees on special arrangements.

Throughout the remainder of this spec, `RATE` refers to the applicable `monthly_accrual_rate` for the employee (whether from override or tier). Where examples use `1.25`, this is illustrative of the default Tier 1 rate.

The **"earned first" rule** applies: an employee may only take annual leave they have already accrued. The system must validate available balance at the time of request submission.

### 5.2 Full Month

If the employee was active for the entire calendar month (no unpaid leave, no accrual-pausing leave, employed for the full month):

```
accrual = RATE
```

### 5.3 Partial Month — New Starter

If the employee's `employment_start_date` falls within the accrual month:

```
active_days = (last_day_of_month - employment_start_date + 1)
total_days  = calendar_days_in_month
accrual     = RATE * (active_days / total_days)
```

**[DECIDED] Pro-ration uses calendar days, not working days.**

Example: Employee starts 15 March (31-day month), Tier 1.
`active_days = 31 - 15 + 1 = 17`
`accrual = 1.25 * (17 / 31) = 0.685483870967...`

**[DECIDED] No rounding. Store the exact decimal value.** Display may be rounded to 2 decimal places in the UI, but the stored balance must retain full precision.

### 5.4 Partial Month — Termination

**[DECIDED] Terminated employees receive a final pro-rated accrual for their last month.**

If the employee's `deactivation_date` falls within the accrual month:

```
active_days = (deactivation_date - first_day_of_month + 1)
total_days  = calendar_days_in_month
accrual     = RATE * (active_days / total_days)
```

**Critical implementation note (from gap analysis):** The accrual engine must NOT skip terminated employees. The query for eligible employees must include anyone who was active at any point during the prior month, even if their `status` is now `inactive`. Filter: `status = 'active' OR (status = 'inactive' AND deactivation_date >= first_day_of_prior_month)`.

### 5.5 Partial Month — Unpaid Leave

If the employee took unpaid leave during the month, the days on unpaid leave are subtracted from active days:

```
active_days = calendar_days_in_month - accrual_pausing_leave_calendar_days_in_month
total_days  = calendar_days_in_month
accrual     = RATE * (active_days / total_days)
```

Where `accrual_pausing_leave_calendar_days_in_month` counts every calendar day (including weekends) that falls within an approved accrual-pausing leave period in that month.

If `active_days <= 0` (entire month on accrual-pausing leave), accrual = 0.

**Critical implementation note (from gap analysis):** The current implementation does not deduct accrual-pausing leave days at all — it always credits the full rate. This is the single largest functional gap and must be fixed.

### 5.6 Accrual-Pausing Leave Types

**[DECIDED] Annual leave does NOT accrue during maternity, parental, adoption, or commissioning parental leave.**

The following leave types pause annual leave accrual:
- Unpaid Leave
- Maternity Leave
- Parental Leave
- Adoption Leave
- Commissioning Parental Leave
- Any custom leave type with `pauses_annual_accrual = true`

Leave types that do **NOT** pause accrual:
- Annual Leave
- Sick Leave
- Family Responsibility Leave
- Custom leave types where `pauses_annual_accrual = false` (default)

### 5.7 Combined Partial Month

Multiple factors can combine in a single month (e.g., new starter + unpaid leave):

```
active_days = (days_employed_in_month) - (days_on_accrual_pausing_leave)
total_days  = calendar_days_in_month
accrual     = RATE * (active_days / total_days)
```

### 5.8 Termination Settlement

When an employee is deactivated mid-month, the system should:
1. Calculate the final pro-rated accrual for the partial month.
2. Credit it to the employee's balance immediately (do not wait for the 1st of the next month).
3. Mark the balance as "final" — no further accruals will be processed.
4. The remaining balance (accrued minus taken) is available for payout calculation (payout itself is out of scope — payroll handles it).

### 5.9 Leave Cycle Rollover & Forfeiture

The annual leave cycle is governed by the system-wide `annual_leave_cycle_start` setting (see Section 3.1). At the end of each 12-month cycle:

1. Any unused annual leave balance is tagged as "prior-cycle carry-over."
2. A 6-month grace period begins.
3. **[DECIDED] The system sends forfeiture warnings at 60 days and 30 days before the grace period expires.** These are sent to the employee and CC'd to HR.
4. **[DECIDED] At grace period expiry, the system flags the remaining prior-cycle balance for HR review. It does NOT auto-forfeit.** HR must manually action the forfeiture.
5. Until HR actions it, the prior-cycle balance remains usable by the employee.
6. When HR confirms forfeiture, the balance is zeroed and an audit entry is created.

The system must track current-cycle and prior-cycle balances separately.

**Critical implementation note (from gap analysis):** The current implementation stamps `carryOverDays` but does not zero the current balance on rollover, and sends no forfeiture warnings. Both must be implemented.

---

## 6. Sick Leave Accrual

### 6.1 Cycle Structure

BCEA entitlement: **30 working days per 36-month cycle** (for a 5-day-per-week worker). The cycle starts from the employee's exact `employment_start_date` (see Section 3.2) and repeats every 36 months.

For employees working fewer than 5 days per week, the entitlement scales:

```
entitlement = 30 * (scheduled_days_per_week / 5)
```

### 6.2 First 6 Months — Graduated Accrual

During the first 6 months of employment, sick leave accrues at **1 day per 26 days worked**.

**[DECIDED] "Days worked" is derived from the employee's standard schedule minus any recorded leave (of any type), not from actual attendance tracking.**

```
days_worked_in_month = scheduled_working_days_in_month - total_leave_days_taken_in_month
```

The system must maintain a running cumulative counter: `cumulative_days_worked`. For every 26 days accumulated, 1 sick day is credited.

```
newly_earned = floor(cumulative_days_worked / 26) - graduated_days_credited
```

**Critical implementation note (from gap analysis):** The current implementation approximates days worked as `Math.floor(totalMonths * 21.67)`. This must use actual leave records.

### 6.3 Transition to Full Entitlement

**[DECIDED] The transition from graduated accrual to full entitlement occurs on the 1st of the month following the employee's 6-month employment anniversary.**

On that date:
1. Calculate the full 36-month cycle entitlement.
2. Subtract any sick leave **already taken** during the first 6 months.
3. The result becomes the remaining sick leave balance.
4. The graduated accrual counter is retired.

**Critical clarification (from gap analysis):** The formula is `full_entitlement - sick_leave_days_TAKEN`, NOT `full_entitlement - sick_leave_days_ACCRUED`. An employee who accrued 4 sick days but only used 1 should get `30 - 1 = 29`, not `30 - 4 = 26`.

### 6.4 Post-6-Month Period

After transition, there is no monthly accrual. The balance is a single decrementing pool.

### 6.5 36-Month Cycle Reset

At the end of every 36-month cycle:
1. Unused sick leave does **not** carry over — the balance resets.
2. A new full entitlement (based on current `work_days_per_week`) is granted immediately.
3. The graduated accrual rule does **not** re-apply.

Because the sick leave cycle is anchored to `employment_start_date` and can start mid-month, the cycle boundary can fall on any date. The system must check for cycle resets either daily or during each monthly accrual run (checking if the boundary has passed since the last reset).

```
cycle_end = employment_start_date + (36 * n) months   (where n = 1, 2, 3, ...)
```

### 6.6 Medical Certificate Triggers

- **Statutory (BCEA):** Medical certificate required if absence exceeds 2 consecutive working days.
- **Company policy:** Medical certificate required on a Friday, Monday, or day adjacent to a public holiday.

The system flags these at submission time. If the document is not provided, the request can still be submitted but is flagged for HR attention.

---

## 7. Family Responsibility Leave (FRL)

### 7.1 Entitlement & Cycle

3 days per annual leave cycle. Granted as a lump sum at the start of each cycle — no monthly accrual.

**[DECIDED] FRL follows the same cycle as Annual Leave** — the system-wide `annual_leave_cycle_start` setting (see Section 3.1).

### 7.2 Eligibility Gate

FRL requires **both**:
1. Employed for at least 4 months (from `employment_start_date`).
2. Work at least 4 days per week (`work_days_per_week >= 4`).

Before meeting both conditions, FRL shows as **locked** with balance 0.

On the day the employee reaches 4 months (and meets the work-days condition), the full 3 days become available immediately — no pro-rating.

**Critical implementation note (from gap analysis):** The current implementation only checks months, not `work_days_per_week`.

### 7.3 Annual Reset

**[DECIDED] FRL resets to 3 days at the start of each annual leave cycle.** Unused days are forfeited automatically with no grace period.

**Critical implementation note (from gap analysis):** The current implementation grants FRL once at the 4-month mark but never resets.

### 7.4 Mid-Cycle Eligibility Change

**[DECIDED] If schedule drops below 4 days/week mid-cycle, retain remaining FRL until cycle end. No new allocation at next reset if still under 4 days/week.**

The 4-month employment criterion is a one-time gate — once passed, permanently satisfied.

---

## 8. Maternity, Parental, Adoption & Commissioning Parental Leave

### 8.1 No Accrual Logic

Event-triggered, fixed-duration entitlements. No monthly accrual, no balance pool.

| Leave Type | Duration | Key Rules |
|---|---|---|
| Maternity | 4 consecutive months | Start at least 4 weeks before due date. Mandatory 6-week post-birth non-working period. |
| Parental | 10 consecutive days | Non-birthing parent. |
| Adoption | 10 consecutive weeks | One parent per adoption event. |
| Commissioning Parental | 10 consecutive weeks | Surrogacy commissioning parent. |

### 8.2 Overlap Prevention

The system must prevent overlapping leave bookings during these periods.

### 8.3 Impact on Other Accruals

These leave types pause annual leave accrual per Section 5.6.

---

## 9. Custom Leave Types

### 9.1 Configurable Accrual

When HR creates a custom leave type, the following fields must be configurable:

| Field | Type | Description |
|---|---|---|
| `accrual_type` | enum | `none` (approval-only), `lump_sum` (granted at cycle start), `monthly` (accrues per month) |
| `accrual_rate` | decimal | Days per month (only if `accrual_type = monthly`) |
| `lump_sum_amount` | decimal | Days granted at cycle start (only if `accrual_type = lump_sum`) |
| `cycle_length_months` | integer | Length of the entitlement cycle (e.g., 12 for annual) |
| `cycle_anchor` | enum | `calendar_year` (uses system-wide `annual_leave_cycle_start`) or `employment_start_date` (per-employee, anchored to start date) |
| `carry_over` | boolean | Whether unused balance carries to the next cycle |
| `pauses_annual_accrual` | boolean | Whether this leave type pauses annual leave accrual |
| `requires_approval` | boolean | Whether this leave type requires manager/HR approval |
| `max_days_per_cycle` | decimal or null | Cap on total usage per cycle (null = unlimited) |

**Critical implementation note (from gap analysis):** The `pauses_annual_accrual` field is missing from the current `leave_rules` schema. It must be added. The `cycle_anchor` field is new in v1.2.

### 9.2 Custom Leave in the Accrual Engine

If `accrual_type = monthly`, the accrual engine applies the same pro-ration rules as annual leave (Section 5.3-5.7) using the custom `accrual_rate`.

If `accrual_type = lump_sum`, the system grants the full `lump_sum_amount` at the start of each cycle (determined by `cycle_anchor` and `cycle_length_months`).

If `accrual_type = none`, the accrual engine ignores it.

If `cycle_anchor = employment_start_date`, the cycle boundary can fall mid-month. For `accrual_type = monthly`, the first and last months of a cycle should be pro-rated using calendar days, same as a new starter. For `accrual_type = lump_sum`, the full amount is granted on the exact cycle start date.

---

## 10. Unpaid Leave — Impact on Accrual

Unpaid leave has no balance and no accrual of its own. Its only interaction with the accrual engine is reducing annual leave accrual (and any custom monthly-accrual leave) for the month in which it occurs (see Section 5.5).

---

## 11. Manual Balance Adjustments

**[DECIDED] HR can manually adjust any leave balance for any employee.**

- Adjustment can be positive (credit) or negative (debit).
- **[DECIDED] A free-text `reason` field is mandatory and must not be empty.** The API must reject blank reasons.
- Recorded as an audit log entry with: employee, leave type, adjustment amount, new balance, reason, HR user, timestamp.
- Bypasses all validation rules. Effective immediately.

---

## 12. Audit Trail

Every accrual-related event must be logged:

| Field | Description |
|---|---|
| `id` | Unique identifier |
| `timestamp` | UTC timestamp |
| `employee_id` | Affected employee |
| `leave_type` | Leave type affected |
| `event_type` | One of: `monthly_accrual`, `pro_rated_accrual`, `cycle_reset`, `forfeiture_warning`, `forfeiture_actioned`, `manual_adjustment`, `sick_leave_graduated_credit`, `sick_leave_transition`, `frl_cycle_reset`, `termination_settlement`, `sick_leave_cycle_reset` |
| `amount` | Days credited, debited, or forfeited |
| `balance_before` | Balance before event |
| `balance_after` | Balance after event |
| `calculation_basis` | Human-readable explanation (e.g., "1.6667 * (17/31) = 0.9140... - partial month, Tier 2") |
| `accrual_period` | `YYYY-MM` format. Used for idempotency. |
| `triggered_by` | `system` or `user_id` |
| `metadata` | JSON field for context (e.g., `{"rate_tier": 2, "unpaid_leave_days": 5}`) |

**Critical implementation note:** The `audit_logs` table exists but is not written to by the accrual engine. All code paths must write to it.

---

## 13. Data Model Requirements

### 13.1 System-Wide Settings

| Field | Type | Default | Description |
|---|---|---|---|
| `annual_leave_cycle_start` | month-day | January 1 | System-wide start date for annual leave and FRL cycles. Must be the 1st of a month. |

### 13.2 Employee Profile

| Field | Type | Description |
|---|---|---|
| `employment_start_date` | date | First day of employment. Immutable. Anchors sick leave cycle. |
| `work_days_per_week` | integer (1-7) | Standard working days per week. |
| `status` | enum | `active`, `inactive`. |
| `deactivation_date` | date or null | Date of deactivation. |
| `annual_leave_override_days` | decimal or null | Optional per-employee override for annual leave entitlement (days per year). When set, `RATE = this value / 12` and tier logic is skipped. When null, tiers apply. |

Note: `leave_cycle_start_date` is NOT a per-employee field. Annual leave and FRL cycles are governed by the system-wide `annual_leave_cycle_start`. Sick leave cycles are derived from `employment_start_date`.

### 13.3 Leave Balances (per employee, per leave type)

| Field | Type | Description |
|---|---|---|
| `current_cycle_balance` | decimal | Leave available in the current cycle. |
| `prior_cycle_carry_over` | decimal | Annual leave only: prior-cycle balance subject to forfeiture. |
| `total_accrued` | decimal | Cumulative total accrued in current cycle. |
| `total_taken` | decimal | Cumulative total taken in current cycle. |

### 13.4 Sick Leave Tracking (per employee)

| Field | Type | Description |
|---|---|---|
| `sick_cycle_start_date` | date | Start of current 36-month cycle (= `employment_start_date` initially, updated on each reset). |
| `graduated_accrual_active` | boolean | True if in first 6 months of employment. |
| `cumulative_days_worked` | integer | Running counter for graduated accrual. |
| `graduated_days_credited` | integer | Sick days credited under 1-per-26 rule. |

### 13.5 Accrual Rate Tiers (system-wide configuration)

| Field | Type | Description |
|---|---|---|
| `id` | integer | Unique tier ID. |
| `min_months_of_service` | integer | Minimum completed months. |
| `annual_entitlement_days` | decimal | Days per cycle at this tier. |
| `monthly_accrual_rate` | decimal | Derived: `annual_entitlement_days / 12`. |

---

## 14. Accrual Run — Processing Order

On the 1st of each month, the accrual engine processes the prior month:

**Step 1: Identify eligible employees.** All employees active at any point during the prior month. Includes terminated employees whose `deactivation_date` falls within the prior month.

**Step 2: Determine RATE for each employee.** If `annual_leave_override_days` is set: `RATE = annual_leave_override_days / 12` (skip tier lookup). Otherwise: calculate completed months of service, look up highest tier where `min_months_of_service` <= completed months, use that tier's `monthly_accrual_rate`.

**Step 3: Calculate annual leave accrual.** Determine `active_days` (calendar days employed, minus accrual-pausing leave days). Apply `RATE * (active_days / calendar_days_in_month)`. Check idempotency. Credit to `current_cycle_balance`. Audit log.

**Step 4: Update graduated sick leave (first 6 months only).** Calculate `days_worked_in_month` from schedule minus leave taken. Update `cumulative_days_worked`. Credit if `floor(counter / 26) > graduated_days_credited`. Audit log.

**Step 5: Check sick leave transitions.** If today is the 1st of the month after the 6-month anniversary: retire graduated accrual, set balance = `full_entitlement - sick_leave_TAKEN`. Audit log.

**Step 6: Check sick leave 36-month resets.** If `employment_start_date + (36 * n) months` has passed since last reset: reset balance to full entitlement, update `sick_cycle_start_date`. Audit log. (Note: because the sick cycle can start mid-month, this check must detect boundaries that fell during the prior month, not just on the 1st.)

**Step 7: Check annual leave cycle rollovers.** If the prior month is the last month of the system-wide annual leave cycle: move `current_cycle_balance` to `prior_cycle_carry_over`, zero `current_cycle_balance`, schedule forfeiture warnings. Audit log.

**Step 8: Check FRL cycle resets.** Triggered by the same cycle boundary as Step 7. If eligible (`work_days_per_week >= 4` AND employed > 4 months): reset FRL to 3. Otherwise: set to 0. Audit log.

**Step 9: Process custom monthly-accrual leave types.** Apply same pro-ration as annual leave using custom `accrual_rate`. Determine cycle from `cycle_anchor`. Check idempotency. Audit log.

**Step 10: Check custom lump-sum leave type resets.** If a custom leave type with `accrual_type = lump_sum` has a cycle boundary in the prior month: grant `lump_sum_amount`. Handle carry-over per configuration. Audit log.

**Step 11: Forfeiture warnings.** Send notifications at 60 and 30 days before grace period expiry.

**Step 12: Forfeiture flags.** If grace period expired and `prior_cycle_carry_over > 0`: flag for HR review. Re-flag monthly until actioned.

---

## 15. Edge Cases — Comprehensive List

| # | Scenario | Expected Behaviour |
|---|---|---|
| 1 | Employee starts last day of month | `RATE * (1/31)`. Near-zero but credited. |
| 2 | Employee starts 1st of month | Full `RATE`. No pro-ration. |
| 3 | Entire month on unpaid leave | Accrual = 0. |
| 4 | Starts mid-month + unpaid leave | Combined formula (Section 5.7). |
| 5 | Terminated on 1st of month | 1 active day. `RATE * (1/N)`. Settlement triggered. |
| 6 | Leap year February | Denominator = 29. Full month = `RATE`. |
| 7 | 4 months maternity | 0 annual accrual for 4 months. Sick leave unaffected. |
| 8 | Accrual run twice for same month | Idempotent via `accrual_period`. |
| 9 | No leave in month | Standard full accrual. |
| 10 | Employee works 3 days/week | Sick = 18 days/36 months. FRL locked. |
| 11 | Crosses 4-month mark mid-month | FRL unlocked immediately. 3 days granted. |
| 12 | Sick graduated + 5 days leave in month 2 | Counter reduced. Delays next credit. |
| 13 | Sick transition, 0 days used | Balance = 30. |
| 14 | Sick transition, accrued 4, used 1 | Balance = 30 - 1 = 29 (taken, not accrued). |
| 15 | Sick 36-month reset, 10 unused | Resets to full entitlement. 10 lost. |
| 16 | Sick cycle boundary falls mid-month (e.g., 15th) | Reset processed on the boundary date, not deferred to next month. |
| 17 | HR doesn't action forfeiture flag | Carry-over remains usable. Re-flagged monthly. |
| 18 | Deactivated then reactivated | HR manually adjusts balances. No auto-backfill. |
| 19 | Custom leave with `pauses_annual_accrual = true` | Days subtracted from active_days. |
| 20 | Multiple pausing leave types in month | All days summed. No double-counting. |
| 21 | `work_days_per_week` changes mid-month | End-of-month value used for whole month. |
| 22 | Crosses Tier 1 to Tier 2 mid-month (no override) | Entire month uses Tier 2 rate. |
| 23 | `annual_leave_cycle_start` set to non-1st | System rejects. Must be 1st of month. |
| 24 | Manual adjustment with blank reason | System rejects. Reason mandatory. |
| 25 | Terminated before accrual month started | Skipped — not active during month. |
| 26 | Custom leave with `cycle_anchor = employment_start_date` and mid-month cycle boundary | First/last cycle months are pro-rated for monthly accrual types. Lump-sum granted on exact date. |
| 27 | HR changes system-wide `annual_leave_cycle_start` | Current cycle extended/shortened to bridge. Requires confirmation. |
| 28 | Employee has `annual_leave_override_days = 18` | RATE = 18/12 = 1.5. Tier logic skipped entirely. |
| 29 | Employee with override crosses tier boundary (e.g., 24 months) | No change. Override is permanent. Tier logic not evaluated. |
| 30 | HR clears `annual_leave_override_days` (sets to null) | Employee falls back to tier-based rate from next accrual run. Audit-logged. |
| 31 | HR sets override and changes it in the same month before accrual runs | Latest value is used. Both changes audit-logged. |

---

## 16. Notifications Generated by the Accrual Engine

| Trigger | Recipient(s) | Content |
|---|---|---|
| Monthly accrual credited | Employee | "[X] days accrued for [Month]. New balance: [Y]." |
| Forfeiture warning — 60 days | Employee, HR | "[X] days subject to forfeiture on [date]." |
| Forfeiture warning — 30 days | Employee, HR | Same, increased urgency. |
| Forfeiture flag | HR | "[Employee] has [X] days past grace. Action required." |
| Sick leave transition | Employee, HR | "Entitlement updated to [X] days for cycle remainder." |
| Sick leave cycle reset | Employee, HR | "Sick leave reset. New entitlement: [X] days." |
| FRL cycle reset | Employee | "FRL reset to 3 days." |
| FRL eligibility unlocked | Employee | "Now eligible for FRL (3 days/cycle)." |
| Termination settlement | HR | "Final accrual processed. Balances: [details]." |
| Rate tier change | Employee, HR | "Accrual rate increased to [X] days/year." |

---

## 17. Testing Requirements (32 Tests)

1. Full-month Tier 1 accrual -> 1.25 days.
2. Full-month Tier 2 (24+ months) -> 1.6667 days.
3. Partial month — starts 15th of 30-day month -> `RATE * (16/30)`.
4. Partial month — terminated 10th of 31-day month -> `RATE * (10/31)`.
5. 7 days unpaid in 28-day month -> `RATE * (21/28)`.
6. Full month maternity -> 0 annual accrual.
7. Sick graduated: 22 working days, no leave -> counter +22; credit if crosses 26.
8. Sick graduated: 5 days leave taken -> counter reduced by 5.
9. Sick transition -> balance = entitlement - days TAKEN (not accrued).
10. Sick 36-month reset -> full entitlement restored.
11. Sick 36-month reset with mid-month boundary -> processed correctly.
12. FRL gate: 3mo29d -> locked.
13. FRL gate: 3 days/week, 6 months service -> locked.
14. FRL cycle reset (eligible) -> balance = 3.
15. FRL cycle reset (3 days/week) -> balance = 0.
16. Annual leave rollover -> current zeroed, carry-over set.
17. Forfeiture flag after grace -> not zeroed, flag created.
18. Manual adjustment +/- with reason -> audit trail.
19. Manual adjustment blank reason -> rejected.
20. Idempotency -> no duplicates on double run.
21. Leap year February -> denominator = 29.
22. Combined: new starter + unpaid in same month.
23. Custom monthly accrual -> same pro-ration as annual.
24. Custom leave with `cycle_anchor = employment_start_date` -> cycle calculated per employee.
25. Rate tier: 23 months = Tier 1, 24 months = Tier 2 (no override).
26. `annual_leave_cycle_start` validation -> reject non-1st.
27. Terminated employee -> included in final month accrual.
28. Terminated before accrual month -> skipped.
29. Per-employee override: `annual_leave_override_days = 18` -> RATE = 1.5, tier logic skipped.
30. Per-employee override + tier boundary crossing -> override prevails, no rate change.
31. HR clears override (sets to null) -> next accrual uses tier-based rate.
32. Override set/changed -> audit log entry with old value, new value, and HR user.

---

## Appendix A: Gap Analysis Cross-Reference

| Gap # | Description | Spec Section | Status |
|---|---|---|---|
| 1 | Accrual run timing | S4 | Spec authoritative. Change to 1st of month. |
| 2 | Pausing leave not deducted | S5.5, S5.6 | Spec authoritative. Must query and deduct. |
| 3 | No idempotency | S4, S12 | Spec authoritative. Use accrual_period. |
| 4 | No audit trail | S12 | Spec authoritative. All paths must log. |
| 5 | Termination settlement | S5.4, S5.8 | Spec authoritative. Don't skip terminated. |
| 6 | Rollover incomplete | S5.9 | Spec authoritative. Zero balance + warnings. |
| 7 | FRL eligibility | S7.2 | Spec authoritative. Check work_days_per_week. |
| 8 | FRL reset missing | S7.3 | Spec authoritative. Reset at cycle boundary. |
| 9 | Rate after 24 months | S5.1 | Spec updated v1.1. Configurable tiers. |
| 10 | Missing schema fields | S13 | Spec authoritative. All fields required. |
| 11 | Sick graduated approx | S6.2 | Spec authoritative. Use actual leave records. |
| 12 | Sick transition formula | S6.3 | Spec clarified v1.1. Use days TAKEN. |
| 13 | Cycle mid-month split | S3.1 | Eliminated for annual/FRL (1st-of-month constraint). Sick leave mid-month handled in S6.5. |
| 14 | pauses_annual_accrual missing | S9.1 | Spec authoritative. Add to schema. |

## Appendix B: Cycle Summary

| Leave Type | Cycle Type | Start Date | Length | Mid-Month Boundary? |
|---|---|---|---|---|
| Annual Leave | System-wide calendar | `annual_leave_cycle_start` (default 1 Jan) | 12 months | No (constrained to 1st of month) |
| Family Responsibility Leave | System-wide calendar | Same as Annual Leave | 12 months | No |
| Sick Leave | Per-employee employment-anchored | `employment_start_date` (exact date) | 36 months | Yes (can be any date) |
| Custom (calendar_year) | System-wide calendar | Same as Annual Leave | Configurable | No |
| Custom (employment_start_date) | Per-employee employment-anchored | `employment_start_date` (exact date) | Configurable | Yes |
| Maternity / Parental / Adoption / Commissioning | No cycle | Event-triggered | Fixed duration | N/A |
| Unpaid Leave | No cycle | Event-triggered | As approved | N/A |
