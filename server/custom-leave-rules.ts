/**
 * Custom Leave Rule Execution Engine
 *
 * Applies leave rules defined in the `leave_rules` table to generate/update
 * leave balance totals for active employees.
 *
 * This runs alongside the BCEA engine (bcea.ts) at startup. The BCEA engine
 * handles the three mandated leave types (Annual, Sick, Family Responsibility).
 * This engine handles any additional custom types an organisation configures.
 *
 * See specs/decisions.md DEC-007 for design decisions.
 */

import type { IStorage } from "./storage";
import type { LeaveRule, LeaveRulePhase, User } from "@shared/schema";

// BCEA types are owned by the BCEA engine — skip them here to avoid conflicts.
const BCEA_MANAGED_TYPES = new Set([
  'Annual Leave',
  'Sick Leave',
  'Family Responsibility',
  'Maternity Leave',
  'Parental Leave',
  'Adoption Leave',
  'Commissioning Leave',
]);

/**
 * Calculate the total leave entitlement for a given rule (or phase) and an
 * employee with `totalMonths` months of employment.
 *
 * Accrual types:
 *   per_days_worked  — earn `daysEarned` for every `periodDaysWorked` days worked
 *   monthly          — earn `daysEarned` per month of employment
 *   annual           — earn `daysEarned` per completed year of employment
 *   fixed_per_cycle  — flat `daysEarned` allocation per `cycleMonths` cycle
 */
function calculateEntitlement(
  accrualType: string,
  daysEarned: string,
  periodDaysWorked: number | null | undefined,
  cycleMonths: number | null | undefined,
  totalMonths: number,
  maxAccrual: number | null | undefined,
): number {
  const earned = parseFloat(daysEarned) || 0;
  let total = 0;

  switch (accrualType) {
    case 'per_days_worked': {
      // Approximate working days: 5-day week, 52 weeks / 12 months = 21.67 per month
      const workingDays = Math.floor(totalMonths * (52 * 5 / 12));
      const period = periodDaysWorked && periodDaysWorked > 0 ? periodDaysWorked : 26;
      total = Math.floor(workingDays / period) * earned;
      break;
    }
    case 'monthly':
      total = earned * totalMonths;
      break;
    case 'annual': {
      const completedYears = Math.floor(totalMonths / 12);
      total = earned * completedYears;
      break;
    }
    case 'fixed_per_cycle':
      // Full allocation for the current cycle — no pro-rating within cycle
      total = earned;
      break;
    default:
      total = 0;
  }

  if (maxAccrual != null && maxAccrual > 0) {
    total = Math.min(total, maxAccrual);
  }

  return Math.round(total * 10) / 10;
}

/**
 * Given a leave rule and its phases, determine the entitlement for an employee
 * with the given months of employment.
 *
 * If phases exist, find the most advanced phase the employee has reached and
 * use that phase's accrual settings applied to total months worked.
 * This matches the BCEA sick-leave pattern: the current phase rate applies
 * globally, not just to months spent in that phase.
 *
 * If no phases exist, use the rule's own accrual settings.
 */
function resolveEntitlement(rule: LeaveRule, phases: LeaveRulePhase[], totalMonths: number): number {
  // Check waiting period
  const waitingDays = rule.waitingPeriodDays ?? 0;
  const approxDaysWorked = Math.floor(totalMonths * (52 * 5 / 12));
  if (approxDaysWorked < waitingDays) return 0;

  if (phases.length > 0) {
    // Sort by sequence, find the active phase
    const sorted = [...phases].sort((a, b) => a.sequence - b.sequence);
    let activePhase: LeaveRulePhase | null = null;
    for (const phase of sorted) {
      if (totalMonths >= (phase.startsAfterMonths ?? 0)) {
        activePhase = phase;
      }
    }
    if (activePhase) {
      return calculateEntitlement(
        activePhase.accrualType,
        activePhase.daysEarned,
        activePhase.periodDaysWorked,
        activePhase.cycleMonths ?? rule.cycleMonths,
        totalMonths,
        activePhase.maxBalanceDays ?? rule.maxAccrual,
      );
    }
  }

  return calculateEntitlement(
    rule.accrualType,
    rule.daysEarned,
    rule.periodDaysWorked,
    rule.cycleMonths,
    totalMonths,
    rule.maxAccrual,
  );
}

/**
 * Run the custom leave rule engine for all active employees.
 * Returns the number of balance records created or updated.
 */
export async function applyCustomLeaveRules(storage: IStorage): Promise<number> {
  const rules = await storage.getAllLeaveRules();
  const allPhases = await storage.getAllLeaveRulePhases();
  const allUsers = await storage.getAllUsers();

  const activeUsers = allUsers.filter(u => u.startDate && !u.terminationDate && !u.excludeFromLeave);

  // Index phases by rule id
  const phasesByRule = new Map<number, LeaveRulePhase[]>();
  for (const phase of allPhases) {
    const list = phasesByRule.get(phase.leaveRuleId) ?? [];
    list.push(phase);
    phasesByRule.set(phase.leaveRuleId, list);
  }

  // Filter to custom rules only
  const customRules = rules.filter(r => !BCEA_MANAGED_TYPES.has(r.leaveType));
  if (customRules.length === 0) return 0;

  let updated = 0;

  for (const user of activeUsers) {
    const today = new Date();
    const start = new Date(user.startDate! + 'T00:00:00');
    const totalMonths = Math.max(
      0,
      (today.getFullYear() - start.getFullYear()) * 12 +
      (today.getMonth() - start.getMonth()) +
      (today.getDate() >= start.getDate() ? 0 : -1),
    );

    const balances = await storage.getLeaveBalances(user.id);

    for (const rule of customRules) {
      // Skip rules scoped to a different employee type
      if (rule.employeeTypeId != null && rule.employeeTypeId !== user.employeeTypeId) continue;

      const phases = phasesByRule.get(rule.id) ?? [];
      const newTotal = resolveEntitlement(rule, phases, totalMonths);

      const existing = balances.find(b => b.leaveType === rule.leaveType);
      if (existing) {
        if (Math.abs((existing.total ?? 0) - newTotal) >= 0.05) {
          await storage.updateLeaveBalance(existing.id, { total: newTotal });
          updated++;
        }
      } else {
        await storage.createLeaveBalance({ userId: user.id, leaveType: rule.leaveType, total: newTotal, taken: 0, pending: 0 });
        updated++;
      }
    }
  }

  return updated;
}
