/**
 * Future leave accrual projection.
 *
 * Mirrors the monthly accrual loop in index.ts exactly, but runs it forward
 * against a target date rather than writing any records.
 * Advisory / display only — no DB writes.
 */

import { storage } from "./storage";
import {
  determineAccrualRate,
  calculateActiveDays,
  calculateAnnualLeaveAccrual,
  completedMonths,
  getCarryOverExpiryDate,
  ACCRUAL_PAUSING_LEAVE_TYPES,
} from "./bcea";

export interface ProjectionBreakdownEntry {
  month: string;             // 'YYYY-MM'
  accrual: number;
  rate: number;
  activeDays: number;
  totalDays: number;
  tierNote: string;
  event?: 'cycle_reset';
  carryOverCreated?: number;
  carryOverExpiry?: string;
}

export interface LeaveProjectionResult {
  currentAvailable: number;
  projectedAvailable: number;
  projectedAccrual: number;
  cycleResetOccurs: boolean;
  carryOverCreated?: number;
  carryOverExpiry?: string;
  monthsProjected: number;
  breakdown: ProjectionBreakdownEntry[];
}

/**
 * Project the Annual Leave balance for a user at a future date.
 *
 * @param userId   Employee ID
 * @param asOfDate Target date 'yyyy-MM-dd' — must be future, max 12 months
 */
export async function projectLeaveBalance(
  userId: string,
  asOfDate: string,
): Promise<LeaveProjectionResult> {
  const user = await storage.getUser(userId);
  if (!user?.startDate) throw new Error("Employee has no start date");

  // ── Load shared data ────────────────────────────────────────────────────────
  const [tiers, graceMonthsSetting, cycleSetting, balances, allRequests, holidays, allLeaveRules] =
    await Promise.all([
      storage.getAllAccrualRateTiers(),
      storage.getSetting('leave_carry_over_grace_months'),
      storage.getSetting('annual_leave_cycle_start'),
      storage.getLeaveBalances(userId),
      storage.getLeaveRequests(userId),
      storage.getAllPublicHolidays(),
      storage.getAllLeaveRules(),
    ]);

  const graceMonths = graceMonthsSetting ? parseInt(graceMonthsSetting.value, 10) || 6 : 6;

  // Cycle end month (1-based). Default: cycle starts Jan 1 → ends Dec.
  const [cycleStartMonth] = cycleSetting
    ? cycleSetting.value.split('-').map(Number)
    : [1];
  const cycleEndMonth = cycleStartMonth === 1 ? 12 : cycleStartMonth - 1;

  const annualBalance = balances.find(b => b.leaveType === 'Annual Leave');
  if (!annualBalance) throw new Error("No Annual Leave balance found for this employee");

  // ── Active annual leave requests ────────────────────────────────────────────
  const activeAnnualRequests = allRequests.filter(
    r => r.leaveType === 'Annual Leave' &&
         !r.isHistoric &&
         !['rejected', 'cancelled'].includes(r.status),
  );

  // ── Working-day counter (mirrors routes.ts countWorkingDays) ────────────────
  const religion = (user as any).religion ?? null;
  const recurringMmDd = new Set<string>();
  const specificYmd = new Set<string>();
  for (const h of holidays) {
    if ((h as any).religionGroup && (h as any).religionGroup !== religion) continue;
    const d = new Date(h.date + 'T00:00:00');
    const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (h.isRecurring) recurringMmDd.add(mmdd); else specificYmd.add(h.date);
  }

  function countWorkDays(startStr: string, endStr: string): number {
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) {
        const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        const mmdd = `${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (!recurringMmDd.has(mmdd) && !specificYmd.has(ymd)) count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  // Pre-compute working days for each active annual leave request
  const requestWorkDays = new Map<number, number>();
  for (const r of activeAnnualRequests) {
    requestWorkDays.set(r.id, countWorkDays(r.startDate, r.endDate));
  }

  // ── Current available (shown in UI before projection) ───────────────────────
  const currentAvailable = annualBalance.total - annualBalance.taken - (annualBalance.pending ?? 0);

  // ── Determine last accrued month ────────────────────────────────────────────
  // The accrual engine runs on the 1st and credits the PRIOR month.
  // So last_accrued_month = the calendar month before today.
  const today = new Date();
  let lastAccruedYear: number;
  let lastAccruedMonth: number; // 1-based
  if (today.getMonth() === 0) {
    lastAccruedYear = today.getFullYear() - 1;
    lastAccruedMonth = 12;
  } else {
    lastAccruedYear = today.getFullYear();
    lastAccruedMonth = today.getMonth(); // JS getMonth() 0-based = 1-based prior month
  }

  // ── Build loop range: (lastAccruedMonth+1) … (month before asOfDate) ───────
  const asOfDateObj = new Date(asOfDate + 'T00:00:00');
  let loopEndYear: number;
  let loopEndMonth: number; // 1-based
  if (asOfDateObj.getMonth() === 0) {
    loopEndYear = asOfDateObj.getFullYear() - 1;
    loopEndMonth = 12;
  } else {
    loopEndYear = asOfDateObj.getFullYear();
    loopEndMonth = asOfDateObj.getMonth(); // 0-based getMonth() = 1-based prior month
  }

  const monthsToProcess: Array<{ year: number; month: number }> = [];
  {
    let cy = lastAccruedYear;
    let cm = lastAccruedMonth + 1;
    if (cm > 12) { cy++; cm = 1; }
    while (cy < loopEndYear || (cy === loopEndYear && cm <= loopEndMonth)) {
      monthsToProcess.push({ year: cy, month: cm });
      cm++;
      if (cm > 12) { cy++; cm = 1; }
    }
  }

  // ── Pausing-leave helper ───────────────────────────────────────────────────
  const customPausingTypes = new Set(
    allLeaveRules.filter((r: any) => r.pausesAnnualAccrual).map((r: any) => r.leaveType as string),
  );
  const pausingTypes = new Set([...ACCRUAL_PAUSING_LEAVE_TYPES, ...customPausingTypes]);

  function getPausingDaysForMonth(year: number, month: number): number {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInM = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInM).padStart(2, '0')}`;
    let total = 0;
    for (const req of allRequests) {
      if (req.status !== 'approved') continue;
      if (!pausingTypes.has(req.leaveType)) continue;
      const from = req.startDate > firstDay ? req.startDate : firstDay;
      const to = req.endDate < lastDay ? req.endDate : lastDay;
      if (from > to) continue;
      const fromDate = new Date(from + 'T00:00:00');
      const toDate = new Date(to + 'T00:00:00');
      total += Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    }
    return total;
  }

  // ── Projection state ───────────────────────────────────────────────────────
  let projectedTotal = annualBalance.total;
  let projectedCarryOver = annualBalance.carryOverDays ?? 0;
  let projectedCarryOverExpiry = (annualBalance as any).carryOverExpiry as string | null ?? null;

  let cycleResetOccurs = false;
  let carryOverCreated: number | undefined;
  let carryOverExpiry: string | undefined;
  let cycleEndDateInWindow: string | null = null;

  const breakdown: ProjectionBreakdownEntry[] = [];

  // ── Main projection loop ───────────────────────────────────────────────────
  for (const { year, month } of monthsToProcess) {
    const daysInM = new Date(year, month, 0).getDate();
    const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInM).padStart(2, '0')}`;
    const lastDayObj = new Date(year, month, 0);

    // 1. Rate for this month
    const monthsCompleted = completedMonths(user.startDate!, lastDayObj);
    const { rate, basis: rateBasis } = determineAccrualRate(
      monthsCompleted,
      (user as any).annualLeaveOverrideDays ?? null,
      tiers,
    );

    // 2. Pausing leave days for pro-rating
    const pausingDays = getPausingDaysForMonth(year, month);

    // 3. Active days
    const { activeDays, totalDays } = calculateActiveDays(
      year, month, user.startDate!, null, pausingDays,
    );

    // 4. Accrual
    const accrual = calculateAnnualLeaveAccrual(rate, activeDays, totalDays);
    projectedTotal += accrual;

    const entry: ProjectionBreakdownEntry = {
      month: `${year}-${String(month).padStart(2, '0')}`,
      accrual,
      rate,
      activeDays,
      totalDays,
      tierNote: rateBasis,
    };

    // 5. Cycle reset simulation
    if (month === cycleEndMonth) {
      cycleEndDateInWindow = lastDayStr;

      // At cycle end, requests with startDate <= cycle_end will have settled.
      // Compute effective consumed and what remains pending after the reset.
      const consumedThroughCycleEnd =
        annualBalance.taken +
        activeAnnualRequests
          .filter(r => r.startDate <= lastDayStr)
          .reduce((sum, r) => sum + (requestWorkDays.get(r.id) ?? 0), 0);

      const daysAfterCycleEnd = activeAnnualRequests
        .filter(r => r.startDate > lastDayStr)
        .reduce((sum, r) => sum + (requestWorkDays.get(r.id) ?? 0), 0);

      const availableAtReset = projectedTotal - consumedThroughCycleEnd - daysAfterCycleEnd;
      const newCarryOver = Math.max(0, availableAtReset);
      const newCarryOverExpiry = getCarryOverExpiryDate(lastDayStr, graceMonths);

      entry.event = 'cycle_reset';
      entry.carryOverCreated = newCarryOver;
      entry.carryOverExpiry = newCarryOverExpiry;

      // Reset state for the new cycle
      projectedTotal = 0;
      projectedCarryOver = newCarryOver;
      projectedCarryOverExpiry = newCarryOverExpiry;

      cycleResetOccurs = true;
      carryOverCreated = newCarryOver;
      carryOverExpiry = newCarryOverExpiry;
    }

    breakdown.push(entry);
  }

  // ── Carry-over valid at asOfDate ────────────────────────────────────────────
  let carryOverAtDate = 0;
  if (projectedCarryOver > 0) {
    if (!projectedCarryOverExpiry || projectedCarryOverExpiry >= asOfDate) {
      carryOverAtDate = projectedCarryOver;
    }
  }

  // ── Final projected available ───────────────────────────────────────────────
  let projectedAvailable: number;

  if (cycleResetOccurs && cycleEndDateInWindow) {
    // After the reset, taken zeroes out. Requests between cycle_end and asOfDate
    // will have settled (their days "consumed" in new cycle); requests from asOfDate
    // onward are still pending.
    const effectiveTakenNewCycle = activeAnnualRequests
      .filter(r => r.startDate > cycleEndDateInWindow! && r.startDate < asOfDate)
      .reduce((sum, r) => sum + (requestWorkDays.get(r.id) ?? 0), 0);

    const effectivePendingAtDate = activeAnnualRequests
      .filter(r => r.startDate >= asOfDate)
      .reduce((sum, r) => sum + (requestWorkDays.get(r.id) ?? 0), 0);

    projectedAvailable =
      projectedTotal + carryOverAtDate - effectiveTakenNewCycle - effectivePendingAtDate;
  } else {
    // No rollover: all active request days reduce available
    const allActiveDays = activeAnnualRequests
      .reduce((sum, r) => sum + (requestWorkDays.get(r.id) ?? 0), 0);

    projectedAvailable =
      projectedTotal + carryOverAtDate - annualBalance.taken - allActiveDays;
  }

  const projectedAccrual = breakdown.reduce((sum, e) => sum + e.accrual, 0);

  return {
    currentAvailable,
    projectedAvailable,
    projectedAccrual,
    cycleResetOccurs,
    carryOverCreated,
    carryOverExpiry,
    monthsProjected: monthsToProcess.length,
    breakdown,
  };
}
