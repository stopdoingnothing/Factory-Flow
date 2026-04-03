import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes, runEscalationReminders, settlePastApprovedLeave } from "./routes";
import { applyCustomLeaveRules } from "./custom-leave-rules";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { calculateMonthEndAccrual, getCarryOverExpiryDate } from "./bcea";

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
      // Schedule escalation reminders every 8 hours
      const EIGHT_HOURS = 8 * 60 * 60 * 1000;
      setInterval(() => {
        runEscalationReminders()
          .then(n => { if (n > 0) log(`[escalation] Sent ${n} reminder(s)`); })
          .catch(err => console.error('[escalation] Failed:', err));
      }, EIGHT_HOURS);
      // Month-end leave accrual: runs once daily; fires the accrual only on the last day of the month
      const ONE_DAY = 24 * 60 * 60 * 1000;
      setInterval(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (tomorrow.getDate() === 1) {
          log('[month-end-accrual] Last day of month detected — running accrual');
          runMonthEndLeaveAccrual()
            .catch(err => console.error('[month-end-accrual] Failed:', err));
        }
      }, ONE_DAY);
    },
  );
})();

/**
 * Month-end leave accrual — runs on the last calendar day of each month.
 * For every active employee:
 *   1. Add this month's annual leave increment to their balance total.
 *   2. Add any sick leave increment (probationary threshold or month-6 grant).
 *   3. Add the family responsibility grant at month 4.
 *   4. On an annual cycle boundary (month 12, 24, …), record unused annual leave
 *      as carry-over with the configured expiry date.
 *   5. Settle any approved leave requests whose dates have now passed (pending → taken).
 */
async function runMonthEndLeaveAccrual() {
  const allUsers = await storage.getAllUsers();
  const workers = allUsers.filter(u => u.startDate && !u.terminationDate && !u.excludeFromLeave);
  const graceMonthsSetting = await storage.getSetting('leave_carry_over_grace_months');
  const graceMonths = graceMonthsSetting ? parseInt(graceMonthsSetting.value, 10) || 6 : 6;
  let processed = 0;

  for (const user of workers) {
    try {
      const balances = await storage.getLeaveBalances(user.id);
      const sickBalance = balances.find(b => b.leaveType === 'Sick Leave');
      const accrual = calculateMonthEndAccrual(user.startDate!, sickBalance?.total ?? 0);

      // ── Annual leave ─────────────────────────────────────────────────────────
      const annualBalance = balances.find(b => b.leaveType === 'Annual Leave');
      if (annualBalance) {
        const newTotal = Math.round((annualBalance.total + accrual.annualLeave) * 100) / 100;
        const update: Record<string, unknown> = { total: newTotal };

        // Year-end: stamp unused days as carry-over with expiry date
        if (accrual.isAnnualCycleEnd) {
          const available = Math.max(0, Math.round((annualBalance.total - annualBalance.taken - annualBalance.pending) * 10) / 10);
          if (available > 0) {
            update.carryOverDays = available;
            update.carryOverExpiry = getCarryOverExpiryDate(user.startDate!, graceMonths);
          }
        }
        await storage.updateLeaveBalance(annualBalance.id, update as any);
      } else {
        await storage.createLeaveBalance({ userId: user.id, leaveType: 'Annual Leave', total: accrual.annualLeave, taken: 0, pending: 0 });
      }

      // ── Sick leave ───────────────────────────────────────────────────────────
      if (accrual.sickLeave > 0) {
        if (sickBalance) {
          await storage.updateLeaveBalance(sickBalance.id, { total: sickBalance.total + accrual.sickLeave });
        } else {
          await storage.createLeaveBalance({ userId: user.id, leaveType: 'Sick Leave', total: accrual.sickLeave, taken: 0, pending: 0 });
        }
      }

      // ── Family responsibility ────────────────────────────────────────────────
      if (accrual.familyResponsibility > 0) {
        const familyBalance = balances.find(b => b.leaveType === 'Family Responsibility');
        if (familyBalance) {
          await storage.updateLeaveBalance(familyBalance.id, { total: familyBalance.total + accrual.familyResponsibility });
        } else {
          await storage.createLeaveBalance({ userId: user.id, leaveType: 'Family Responsibility', total: accrual.familyResponsibility, taken: 0, pending: 0 });
        }
      }

      // ── Settle past approved leave ───────────────────────────────────────────
      await settlePastApprovedLeave(user.id);
      processed++;
    } catch (err) {
      console.error(`[month-end-accrual] Failed for user ${user.id}:`, err);
    }
  }
  log(`[month-end-accrual] Processed ${processed} of ${workers.length} employees`);
}
