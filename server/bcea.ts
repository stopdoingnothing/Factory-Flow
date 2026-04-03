/**
 * SA BCEA (Basic Conditions of Employment Act) leave entitlement calculations.
 * Exported as a shared module used by routes and startup recalculation.
 */

/**
 * Calculate the date by which carry-over annual leave must be taken.
 * Under BCEA, unused leave must be taken within the grace period after the
 * anniversary date on which it was carried over. After that it is forfeited.
 *
 * @param startDate    Employee employment start date ('yyyy-MM-dd')
 * @param graceMonths  Months after anniversary before carry-over is forfeited (default 6, configurable via setting 'leave_carry_over_grace_months')
 * @returns  Expiry date string ('yyyy-MM-dd')
 */
export function getCarryOverExpiryDate(startDate: string, graceMonths = 6): string {
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date();

  const totalMonths =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth()) +
    (today.getDate() >= start.getDate() ? 0 : -1);

  // Most recent anniversary = start + N complete years
  const completedYears = Math.floor(Math.max(0, totalMonths) / 12);
  const anniversary = new Date(start);
  anniversary.setFullYear(anniversary.getFullYear() + completedYears);

  // Carry-over expires graceMonths after the anniversary
  const expiry = new Date(anniversary);
  expiry.setMonth(expiry.getMonth() + graceMonths);

  return expiry.toISOString().split('T')[0];
}

export interface BceaEntitlements {
  annualLeave: number;
  sickLeave: number;
  familyResponsibility: number;
  monthsWorked: number;
  notes: {
    annualLeave: string;
    sickLeave: string;
    familyResponsibility: string;
  };
}

/**
 * Statutory leave entitlements under BCEA Chapter 3 (event-based, not accrual-based).
 * These are fixed per-employee values that are provisioned once on first startup.
 * The startup recalc never overwrites them after creation so that HR adjustments persist.
 *
 * Maternity  (s25):   4 consecutive months ≈ 87 working days
 * Parental   (s25A):  10 consecutive days (interpreted as working days per industry norm)
 * Adoption   (s25B):  10 consecutive weeks = 50 working days
 * Commissioning (s25C): 10 consecutive weeks = 50 working days
 */
export const STATUTORY_LEAVE_ENTITLEMENTS: Record<string, number> = {
  'Maternity Leave':     87,
  'Parental Leave':      10,
  'Adoption Leave':      50,
  'Commissioning Leave': 50,
};

/**
 * Calculate the pro-rated leave accrual for the first partial month of employment.
 * Called once at employee creation — adds days earned from the start date to
 * the end of the hire month.  Subsequent accrual is handled by the month-end cron
 * (see calculateMonthEndAccrual).
 */
export function calculateFirstMonthAccrual(startDate: string): {
  annualLeave: number;
  sickLeave: number;
  familyResponsibility: number;
} {
  const start = new Date(startDate + 'T00:00:00');
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  // Days remaining in the start month, including the start day itself
  const daysRemaining = daysInMonth - start.getDate() + 1;
  const fraction = daysRemaining / daysInMonth;

  // Annual: always at the 15 days/year rate (< 24 months at hire)
  const annualLeave = (fraction / 12) * 15;

  // Sick: probationary 1 per 26 working days — virtually always 0 in a partial first month
  const workingDays = fraction * (52 * 5 / 12);
  const sickLeave = Math.floor(workingDays / 26);

  // Family responsibility not available until month 4
  return { annualLeave, sickLeave, familyResponsibility: 0 };
}

/**
 * Calculate the leave increment to add at the end of a calendar month.
 * Run by the last-day-of-month cron for every active employee.
 * Returns days to ADD to each balance's total.
 *
 * @param startDate           Employee employment start date ('yyyy-MM-dd')
 * @param currentSickTotal    Current sick leave balance.total (used to derive increment)
 */
export function calculateMonthEndAccrual(
  startDate: string,
  currentSickTotal: number,
): {
  annualLeave: number;
  sickLeave: number;
  familyResponsibility: number;
  isAnnualCycleEnd: boolean; // true when a 12-month cycle just completed
} {
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date();

  const totalMonths =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth()) +
    (today.getDate() >= start.getDate() ? 0 : -1);

  if (totalMonths <= 0) {
    return { annualLeave: 0, sickLeave: 0, familyResponsibility: 0, isAnnualCycleEnd: false };
  }

  // Annual: one month's worth at the applicable rate
  const annualEntitlement = totalMonths >= 24 ? 20 : 15;
  const annualLeave = (1 / 12) * annualEntitlement;

  // Sick leave (BCEA s22)
  // Months 0-5: probationary — 1 day per 26 working days worked.
  //   The increment is the difference between what the employee should have by now
  //   and what has already been granted (idempotent across multiple cron runs).
  // Month 6: one-time grant to bring the balance to the full 30-day cycle entitlement.
  // Months 7-35: no further accrual within the 36-month cycle.
  let sickLeave = 0;
  if (totalMonths < 6) {
    const workingDaysWorked = Math.floor(totalMonths * (52 * 5 / 12));
    const expectedTotal = Math.floor(workingDaysWorked / 26);
    sickLeave = Math.max(0, expectedTotal - currentSickTotal);
  } else if (totalMonths === 6) {
    sickLeave = Math.max(0, 30 - currentSickTotal);
  }

  // Family responsibility (BCEA s27): 3 days from month 4, once per leave cycle
  const familyResponsibility = totalMonths === 4 ? 3 : 0;

  // Signal year-end so the cron can handle annual leave carry-over
  const isAnnualCycleEnd = totalMonths % 12 === 0;

  return { annualLeave, sickLeave, familyResponsibility, isAnnualCycleEnd };
}

/**
 * Calculate SA BCEA leave entitlements for an employee based on their start date.
 *
 * Annual Leave (s20):  15 working days per 12-month leave cycle (= 21 consecutive days for a 5-day week), pro-rated monthly.
 * Sick Leave (s22):    30 days per 3-year (36-month) cycle, pro-rated monthly.
 *                      This respects the BCEA intent while preventing employees
 *                      from seeing the full 30 days before they have earned it.
 * Family Responsibility (s27): 3 days per cycle, available from month 4.
 * @deprecated Use calculateFirstMonthAccrual (on hire) + calculateMonthEndAccrual (cron) instead.
 *             Retained for the admin SA-preview endpoint and manual recalc tools.
 */
export function calculateBceaEntitlements(startDate: string): BceaEntitlements {
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date();

  const totalMonths =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth()) +
    (today.getDate() >= start.getDate() ? 0 : -1);

  // ANNUAL LEAVE
  // Accrues monthly at entitlement/12 per month within the current 12-month cycle.
  // Entitlement is 15 days until 24 full calendar months of employment are completed,
  // then 20 days for all subsequent cycles.
  // REQ-003 / STORY-007: the first partial calendar month is pro-rated by
  // (days elapsed since start) / (days in the start calendar month).
  const annualEntitlement = totalMonths >= 24 ? 20 : 15;
  const currentAnnualCycleMonths = totalMonths % 12;

  let monthsForAnnual: number;
  let annualNoteDetail: string;
  if (totalMonths === 0) {
    // Still within the first calendar month of employment — pro-rate by days elapsed.
    const daysInStartMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSinceStart = Math.max(0, Math.floor((today.getTime() - start.getTime()) / msPerDay));
    monthsForAnnual = daysSinceStart / daysInStartMonth;
    annualNoteDetail = `${daysSinceStart}/${daysInStartMonth} days of first month (pro-rated, REQ-003)`;
  } else if (currentAnnualCycleMonths === 0) {
    // Completed a full 12-month cycle
    monthsForAnnual = 12;
    annualNoteDetail = `12 of 12 months`;
  } else {
    monthsForAnnual = currentAnnualCycleMonths;
    annualNoteDetail = `${currentAnnualCycleMonths} of 12 months`;
  }

  const annualLeave = Math.round((monthsForAnnual / 12) * annualEntitlement * 10) / 10;
  const annualNote = `${annualNoteDetail} × ${annualEntitlement} days = ${annualLeave} days (${totalMonths >= 24 ? '≥' : '<'} 24 months employed)`;

  // SICK LEAVE — BCEA Section 22 (strictly applied per DEC-004)
  // s22(1): 30 days per 36-month cycle.
  // s22(2): During the first 6 months of employment, 1 day per 26 days worked.
  // After 6 months the full 30-day cycle entitlement is available immediately —
  // no pro-rating within the cycle. Subsequent cycles also start at full entitlement
  // (s22(2) applies only to the first 6 months of employment, not to later cycles).
  let sickLeave: number;
  let sickNote: string;
  if (totalMonths < 6) {
    // Probationary accrual: 1 day per 26 working days.
    // Working days approximated as months × 21.67 (5-day week, 52 weeks/12 months).
    // For the first partial month, use the same fractional months value used for annual leave.
    const workingDaysWorked = Math.floor(monthsForAnnual * (52 * 5 / 12));
    sickLeave = Math.floor(workingDaysWorked / 26);
    sickNote = `Probationary period (${totalMonths} months < 6): ~${workingDaysWorked} working days ÷ 26 = ${sickLeave} days (BCEA s22(2))`;
  } else {
    // Full cycle entitlement: 30 days, available immediately from month 6.
    sickLeave = 30;
    sickNote = `Full entitlement (${totalMonths} months ≥ 6): 30 days per 36-month cycle (BCEA s22(1))`;
  }

  // FAMILY RESPONSIBILITY — BCEA Section 27
  // 3 days per leave cycle, only available after 4 months of continuous employment.
  const familyResponsibility = totalMonths >= 4 ? 3 : 0;
  const familyNote =
    totalMonths >= 4
      ? `3 days per leave cycle (available from month 4)`
      : `Not yet available — requires 4+ months employment (${totalMonths} months so far)`;

  return {
    annualLeave,
    sickLeave,
    familyResponsibility,
    monthsWorked: totalMonths,
    notes: { annualLeave: annualNote, sickLeave: sickNote, familyResponsibility: familyNote },
  };
}
