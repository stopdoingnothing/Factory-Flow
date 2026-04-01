/**
 * SA BCEA (Basic Conditions of Employment Act) leave entitlement calculations.
 * Exported as a shared module used by routes and startup recalculation.
 */

/**
 * Calculate the date by which carry-over annual leave must be taken.
 * Under BCEA, unused leave must be taken within 6 months of the anniversary date
 * on which it was carried over. After that it is forfeited.
 *
 * @param startDate  Employee employment start date ('yyyy-MM-dd')
 * @returns  Expiry date string ('yyyy-MM-dd') — 6 months after the most recent anniversary
 */
export function getCarryOverExpiryDate(startDate: string): string {
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

  // Carry-over expires 6 months after the anniversary
  const expiry = new Date(anniversary);
  expiry.setMonth(expiry.getMonth() + 6);

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
 * Calculate SA BCEA leave entitlements for an employee based on their start date.
 *
 * Annual Leave (s20):  21 days per 12-month leave cycle, pro-rated monthly.
 * Sick Leave (s22):    30 days per 3-year (36-month) cycle, pro-rated monthly.
 *                      This respects the BCEA intent while preventing employees
 *                      from seeing the full 30 days before they have earned it.
 * Family Responsibility (s27): 3 days per cycle, available from month 4.
 */
export function calculateBceaEntitlements(startDate: string): BceaEntitlements {
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date();

  const totalMonths =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth()) +
    (today.getDate() >= start.getDate() ? 0 : -1);

  // ANNUAL LEAVE — BCEA Section 20
  // 21 days per 12-month cycle, pro-rated to months completed in current cycle.
  const currentAnnualCycleMonths = totalMonths % 12;
  const monthsForAnnual = totalMonths > 0 && currentAnnualCycleMonths === 0 ? 12 : currentAnnualCycleMonths;
  const annualLeave = Math.round((monthsForAnnual / 12) * 21 * 10) / 10;
  const annualNote = `${monthsForAnnual} of 12 months completed in current cycle × 21 days = ${annualLeave} days`;

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
    const workingDaysWorked = Math.floor(totalMonths * (52 * 5 / 12));
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
