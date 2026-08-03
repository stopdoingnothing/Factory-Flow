import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes, runEscalationReminders, settlePastApprovedLeave } from "./routes";
import { startScheduler } from "./scheduler";
import { applyCustomLeaveRules } from "./custom-leave-rules";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import {
  calculateActiveDays,
  calculateAnnualLeaveAccrual,
  calculateGraduatedSickCredit,
  calculateSickLeaveTransitionBalance,
  sickLeaveFullEntitlement,
  getCarryOverExpiryDate,
  isFrlEligible,
  scheduledWorkingDaysInMonth,
  completedMonths,
  determineAccrualRate,
} from "./bcea";
import {
  accrualPeriodStr,
  countPausingLeaveDays,
  writeAccrualRecord,
  processTerminationSettlement,
} from "./leave-accrual";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const PgSession = connectPgSimple(session);
const sessionPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.use(session({
  store: new PgSession({ pool: sessionPool, tableName: "sessions" }),
  secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.TRUST_PROXY === "true",
    maxAge: 8 * 60 * 60 * 1000, // 8 hours — typical working day
  },
}));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      // Apply custom leave rules on startup
      applyCustomLeaveRules(storage)
        .then(n => { if (n > 0) log(`[startup] Custom leave rules: updated ${n} balance record(s)`); })
        .catch(err => console.error('[startup] Custom leave rule engine failed:', err));
      // Start the daily same-day absent (AWOL) check scheduler
      startScheduler().catch(err => console.error('[scheduler] Failed to start:', err));
      // Schedule escalation reminders every 8 hours
      const EIGHT_HOURS = 8 * 60 * 60 * 1000;
      setInterval(() => {
        runEscalationReminders()
          .then(n => { if (n > 0) log(`[escalation] Sent ${n} reminder(s)`); })
          .catch(err => console.error('[escalation] Failed:', err));
      }, EIGHT_HOURS);
      // Monthly accrual run: checks once daily; fires on the 1st of each month.
      // Credits the PRIOR calendar month per spec §4.
      const ONE_DAY = 24 * 60 * 60 * 1000;
      setInterval(() => {
        const today = new Date();
        if (today.getDate() === 1) {
          log('[monthly-accrual] 1st of month detected — running accrual for prior month');
          runMonthlyAccrualRun()
            .catch(err => console.error('[monthly-accrual] Failed:', err));
        }
      }, ONE_DAY);
    },
  );
})();

/** Returns { year, month } for the prior calendar month from today's 1st-of-month run. */
function priorMonth(): { year: number; month: number } {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 }; // month is 1-based
}

/** Count leave days taken in a month for sick graduated accrual. */
async function countLeaveDaysTakenInMonth(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const allRequests = await storage.getLeaveRequests(userId);
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  let total = 0;
  for (const req of allRequests) {
    if (req.status !== 'approved' && req.status !== 'pending_manager' && req.status !== 'pending_hr' && req.status !== 'pending_md') continue;
    const from = req.startDate > firstDay ? req.startDate : firstDay;
    const to = req.endDate < lastDay ? req.endDate : lastDay;
    if (from > to) continue;
    const fromDate = new Date(from + 'T00:00:00');
    const toDate = new Date(to + 'T00:00:00');
    total += Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  }
  return total;
}

/** Send a notification (thin wrapper). */
async function notify(userId: string, type: string, title: string, message: string) {
  await storage.createNotification({ userId, type, title, message }).catch(() => {});
}

/** Get all HR user IDs for accrual notifications. */
async function getHrUserIds(): Promise<string[]> {
  const allUsers = await storage.getAllUsers();
  return allUsers.filter(u => u.roles?.includes('hr')).map(u => u.id);
}

// ── Main monthly accrual run (spec §4, §14) ───────────────────────────────────

/**
 * Monthly accrual run — triggered on the 1st of each month.
 * Credits leave for the PRIOR calendar month (spec §4).
 *
 * Processing order follows spec §14 steps 1–12.
 */
async function runMonthlyAccrualRun() {
  const { year, month } = priorMonth();
  const period = accrualPeriodStr(year, month);
  const firstDayOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDayOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  log(`[monthly-accrual] Processing period ${period}`);

  // Load shared config
  const allUsers = await storage.getAllUsers();
  const tiers = await storage.getAllAccrualRateTiers();
  const graceMonthsSetting = await storage.getSetting('leave_carry_over_grace_months');
  const graceMonths = graceMonthsSetting ? parseInt(graceMonthsSetting.value, 10) || 6 : 6;

  // Annual leave cycle: system-wide setting (spec §3.1). Default: January 1.
  const cycleSetting = await storage.getSetting('annual_leave_cycle_start');
  // Format: 'MM-DD', e.g. '01-01' for January 1
  const [cycleStartMonth, cycleStartDay] = cycleSetting
    ? cycleSetting.value.split('-').map(Number)
    : [1, 1];

  // Is this month the last month of the annual leave cycle?
  // Cycle ends the month before cycleStartMonth. e.g. cycle start = Jan → last month = Dec.
  const cycleEndMonth = cycleStartMonth === 1 ? 12 : cycleStartMonth - 1;
  const isAnnualCycleEndMonth = month === cycleEndMonth;

  // Custom leave types with pauses_annual_accrual = true
  const allLeaveRules = await storage.getAllLeaveRules();
  const customPausingTypes = new Set(
    allLeaveRules.filter(r => r.pausesAnnualAccrual).map(r => r.leaveType),
  );

  // Step 1: Eligible employees = active at any point during the prior month
  const eligibleWorkers = allUsers.filter(u => {
    if (!u.startDate || u.excludeFromLeave) return false;
    if (u.startDate > lastDayOfMonth) return false; // not yet started
    if (u.terminationDate && u.terminationDate < firstDayOfMonth) return false; // terminated before month
    return true;
  });

  let processed = 0;

  for (const user of eligibleWorkers) {
    try {
      const balances = await storage.getLeaveBalances(user.id);
      const lastDayRef = new Date(year, month, 0); // last day of prior month

      // Step 2: Determine RATE
      const months = completedMonths(user.startDate!, lastDayRef);
      const { rate, basis: rateBasis } = determineAccrualRate(
        months,
        (user as any).annualLeaveOverrideDays ?? null,
        tiers,
      );

      // Step 3: Annual leave accrual ─────────────────────────────────────────
      const pausingDays = await countPausingLeaveDays(user.id, year, month, customPausingTypes);
      const { activeDays, totalDays, notes: activeDayNotes } = calculateActiveDays(
        year,
        month,
        user.startDate!,
        (user as any).terminationDate ?? null,
        pausingDays,
      );
      const annualAccrual = calculateAnnualLeaveAccrual(rate, activeDays, totalDays);

      const isProRated = activeDays < totalDays;
      const eventType = isProRated ? 'pro_rated_accrual' : 'monthly_accrual';
      const basisParts = [...activeDayNotes, rateBasis];
      const calculationBasis = `${rate.toFixed(6)} × (${activeDays}/${totalDays}) = ${annualAccrual.toFixed(6)} — ${basisParts.join('; ')}`;

      const annualBalance = balances.find(b => b.leaveType === 'Annual Leave');
      const annualBefore = annualBalance?.total ?? 0;
      const annualAfter = annualBefore + annualAccrual;

      const didWrite = await writeAccrualRecord(
        user.id, 'Annual Leave', period, eventType,
        annualAccrual, annualBefore, annualAfter,
        calculationBasis,
        { activeDays, totalDays, pausingLeaveDays: pausingDays, rate },
      );

      if (didWrite) {
        if (annualBalance) {
          await storage.updateLeaveBalance(annualBalance.id, { total: annualAfter } as any);
        } else {
          await storage.createLeaveBalance({ userId: user.id, leaveType: 'Annual Leave', total: annualAccrual, taken: 0, pending: 0 });
        }
        if (annualAccrual > 0) {
          await notify(user.id, 'leave_accrual', 'Annual Leave Updated',
            `${annualAccrual.toFixed(2)} days accrued for ${period}. New balance: ${annualAfter.toFixed(2)}.`);
        }
      }

      // Step 4: Sick leave graduated accrual (first 6 months) ─────────────────
      const sickTracking = await storage.getSickLeaveTracking(user.id);

      // Initialise tracking record if missing
      if (!sickTracking) {
        await storage.upsertSickLeaveTracking({
          userId: user.id,
          sickCycleStartDate: user.startDate!,
          graduatedAccrualActive: completedMonths(user.startDate!, new Date()) < 6,
          cumulativeDaysWorked: 0,
          graduatedDaysCredited: 0,
        });
      }

      const tracking = sickTracking ?? {
        userId: user.id,
        sickCycleStartDate: user.startDate!,
        graduatedAccrualActive: true,
        cumulativeDaysWorked: 0,
        graduatedDaysCredited: 0,
      };

      if (tracking.graduatedAccrualActive) {
        const workDays = (user as any).workDaysPerWeek ?? 5;
        const scheduled = scheduledWorkingDaysInMonth(year, month, workDays);
        const leaveTaken = await countLeaveDaysTakenInMonth(user.id, year, month);
        const daysWorked = Math.max(0, scheduled - leaveTaken);
        const { newCredit, newCumulative } = calculateGraduatedSickCredit(
          tracking.cumulativeDaysWorked,
          daysWorked,
          tracking.graduatedDaysCredited,
        );

        await storage.updateSickLeaveTracking(user.id, {
          cumulativeDaysWorked: newCumulative,
          graduatedDaysCredited: tracking.graduatedDaysCredited + newCredit,
        });

        if (newCredit > 0) {
          const sickBalance = balances.find(b => b.leaveType === 'Sick Leave');
          const sickBefore = sickBalance?.total ?? 0;
          const sickAfter = sickBefore + newCredit;
          const sickBasis = `graduated: floor(${newCumulative}/26) - ${tracking.graduatedDaysCredited} = ${newCredit} day(s); ${daysWorked} working days this month`;

          const sickWrote = await writeAccrualRecord(
            user.id, 'Sick Leave', period, 'sick_leave_graduated_credit',
            newCredit, sickBefore, sickAfter, sickBasis,
            { daysWorkedThisMonth: daysWorked, cumulativeDaysWorked: newCumulative },
          );
          if (sickWrote) {
            if (sickBalance) {
              await storage.updateLeaveBalance(sickBalance.id, { total: sickAfter } as any);
            } else {
              await storage.createLeaveBalance({ userId: user.id, leaveType: 'Sick Leave', total: newCredit, taken: 0, pending: 0 });
            }
          }
        }
      }

      // Step 5: Sick leave 6-month transition ──────────────────────────────────
      // Transition occurs on the 1st of the month FOLLOWING the 6-month anniversary.
      // The accrual run fires today (1st), so: today = 1st of current month, prior month was the month just processed.
      // Check: is TODAY the 1st of the month after the 6-month anniversary?
      const today = new Date();
      const sixMonthAnniversary = new Date(user.startDate! + 'T00:00:00');
      sixMonthAnniversary.setMonth(sixMonthAnniversary.getMonth() + 6);
      const transitionMonth = new Date(sixMonthAnniversary.getFullYear(), sixMonthAnniversary.getMonth() + 1, 1);

      if (
        tracking.graduatedAccrualActive &&
        today.getFullYear() === transitionMonth.getFullYear() &&
        today.getMonth() === transitionMonth.getMonth() &&
        today.getDate() === 1
      ) {
        const workDays = (user as any).workDaysPerWeek ?? 5;
        const sickBalance = balances.find(b => b.leaveType === 'Sick Leave');
        const sickTaken = sickBalance?.taken ?? 0;
        const newBalance = calculateSickLeaveTransitionBalance(workDays, sickTaken);
        const transitionBasis = `transition: ${sickLeaveFullEntitlement(workDays)} entitlement - ${sickTaken} taken = ${newBalance}`;

        await writeAccrualRecord(
          user.id, 'Sick Leave', accrualPeriodStr(today.getFullYear(), today.getMonth() + 1),
          'sick_leave_transition', newBalance, sickBalance?.total ?? 0, newBalance, transitionBasis,
        );
        if (sickBalance) {
          await storage.updateLeaveBalance(sickBalance.id, { total: newBalance } as any);
        } else {
          await storage.createLeaveBalance({ userId: user.id, leaveType: 'Sick Leave', total: newBalance, taken: 0, pending: 0 });
        }
        await storage.updateSickLeaveTracking(user.id, { graduatedAccrualActive: false });
        await notify(user.id, 'sick_leave_transition', 'Sick Leave Entitlement Updated',
          `Your sick leave entitlement has been updated to ${newBalance.toFixed(1)} days for the remainder of your 36-month cycle.`);
        const hrIds = await getHrUserIds();
        for (const hrId of hrIds) {
          await notify(hrId, 'sick_leave_transition', `Sick Leave Transition — ${user.firstName} ${user.surname}`,
            `Sick leave transitioned to full entitlement (${newBalance.toFixed(1)} days).`);
        }
      }

      // Step 6: Sick leave 36-month cycle reset ────────────────────────────────
      // Check if the 36-month cycle boundary has passed (can be mid-month).
      if (!tracking.graduatedAccrualActive) {
        const cycleStart = new Date(tracking.sickCycleStartDate + 'T00:00:00');
        const nextCycleStart = new Date(cycleStart);
        nextCycleStart.setMonth(nextCycleStart.getMonth() + 36);

        // Has the next cycle started on or before today?
        if (today >= nextCycleStart) {
          const workDays = (user as any).workDaysPerWeek ?? 5;
          const fullEntitlement = sickLeaveFullEntitlement(workDays);
          const sickBalance = balances.find(b => b.leaveType === 'Sick Leave');
          const resetPeriod = accrualPeriodStr(nextCycleStart.getFullYear(), nextCycleStart.getMonth() + 1);

          await writeAccrualRecord(
            user.id, 'Sick Leave', resetPeriod, 'sick_leave_cycle_reset',
            fullEntitlement, sickBalance?.total ?? 0, fullEntitlement,
            `36-month cycle reset on ${nextCycleStart.toISOString().split('T')[0]}; new entitlement ${fullEntitlement} days`,
          );
          if (sickBalance) {
            await storage.updateLeaveBalance(sickBalance.id, { total: fullEntitlement, taken: 0, pending: 0 } as any);
          } else {
            await storage.createLeaveBalance({ userId: user.id, leaveType: 'Sick Leave', total: fullEntitlement, taken: 0, pending: 0 });
          }
          await storage.updateSickLeaveTracking(user.id, {
            sickCycleStartDate: nextCycleStart.toISOString().split('T')[0],
          });
          await notify(user.id, 'sick_leave_cycle_reset', 'Sick Leave Reset',
            `Your sick leave cycle has reset. New entitlement: ${fullEntitlement} days.`);
          const hrIds = await getHrUserIds();
          for (const hrId of hrIds) {
            await notify(hrId, 'sick_leave_cycle_reset', `Sick Leave Cycle Reset — ${user.firstName} ${user.surname}`,
              `36-month sick leave cycle reset. New entitlement: ${fullEntitlement} days.`);
          }
        }
      }

      // Step 7: Annual leave cycle rollover ────────────────────────────────────
      if (isAnnualCycleEndMonth) {
        const freshAnnualBalance = (await storage.getLeaveBalances(user.id)).find(b => b.leaveType === 'Annual Leave');
        if (freshAnnualBalance) {
          const available = Math.max(0, freshAnnualBalance.total - freshAnnualBalance.taken - freshAnnualBalance.pending);
          const rolloverPeriod = accrualPeriodStr(year, month);

          const wrote = await writeAccrualRecord(
            user.id, 'Annual Leave', rolloverPeriod, 'cycle_reset',
            available, freshAnnualBalance.total, 0,
            `annual cycle rollover: ${available.toFixed(4)} days moved to prior-cycle carry-over; current balance zeroed`,
          );
          if (wrote) {
            const cycleEndDate = lastDayOfMonth;
            const expiryDate = getCarryOverExpiryDate(cycleEndDate, graceMonths);
            // Zero current balance; stamp carry-over
            await storage.updateLeaveBalance(freshAnnualBalance.id, {
              total: 0,
              taken: 0,
              pending: 0,
              carryOverDays: (freshAnnualBalance.carryOverDays ?? 0) + available,
              carryOverExpiry: expiryDate,
            } as any);
          }
        }
      }

      // Step 8: FRL cycle reset ─────────────────────────────────────────────────
      if (isAnnualCycleEndMonth) {
        const workDays = (user as any).workDaysPerWeek ?? 5;
        const eligible = isFrlEligible(user.startDate!, workDays, today);
        const frlBalance = balances.find(b => b.leaveType === 'Family Responsibility');
        const newFrl = eligible ? 3 : 0;
        const frlBefore = frlBalance?.total ?? 0;

        const frlWrote = await writeAccrualRecord(
          user.id, 'Family Responsibility', accrualPeriodStr(year, month), 'frl_cycle_reset',
          newFrl, frlBefore, newFrl,
          eligible ? 'FRL reset to 3 days (eligible)' : 'FRL set to 0 (not eligible — work_days_per_week < 4 or < 4 months service)',
        );
        if (frlWrote) {
          if (frlBalance) {
            await storage.updateLeaveBalance(frlBalance.id, { total: newFrl, taken: 0, pending: 0 } as any);
          } else if (newFrl > 0) {
            await storage.createLeaveBalance({ userId: user.id, leaveType: 'Family Responsibility', total: newFrl, taken: 0, pending: 0 });
          }
          if (eligible) {
            await notify(user.id, 'frl_cycle_reset', 'Family Responsibility Leave Reset',
              'Your Family Responsibility Leave has been reset to 3 days for the new cycle.');
          }
        }
      }

      // Step 9: Custom monthly-accrual leave types ─────────────────────────────
      const monthlyCustomRules = allLeaveRules.filter(
        r => r.accrualType === 'monthly' && !['Annual Leave', 'Sick Leave', 'Family Responsibility'].includes(r.leaveType),
      );
      for (const rule of monthlyCustomRules) {
        if (rule.employeeTypeId != null && rule.employeeTypeId !== user.employeeTypeId) continue;
        const customRate = parseFloat(rule.accrualRate || '0') || parseFloat(rule.daysEarned) || 0;
        const customAccrual = calculateAnnualLeaveAccrual(customRate, activeDays, totalDays);
        const customBalance = balances.find(b => b.leaveType === rule.leaveType);
        const customBefore = customBalance?.total ?? 0;
        const customAfter = customBefore + customAccrual;

        const customWrote = await writeAccrualRecord(
          user.id, rule.leaveType, period, 'monthly_accrual',
          customAccrual, customBefore, customAfter,
          `custom ${rule.leaveType}: rate=${customRate} × (${activeDays}/${totalDays}) = ${customAccrual.toFixed(6)}`,
        );
        if (customWrote) {
          if (customBalance) {
            await storage.updateLeaveBalance(customBalance.id, { total: customAfter } as any);
          } else {
            await storage.createLeaveBalance({ userId: user.id, leaveType: rule.leaveType, total: customAccrual, taken: 0, pending: 0 });
          }
        }
      }

      // Step 11 & 12: Forfeiture warnings and flags ───────────────────────────
      const freshBalances = await storage.getLeaveBalances(user.id);
      const annualBal = freshBalances.find(b => b.leaveType === 'Annual Leave');
      if (annualBal && (annualBal.carryOverDays ?? 0) > 0 && (annualBal as any).carryOverExpiry) {
        const expiry = new Date((annualBal as any).carryOverExpiry + 'T00:00:00');
        const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);

        if (daysUntilExpiry <= 0) {
          // Forfeiture flag — do not zero, flag for HR
          const hrIds = await getHrUserIds();
          for (const hrId of hrIds) {
            await notify(hrId, 'forfeiture_flag',
              `Forfeiture Action Required — ${user.firstName} ${user.surname}`,
              `${user.firstName} ${user.surname} has ${(annualBal.carryOverDays ?? 0).toFixed(1)} days of prior-cycle annual leave past the grace period. Action required.`,
            );
          }
        } else if (daysUntilExpiry <= 30) {
          await notify(user.id, 'forfeiture_warning', 'Annual Leave Forfeiture Warning',
            `You have ${(annualBal.carryOverDays ?? 0).toFixed(1)} days of prior-cycle annual leave that will be subject to forfeiture on ${(annualBal as any).carryOverExpiry}. Please use or discuss with HR.`);
          const hrIds = await getHrUserIds();
          for (const hrId of hrIds) {
            await notify(hrId, 'forfeiture_warning', `Forfeiture Warning (30 days) — ${user.firstName} ${user.surname}`,
              `${user.firstName} ${user.surname} has ${(annualBal.carryOverDays ?? 0).toFixed(1)} days subject to forfeiture on ${(annualBal as any).carryOverExpiry}.`);
          }
        } else if (daysUntilExpiry <= 60) {
          await notify(user.id, 'forfeiture_warning', 'Annual Leave Forfeiture Warning (60 days)',
            `You have ${(annualBal.carryOverDays ?? 0).toFixed(1)} days of prior-cycle annual leave that will be subject to forfeiture on ${(annualBal as any).carryOverExpiry}.`);
          const hrIds = await getHrUserIds();
          for (const hrId of hrIds) {
            await notify(hrId, 'forfeiture_warning', `Forfeiture Warning (60 days) — ${user.firstName} ${user.surname}`,
              `${user.firstName} ${user.surname} has ${(annualBal.carryOverDays ?? 0).toFixed(1)} days subject to forfeiture on ${(annualBal as any).carryOverExpiry}.`);
          }
        }
      }

      // Settle past approved leave requests (pending → taken)
      await settlePastApprovedLeave(user.id);
      processed++;
    } catch (err) {
      console.error(`[monthly-accrual] Failed for user ${user.id}:`, err);
    }
  }
  log(`[monthly-accrual] Processed ${processed} of ${eligibleWorkers.length} employees for ${period}`);
}

// ── Termination settlement (spec §5.8) ────────────────────────────────────────

// processTerminationSettlement is defined in ./leave-accrual.ts and re-exported from there.
