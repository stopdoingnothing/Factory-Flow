/**
 * SA BCEA (Basic Conditions of Employment Act) leave accrual calculations.
 *
 * This module is a pure-logic layer — it receives data and returns numbers.
 * All DB access is done in the accrual engine (index.ts).
 *
 * Spec version: 1.3
 */

import type { AccrualRateTier } from "@shared/schema";

// ── Leave types that pause annual leave accrual (spec §5.6) ──────────────────
export const ACCRUAL_PAUSING_LEAVE_TYPES = new Set([
  'Unpaid Leave',
  'Maternity Leave',
  'Parental Leave',
  'Adoption Leave',
  'Commissioning Leave',
]);

// ── Rate determination (spec §5.1) ───────────────────────────────────────────

/**
 * Determine the monthly accrual RATE for an employee.
 *
 * Priority:
 *   1. If `annualLeaveOverrideDays` is set on the employee: RATE = override / 12.
 *   2. Otherwise: find the highest tier where min_months_of_service <= completedMonths.
 *
 * @param completedMonths  Full calendar months employed as of the last day of the accrual period.
 * @param annualLeaveOverrideDays  Per-employee override (nullable).
 * @param tiers  All accrual rate tiers from the DB, sorted ascending by minMonthsOfService.
 */
export function determineAccrualRate(
  completedMonths: number,
  annualLeaveOverrideDays: number | null | undefined,
  tiers: AccrualRateTier[],
): { rate: number; basis: string } {
  if (annualLeaveOverrideDays != null) {
    const rate = annualLeaveOverrideDays / 12;
    return { rate, basis: `override (${annualLeaveOverrideDays} days/yr ÷ 12 = ${rate.toFixed(6)})` };
  }
  // Sort descending and pick the highest tier the employee qualifies for
  const sorted = [...tiers].sort((a, b) => b.minMonthsOfService - a.minMonthsOfService);
  const tier = sorted.find(t => completedMonths >= t.minMonthsOfService);
  if (!tier) {
    // Fallback: Tier 1 = 15 days/yr if no tiers are seeded yet
    return { rate: 15 / 12, basis: 'Tier 1 fallback (15 days/yr ÷ 12 = 1.25 days/month)' };
  }
  const rate = tier.annualEntitlementDays / 12;
  return {
    rate,
    basis: `Tier ${tier.id} (${tier.annualEntitlementDays} days/yr ÷ 12 = ${rate.toFixed(6)}, min ${tier.minMonthsOfService} months)`,
  };
}

// ── Active days calculation (spec §5.3–5.7) ──────────────────────────────────

/**
 * Calculate the number of calendar days an employee was actively employed
 * and NOT on accrual-pausing leave during a given month.
 *
 * @param year / month  The accrual period (prior month). month is 1-based.
 * @param employmentStartDate  'yyyy-MM-dd'
 * @param deactivationDate  'yyyy-MM-dd' | null
 * @param pausingLeaveDays  Total calendar days of approved accrual-pausing leave
 *                          that fall within this month (queried by the caller).
 */
export function calculateActiveDays(
  year: number,
  month: number,  // 1-based
  employmentStartDate: string,
  deactivationDate: string | null | undefined,
  pausingLeaveDays: number,
): { activeDays: number; totalDays: number; notes: string[] } {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0); // last day of month
  const totalDays = lastDay.getDate();
  const notes: string[] = [];

  const startDate = new Date(employmentStartDate + 'T00:00:00');
  const endDate = deactivationDate ? new Date(deactivationDate + 'T00:00:00') : null;

  // Days employed within this month
  const employedFrom = startDate > firstDay ? startDate : firstDay;
  const employedTo = endDate && endDate < lastDay ? endDate : lastDay;

  // If employment hasn't started yet or ended before this month, 0 days
  if (employedFrom > lastDay || (endDate && endDate < firstDay)) {
    return { activeDays: 0, totalDays, notes: ['not employed during this month'] };
  }

  const daysEmployed = Math.floor((employedTo.getTime() - employedFrom.getTime()) / (86400 * 1000)) + 1;

  if (startDate > firstDay) {
    notes.push(`new starter (start ${employmentStartDate}): ${daysEmployed} of ${totalDays} days employed`);
  }
  if (endDate && endDate < lastDay) {
    notes.push(`termination (${deactivationDate}): ${daysEmployed} of ${totalDays} days employed`);
  }

  const activeDays = Math.max(0, daysEmployed - pausingLeaveDays);
  if (pausingLeaveDays > 0) {
    notes.push(`${pausingLeaveDays} accrual-pausing leave day(s) deducted`);
  }

  return { activeDays, totalDays, notes };
}

// ── Annual leave accrual formula (spec §5.2–5.7) ─────────────────────────────

/**
 * Calculate the annual leave accrual amount for one employee for one month.
 */
export function calculateAnnualLeaveAccrual(
  rate: number,
  activeDays: number,
  totalDays: number,
): number {
  if (activeDays <= 0) return 0;
  if (activeDays >= totalDays) return rate;
  // No rounding — store exact decimal (spec §5.3)
  return rate * (activeDays / totalDays);
}

// ── Sick leave helpers (spec §6) ─────────────────────────────────────────────

/**
 * Calculate sick leave entitlement (full 36-month cycle).
 * Scales by work_days_per_week (spec §6.1).
 */
export function sickLeaveFullEntitlement(workDaysPerWeek: number): number {
  return 30 * (workDaysPerWeek / 5);
}

/**
 * Calculate graduated sick leave credit for a given month (spec §6.2).
 * Returns the number of new sick days to credit this month (may be 0).
 *
 * @param cumulativeDaysWorked  Counter before this month.
 * @param daysWorkedThisMonth   scheduled_working_days - leave_days_taken in this month.
 * @param graduatedDaysCredited  How many sick days have already been credited under the 1-per-26 rule.
 */
export function calculateGraduatedSickCredit(
  cumulativeDaysWorked: number,
  daysWorkedThisMonth: number,
  graduatedDaysCredited: number,
): { newCredit: number; newCumulative: number } {
  const newCumulative = cumulativeDaysWorked + daysWorkedThisMonth;
  const totalEarned = Math.floor(newCumulative / 26);
  const newCredit = Math.max(0, totalEarned - graduatedDaysCredited);
  return { newCredit, newCumulative };
}

/**
 * Calculate the sick leave balance to set at the 6-month transition (spec §6.3).
 * Formula: full_entitlement - sick_leave_days_TAKEN (not accrued).
 */
export function calculateSickLeaveTransitionBalance(
  workDaysPerWeek: number,
  sickLeaveTaken: number,
): number {
  return Math.max(0, sickLeaveFullEntitlement(workDaysPerWeek) - sickLeaveTaken);
}

// ── Carry-over expiry (spec §5.9) ─────────────────────────────────────────────

/**
 * Calculate the date by which prior-cycle annual leave carry-over expires.
 * Under the spec: 6 months after the annual leave cycle ends.
 *
 * @param cycleEndDate  'yyyy-MM-dd' — last day of the annual leave cycle.
 * @param graceMonths   Default 6.
 */
export function getCarryOverExpiryDate(cycleEndDate: string, graceMonths = 6): string {
  const end = new Date(cycleEndDate + 'T00:00:00');
  end.setMonth(end.getMonth() + graceMonths);
  return end.toISOString().split('T')[0];
}

// ── Completed months helper ───────────────────────────────────────────────────

/**
 * Calculate full completed calendar months between start and a reference date.
 * Used for rate tier lookup and FRL eligibility.
 */
export function completedMonths(startDate: string, referenceDate: Date): number {
  const start = new Date(startDate + 'T00:00:00');
  const total =
    (referenceDate.getFullYear() - start.getFullYear()) * 12 +
    (referenceDate.getMonth() - start.getMonth()) +
    (referenceDate.getDate() >= start.getDate() ? 0 : -1);
  return Math.max(0, total);
}

// ── FRL eligibility (spec §7.2) ───────────────────────────────────────────────

export function isFrlEligible(startDate: string, workDaysPerWeek: number, referenceDate: Date): boolean {
  return completedMonths(startDate, referenceDate) >= 4 && workDaysPerWeek >= 4;
}

// ── Scheduled working days in a month (for sick leave graduated accrual) ─────

/**
 * Count the number of scheduled working days in a given month for an employee
 * based on their work_days_per_week.
 *
 * Approximation: assumes 5-day week maps to Mon–Fri.
 * For other schedules we scale the weekday count proportionally.
 */
export function scheduledWorkingDaysInMonth(year: number, month: number, workDaysPerWeek: number): number {
  let weekdays = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) weekdays++;
  }
  // Scale: 5-day worker gets all weekdays; 4-day gets 4/5 of weekdays; etc.
  return Math.round(weekdays * (workDaysPerWeek / 5));
}

// ── Statutory leave entitlements (fixed-duration event leaves) ───────────────
export const STATUTORY_LEAVE_ENTITLEMENTS: Record<string, number> = {
  'Maternity Leave':     87,  // 4 months ≈ 87 working days
  'Parental Leave':      10,
  'Adoption Leave':      50,  // 10 weeks
  'Commissioning Leave': 50,
};
