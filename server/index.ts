import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { calculateBceaEntitlements, STATUTORY_LEAVE_ENTITLEMENTS } from "./bcea";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
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
      // Run BCEA leave recalculation in background after startup
      recalculateBceaLeaveBalances().catch(err =>
        console.error('[startup] BCEA recalculation failed:', err)
      );
    },
  );
})();

// Recalculate annual/sick/family leave totals for all active employees (workers and managers) using SA BCEA rules.
// Runs silently in the background on startup so stored balances are always current.
async function recalculateBceaLeaveBalances() {
  const allUsers = await storage.getAllUsers();
  const workers = allUsers.filter(u => u.startDate && !u.terminationDate && !u.excludeFromLeave);
  let updated = 0;
  for (const user of workers) {
    try {
      const ent = calculateBceaEntitlements(user.startDate!);
      const balances = await storage.getLeaveBalances(user.id);
      const upsert = async (leaveType: string, newTotal: number) => {
        const existing = balances.find(b => b.leaveType === leaveType);
        if (existing) {
          if (Math.abs((existing.total ?? 0) - newTotal) >= 0.05) {
            await storage.updateLeaveBalance(existing.id, { total: newTotal });
            updated++;
          }
        } else {
          await storage.createLeaveBalance({ userId: user.id, leaveType, total: newTotal, taken: 0, pending: 0 });
          updated++;
        }
      };
      await upsert('Annual Leave', ent.annualLeave);
      await upsert('Sick Leave', ent.sickLeave);
      await upsert('Family Responsibility', ent.familyResponsibility);

      // Statutory leave types (event-based, not accrual-based).
      // Only create if missing — never overwrite so HR adjustments survive restarts.
      for (const [leaveType, days] of Object.entries(STATUTORY_LEAVE_ENTITLEMENTS)) {
        const existing = balances.find(b => b.leaveType === leaveType);
        if (!existing) {
          await storage.createLeaveBalance({ userId: user.id, leaveType, total: days, taken: 0, pending: 0 });
          updated++;
        }
      }
    } catch (err) {
      console.error(`[startup] BCEA recalc failed for user ${user.id}:`, err);
    }
  }
  if (updated > 0) log(`[startup] BCEA leave recalculation: updated ${updated} balance records for ${workers.length} workers`);
}
