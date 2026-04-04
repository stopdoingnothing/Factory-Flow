/**
 * Leave Accrual Engine — exported functions called from routes.ts and index.ts.
 *
 * Keeping accrual helpers in a separate module prevents the circular dependency
 * that would arise if index.ts and routes.ts imported from each other.
 */

import { storage } from "./storage";
import {
  determineAccrualRate,
  calculateActiveDays,
  calculateAnnualLeaveAccrual,
  calculateGraduatedSickCredit,
  calculateSickLeaveTransitionBalance,
  sickLeaveFullEntitlement,
  getCarryOverExpiryDate,
  isFrlEligible,
  scheduledWorkingDaysInMonth,
  completedMonths,
  ACCRUAL_PAUSING_LEAVE_TYPES,
} from "./bcea";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function accrualPeriodStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export async function countPausingLeaveDays(
  userId: string,
  year: number,
  month: number,
  customPausingTypes: Set<string>,
): Promise<number> {
  const allRequests = await storage.getLeaveRequests(userId);
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const pausingTypes = new Set([...ACCRUAL_PAUSING_LEAVE_TYPES, ...customPausingTypes]);
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

export async function writeAccrualRecord(
  employeeId: string,
  leaveType: string,
  accrualPeriod: string,
  eventType: string,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  calculationBasis: string,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const existing = await storage.getLeaveAccrualRecord(employeeId, leaveType, accrualPeriod, eventType);
  if (existing) return false;
  await storage.createLeaveAccrualRecord({
    employeeId,
    leaveType,
    accrualPeriod,
    eventType,
    amount,
    balanceBefore,
    balanceAfter,
    calculationBasis,
    triggeredBy: 'system',
    metadata: metadata ?? null,
  });
  return true;
}

async function notify(userId: string, type: string, title: string, message: string) {
  await storage.createNotification({ userId, type, title, message }).catch(() => {});
}

async function getHrUserIds(): Promise<string[]> {
  const allUsers = await storage.getAllUsers();
  return allUsers.filter(u => u.roles?.includes('hr')).map(u => u.id);
}

// ── Backdated employee accrual backfill ───────────────────────────────────────

/**
 * When a new employee is added with a startDate in the past, this function
 * credits accrual for every completed month between startDate and today.
 *
 * The current month is excluded — the regular monthly run will handle it on
 * the 1st of next month. All writes are idempotent via writeAccrualRecord.
 */
export async function backfillUserAccrual(userId: string): Promise<{ monthsProcessed: number }> {
  const user = await storage.getUser(userId);
  if (!user?.startDate || (user as any).excludeFromLeave) return { monthsProcessed: 0 };

  const startDay = new Date(user.startDate + 'T00:00:00');
  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Build list of completed months to process in chronological order.
  // We process from the start month up to (but not including) the current month.
  const monthsToProcess: Array<{ year: number; month: number }> = [];
  let cursor = new Date(startDay.getFullYear(), startDay.getMonth(), 1);
  while (cursor < currentMonthStart) {
    monthsToProcess.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  if (monthsToProcess.length === 0) return { monthsProcessed: 0 };

  const tiers = await storage.getAllAccrualRateTiers();
  const allLeaveRules = await storage.getAllLeaveRules();
  const customPausingTypes = new Set(
    allLeaveRules.filter((r: any) => r.pausesAnnualAccrual).map((r: any) => r.leaveType),
  );
  const workDays: number = (user as any).workDaysPerWeek ?? 5;

  // 6-month sick leave transition fires on the 1st of the month FOLLOWING the anniversary.
  const sixMonthAnniversary = new Date(user.startDate + 'T00:00:00');
  sixMonthAnniversary.setMonth(sixMonthAnniversary.getMonth() + 6);
  const sickTransitionMonthStart = new Date(
    sixMonthAnniversary.getFullYear(),
    sixMonthAnniversary.getMonth() + 1,
    1,
  );

  let monthsProcessed = 0;

  for (const { year, month } of monthsToProcess) {
    const period = accrualPeriodStr(year, month);
    const lastDayRef = new Date(year, month, 0); // last calendar day of this month
    const iterMonthStart = new Date(year, month - 1, 1);

    // ── Annual leave ──────────────────────────────────────────────────────────
    const balances = await storage.getLeaveBalances(userId);
    const monthsCompleted = completedMonths(user.startDate!, lastDayRef);
    const { rate, basis: rateBasis } = determineAccrualRate(
      monthsCompleted,
      (user as any).annualLeaveOverrideDays ?? null,
      tiers,
    );
    const pausingDays = await countPausingLeaveDays(userId, year, month, customPausingTypes);
    const { activeDays, totalDays, notes: activeDayNotes } = calculateActiveDays(
      year, month, user.startDate!, (user as any).terminationDate ?? null, pausingDays,
    );
    const annualAccrual = calculateAnnualLeaveAccrual(rate, activeDays, totalDays);
    const eventType = activeDays < totalDays ? 'pro_rated_accrual' : 'monthly_accrual';
    const calculationBasis = `${rate.toFixed(6)} × (${activeDays}/${totalDays}) = ${annualAccrual.toFixed(6)} — ${[...activeDayNotes, rateBasis].join('; ')} [backfill]`;

    const annualBalance = balances.find(b => b.leaveType === 'Annual Leave');
    const annualBefore = annualBalance?.total ?? 0;
    const annualAfter = annualBefore + annualAccrual;

    const didWrite = await writeAccrualRecord(
      userId, 'Annual Leave', period, eventType,
      annualAccrual, annualBefore, annualAfter, calculationBasis,
      { activeDays, totalDays, pausingLeaveDays: pausingDays, rate, backfill: true },
    );
    if (didWrite) {
      if (annualBalance) {
        await storage.updateLeaveBalance(annualBalance.id, { total: annualAfter } as any);
      } else {
        await storage.createLeaveBalance({ userId, leaveType: 'Annual Leave', total: annualAccrual, taken: 0, pending: 0 });
      }
    }

    // ── Sick leave ────────────────────────────────────────────────────────────
    const tracking = await storage.getSickLeaveTracking(userId);
    if (tracking?.graduatedAccrualActive) {
      if (iterMonthStart >= sickTransitionMonthStart) {
        // Transition month (or later): apply the 6-month transition and stop graduated accrual.
        // Use the transition month as the period so audit records are correctly timestamped.
        const transitionPeriod = accrualPeriodStr(
          sickTransitionMonthStart.getFullYear(),
          sickTransitionMonthStart.getMonth() + 1,
        );
        const freshBalances = await storage.getLeaveBalances(userId);
        const sickBalance = freshBalances.find(b => b.leaveType === 'Sick Leave');
        const sickTaken = sickBalance?.taken ?? 0;
        const newBalance = calculateSickLeaveTransitionBalance(workDays, sickTaken);
        const transitionBasis = `6-month transition: ${sickLeaveFullEntitlement(workDays)} entitlement - ${sickTaken} taken = ${newBalance} [backfill]`;

        const transitionWrote = await writeAccrualRecord(
          userId, 'Sick Leave', transitionPeriod, 'sick_leave_transition',
          newBalance, sickBalance?.total ?? 0, newBalance, transitionBasis,
        );
        if (transitionWrote) {
          if (sickBalance) {
            await storage.updateLeaveBalance(sickBalance.id, { total: newBalance } as any);
          } else {
            await storage.createLeaveBalance({ userId, leaveType: 'Sick Leave', total: newBalance, taken: 0, pending: 0 });
          }
        }
        await storage.updateSickLeaveTracking(userId, { graduatedAccrualActive: false });

      } else {
        // Still within the first 6 months — apply graduated accrual (1 per 26 days worked).
        // For backfilled months there are no leave records, so days worked = full scheduled days.
        const scheduled = scheduledWorkingDaysInMonth(year, month, workDays);
        const { newCredit, newCumulative } = calculateGraduatedSickCredit(
          tracking.cumulativeDaysWorked,
          scheduled,
          tracking.graduatedDaysCredited,
        );

        await storage.updateSickLeaveTracking(userId, {
          cumulativeDaysWorked: newCumulative,
          graduatedDaysCredited: tracking.graduatedDaysCredited + newCredit,
        });

        if (newCredit > 0) {
          const freshBalances = await storage.getLeaveBalances(userId);
          const sickBalance = freshBalances.find(b => b.leaveType === 'Sick Leave');
          const sickBefore = sickBalance?.total ?? 0;
          const sickAfter = sickBefore + newCredit;
          const sickBasis = `graduated: floor(${newCumulative}/26) - ${tracking.graduatedDaysCredited} = ${newCredit} day(s); ${scheduled} working days in ${period} [backfill]`;

          const sickWrote = await writeAccrualRecord(
            userId, 'Sick Leave', period, 'sick_leave_graduated_credit',
            newCredit, sickBefore, sickAfter, sickBasis,
            { daysWorkedThisMonth: scheduled, cumulativeDaysWorked: newCumulative, backfill: true },
          );
          if (sickWrote) {
            if (sickBalance) {
              await storage.updateLeaveBalance(sickBalance.id, { total: sickAfter } as any);
            } else {
              await storage.createLeaveBalance({ userId, leaveType: 'Sick Leave', total: newCredit, taken: 0, pending: 0 });
            }
          }
        }
      }
    }

    monthsProcessed++;
  }

  // ── FRL eligibility ────────────────────────────────────────────────────────
  // Grant 3 days if the employee has now reached 4-month eligibility.
  if (isFrlEligible(user.startDate!, workDays, today)) {
    const finalBalances = await storage.getLeaveBalances(userId);
    const frlBalance = finalBalances.find(b => b.leaveType === 'Family Responsibility');
    if (frlBalance && frlBalance.total === 0) {
      await storage.updateLeaveBalance(frlBalance.id, { total: 3 } as any);
    }
  }

  return { monthsProcessed };
}

// ── Termination settlement (spec §5.8) ────────────────────────────────────────

/**
 * Immediately calculates and credits the final pro-rated annual leave accrual
 * for an employee being deactivated mid-month.
 * Called from the user-update route when terminationDate is newly set.
 */
export async function processTerminationSettlement(userId: string, terminationDate: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user?.startDate) return;

  const tiers = await storage.getAllAccrualRateTiers();
  const deactivationDay = new Date(terminationDate + 'T00:00:00');
  const year = deactivationDay.getFullYear();
  const month = deactivationDay.getMonth() + 1;
  const period = accrualPeriodStr(year, month);

  const months = completedMonths(user.startDate, deactivationDay);
  const { rate, basis: rateBasis } = determineAccrualRate(
    months,
    (user as any).annualLeaveOverrideDays ?? null,
    tiers,
  );

  const allLeaveRules = await storage.getAllLeaveRules();
  const customPausingTypes = new Set(
    allLeaveRules.filter((r: any) => r.pausesAnnualAccrual).map((r: any) => r.leaveType),
  );

  const pausingDays = await countPausingLeaveDays(userId, year, month, customPausingTypes);
  const { activeDays, totalDays, notes: activeDayNotes } = calculateActiveDays(
    year, month, user.startDate, terminationDate, pausingDays,
  );
  const accrual = calculateAnnualLeaveAccrual(rate, activeDays, totalDays);
  const calculationBasis = `termination settlement: ${rate.toFixed(6)} × (${activeDays}/${totalDays}) = ${accrual.toFixed(6)} — ${[...activeDayNotes, rateBasis].join('; ')}`;

  const balances = await storage.getLeaveBalances(userId);
  const annualBalance = balances.find(b => b.leaveType === 'Annual Leave');
  const balanceBefore = annualBalance?.total ?? 0;
  const balanceAfter = balanceBefore + accrual;

  const wrote = await writeAccrualRecord(
    userId, 'Annual Leave', period, 'termination_settlement',
    accrual, balanceBefore, balanceAfter, calculationBasis,
    { terminationDate, activeDays, totalDays },
  );
  if (wrote) {
    if (annualBalance) {
      await storage.updateLeaveBalance(annualBalance.id, { total: balanceAfter } as any);
    } else {
      await storage.createLeaveBalance({ userId, leaveType: 'Annual Leave', total: accrual, taken: 0, pending: 0 });
    }
    const hrIds = await getHrUserIds();
    const remaining = balanceAfter - (annualBalance?.taken ?? 0) - (annualBalance?.pending ?? 0);
    for (const hrId of hrIds) {
      await notify(hrId, 'termination_settlement', `Final Accrual Processed — ${user.firstName} ${user.surname}`,
        `Final leave accrual processed for ${user.firstName} ${user.surname}. +${accrual.toFixed(2)} days accrued. Remaining annual leave: ${remaining.toFixed(2)} days.`);
    }
  }
}
