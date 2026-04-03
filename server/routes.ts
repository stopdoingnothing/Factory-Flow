import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";

// Extend express-session with our fields
declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: string;       // legacy — kept for compat
    userRoles: string[];    // source of truth: ['employee','manager','hr','md','admin']
  }
}

// Endpoints that don't require a session.
// Paths are relative to the /api mount point (i.e. without the /api prefix).
//   - auth routes (login, logout, me, reset)
//   - kiosk attendance clock-in/out (workers authenticate per-request via ID/face)
//   - face descriptors (needed before login for face recognition to load models)
const PUBLIC_ROUTES = [
  "/auth/",
  "/attendance",             // kiosk clock-in/out + tile mode reads
  "/users/face-descriptors", // face recognition kiosk — pre-login model load
  "/users/kiosk",            // tile mode — employee list
  "/users/kiosk-lookup",     // attendance kiosk — resolve employee ID/national ID to basic info
  "/users/search",           // manager-approval login — employee name search
  "/departments",            // tile mode — department filter
  "/settings/",             // company name/logo needed on login page and kiosks (PUT is separately guarded by requireAdmin)
];

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_ROUTES.some(p => req.path.startsWith(p))) return next();
  if (req.session?.userId) return next();
  return res.status(401).json({ error: "Unauthorised" });
}

// Requires the session user to hold at least one of the specified roles.
// Admin role implicitly satisfies any requirement — admins can do everything.
function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Unauthorised" });
    const userRoles: string[] = req.session.userRoles || [];
    if (userRoles.includes('admin') || roles.some(r => userRoles.includes(r))) return next();
    return res.status(403).json({ error: "Forbidden" });
  };
}

// HR-or-admin covers the majority of previously admin-guarded routes.
const requireAdmin = requireRole('hr', 'admin');
// Pure system-config routes — admin only.
const requireAdminOnly = requireRole('admin');
import { storage, pool } from "./storage";
import { z } from "zod";
import { insertUserSchema, insertLeaveRequestSchema, insertAttendanceRecordSchema, insertDepartmentSchema, insertUserGroupSchema, insertEmployeeTypeSchema, insertLeaveRuleSchema, insertLeaveRulePhaseSchema, insertGrievanceSchema } from "@shared/schema";
import { sendLeaveRequestNotification, sendLateAttendanceNotification, sendAdminWelcomeEmail, sendLeaveStatusNotification, sendPasswordResetEmail, sendAdminCredentialsEmail, sendManagerMissedClockOutAlert, sendLeaveStageNotification, sendLeaveEscalationReminder, sendAWOLAlert } from "./email";
import { calculateBceaEntitlements, calculateFirstMonthAccrual, getCarryOverExpiryDate } from "./bcea";
import crypto from "crypto";
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Count working days (Mon–Fri) between two date strings (inclusive),
 * excluding public holidays stored in the database.
 * Religion-specific holidays are only excluded when the employee's religion matches.
 * Recurring holidays match on month+day across any year.
 */
async function countWorkingDays(startStr: string, endStr: string, employeeReligion?: string | null): Promise<number> {
  const holidays = await storage.getAllPublicHolidays();
  const recurringMmDd = new Set<string>();
  const specificYmd = new Set<string>();
  for (const h of holidays) {
    // Skip religion-specific holidays unless the employee shares that religion
    if ((h as any).religionGroup && (h as any).religionGroup !== employeeReligion) continue;
    const d = new Date(h.date + 'T00:00:00');
    const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (h.isRecurring) {
      recurringMmDd.add(mmdd);
    } else {
      specificYmd.add(h.date);
    }
  }
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      const mmdd = `${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      if (!recurringMmDd.has(mmdd) && !specificYmd.has(ymd)) {
        count++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith('$2')) {
    return password === hash;
  }
  return bcrypt.compare(password, hash);
}

// Decrement pending balance when a non-historic leave request is cancelled or rejected.
// For historic entries use decrementTaken instead.
async function decrementPending(request: { userId: string; leaveType: string; startDate: string; endDate: string; isHistoric: boolean }, religion: string | null) {
  if (request.isHistoric) return;
  const days = await countWorkingDays(request.startDate, request.endDate, religion);
  const balances = await storage.getLeaveBalances(request.userId);
  const balance = balances.find(b => b.leaveType === request.leaveType);
  if (balance) {
    // Restore carry-over first (reverse of the deduction-first rule on creation).
    const restoredCarryOver = Math.min(days, (balance.pending ?? 0));
    await storage.updateLeaveBalance(balance.id, {
      pending: Math.max(0, (balance.pending ?? 0) - days),
      carryOverDays: (balance.carryOverDays ?? 0) + restoredCarryOver,
    });
  }
}

/**
 * Incrementally settle approved leave requests whose dates have now passed.
 * For each unsettled (settledAt IS NULL) approved non-historic request with endDate < today:
 *   - Move working days from pending → taken on the leave balance
 *   - Stamp settledAt so it is never processed again
 * O(unsettled requests) — after first run the set is empty for most users.
 */
export async function settlePastApprovedLeave(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const allRequests = await storage.getLeaveRequests(userId);
  const unsettled = allRequests.filter(
    r => !r.isHistoric &&
         r.status === 'approved' &&
         r.endDate < today &&
         !(r as any).settledAt
  );
  if (!unsettled.length) return;

  const employee = await storage.getUser(userId);
  const religion = (employee as any)?.religion ?? null;
  const balances = await storage.getLeaveBalances(userId);

  for (const req of unsettled) {
    const days = await countWorkingDays(req.startDate, req.endDate, religion);
    const balance = balances.find(b => b.leaveType === req.leaveType);
    if (balance) {
      await storage.updateLeaveBalance(balance.id, {
        pending: Math.max(0, Math.round((balance.pending - days) * 10) / 10),
        taken:   Math.round((balance.taken + days) * 10) / 10,
      });
      // Update local cache so subsequent iterations in this loop use fresh values
      balance.pending = Math.max(0, Math.round((balance.pending - days) * 10) / 10);
      balance.taken   = Math.round((balance.taken + days) * 10) / 10;
    }
    // Stamp as settled so this request is never processed again
    await pool.query(
      'UPDATE leave_requests SET settled_at = NOW() WHERE id = $1',
      [req.id]
    );
  }
}

async function decrementTaken(request: { userId: string; leaveType: string; startDate: string; endDate: string }, religion: string | null) {
  const days = await countWorkingDays(request.startDate, request.endDate, religion);
  const balances = await storage.getLeaveBalances(request.userId);
  const balance = balances.find(b => b.leaveType === request.leaveType);
  if (balance) {
    await storage.updateLeaveBalance(balance.id, {
      taken: Math.max(0, (balance.taken ?? 0) - days),
    });
  }
}

/**
 * Send escalation reminder emails for leave requests that have been pending
 * approval for more than 3 days. Called automatically every 8 hours by the
 * scheduler in index.ts and also available via POST /api/leave-requests/send-escalation-reminders.
 *
 * Returns the number of emails sent.
 */
export async function runEscalationReminders(): Promise<number> {
  const senderSetting = await storage.getSetting('sender_email');
  const senderEmail = senderSetting?.value || 'noreply@aece.co.za';
  const allRequests = await storage.getLeaveRequests();
  const now = new Date();
  let sent = 0;

  for (const request of allRequests) {
    if (!['pending_manager', 'pending_hr', 'pending_md'].includes(request.status)) continue;

    const submittedAt = new Date((request as any).createdAt || request.startDate);
    const daysPending = Math.floor((now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysPending < 3) continue;

    const employee = await storage.getUser(request.userId);
    const emailData = {
      employeeName: employee ? `${employee.firstName} ${employee.surname}` : request.userId,
      leaveType: request.leaveType,
      startDate: request.startDate,
      endDate: request.endDate,
      daysPending,
      requestId: request.id,
    };

    if (request.status === 'pending_manager') {
      const managerIds = [employee?.managerId, employee?.secondManagerId].filter(Boolean) as string[];
      for (const mgId of managerIds) {
        const manager = await storage.getUser(mgId);
        if (manager?.email) {
          await sendLeaveEscalationReminder(manager.email, senderEmail, {
            managerName: `${manager.firstName} ${manager.surname}`,
            ...emailData,
          });
          sent++;
        }
      }
    } else if (request.status === 'pending_hr') {
      const adminSetting = await storage.getSetting('admin_email');
      const hrEmails = adminSetting?.value?.split('\n').map((e: string) => e.trim()).filter(Boolean) || [];
      for (const hrEmail of hrEmails) {
        await sendLeaveEscalationReminder(hrEmail, senderEmail, {
          managerName: 'HR',
          ...emailData,
        });
        sent++;
      }
    } else if (request.status === 'pending_md') {
      const adminSetting = await storage.getSetting('admin_email');
      const mdEmails = adminSetting?.value?.split('\n').map((e: string) => e.trim()).filter(Boolean) || [];
      for (const mdEmail of mdEmails) {
        await sendLeaveEscalationReminder(mdEmail, senderEmail, {
          managerName: 'Management',
          ...emailData,
        });
        sent++;
      }
    }
  }

  return sent;
}

/**
 * Walk up the org chart from a user and return the email addresses of all
 * upstream managers (direct manager → their manager → … → top).
 *
 * Traversal strategy:
 *  1. Use position-tree hierarchy via orgPositions.parentPositionId.
 *  2. For each ancestor position, collect emails of all users who hold it.
 *  3. Fall back to legacy managerId chain for users not on the position tree.
 *
 * The result is de-duplicated but does NOT include the starting employee.
 */
async function getHierarchyEmails(userId: string): Promise<string[]> {
  const [allUsers, allPositions] = await Promise.all([
    storage.getAllUsers(),
    storage.getAllOrgPositions(),
  ]);

  const positionMap = new Map(allPositions.map(p => [p.id, p]));

  // Map each position → users who hold it
  const usersByPosition = new Map<number, typeof allUsers>();
  for (const u of allUsers) {
    if (u.orgPositionId != null) {
      const arr = usersByPosition.get(u.orgPositionId) ?? [];
      arr.push(u);
      usersByPosition.set(u.orgPositionId, arr);
    }
  }

  const userMap = new Map(allUsers.map(u => [u.id, u]));
  const startUser = userMap.get(userId);
  if (!startUser) return [];

  const emails: string[] = [];
  const visitedUserIds = new Set<string>([userId]); // exclude self

  // Determine starting ancestor position id
  // If reportsToPositionId is set, use that directly; otherwise use parent of own position
  let currentPositionId: number | null | undefined =
    startUser.reportsToPositionId ??
    (startUser.orgPositionId != null
      ? positionMap.get(startUser.orgPositionId)?.parentPositionId
      : null);

  while (currentPositionId != null) {
    const position = positionMap.get(currentPositionId);
    if (!position) break;

    const holders = usersByPosition.get(currentPositionId) ?? [];
    for (const holder of holders) {
      if (!visitedUserIds.has(holder.id) && holder.email) {
        visitedUserIds.add(holder.id);
        emails.push(holder.email);
      }
    }

    // Continue up to the next ancestor
    currentPositionId = position.parentPositionId;
  }

  // Fallback: walk legacy managerId chain for any remaining un-covered managers
  let legacyManagerId: string | null | undefined = startUser.managerId;
  while (legacyManagerId) {
    if (visitedUserIds.has(legacyManagerId)) break;
    const mgr = userMap.get(legacyManagerId);
    if (!mgr) break;
    visitedUserIds.add(mgr.id);
    if (mgr.email) emails.push(mgr.email);
    legacyManagerId = mgr.managerId;
  }

  return emails;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── One-time startup migration: populate roles[] from legacy role/adminRole ──
  try {
    // Add column if not yet present (idempotent)
    await pool.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT ARRAY['employee']::text[]`
    );
    // Populate based on legacy fields for any user still on the default
    await pool.query(`
      UPDATE users SET roles =
        CASE
          WHEN admin_role IS NOT NULL THEN ARRAY['employee','manager','admin']::text[]
          WHEN role = 'manager'       THEN ARRAY['employee','manager']::text[]
          ELSE                             ARRAY['employee']::text[]
        END
      WHERE roles = ARRAY['employee']::text[]
    `);
    console.log('[migration] roles column migration complete');
  } catch (e) {
    console.warn('[migration] roles column migration failed:', (e as Error).message);
  }

  // Apply session enforcement to all /api routes
  app.use("/api", requireAuth);

  // ========== AUTH ROUTES ==========

  // Returns the currently authenticated user, or 401 if no session.
  // Used by the client on page load to verify the session is still valid.
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Not authenticated" });
    }
    return res.json(user);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });
  
  // Worker login by ID (company ID or national ID) + password — application mode only.
  // Kiosk attendance recording does NOT use this route; it posts directly to /api/attendance.
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { id, password } = req.body;

      if (!id || !password) {
        return res.status(400).json({ error: "ID and password are required" });
      }

      // Try to find user by company ID or national ID
      const user = await storage.getUserByIdOrNationalId(id);

      // Use a generic message to prevent user enumeration
      if (!user) {
        return res.status(401).json({ error: "Invalid ID or password" });
      }

      if (!user.password) {
        return res.status(401).json({ error: "No password set for this account. Please contact your administrator." });
      }

      const passwordValid = await verifyPassword(password, user.password);
      if (!passwordValid) {
        return res.status(401).json({ error: "Invalid ID or password" });
      }

      // Upgrade plain-text password to bcrypt hash on first successful login
      if (!user.password.startsWith('$2')) {
        const hashed = await hashPassword(password);
        await storage.updateUser(user.id, { password: hashed });
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.userRoles = user.roles || ['employee'];
      req.session.save(err => {
        if (err) { console.error("Session save failed (worker login):", err); return res.status(500).json({ error: "Session save failed" }); }
        return res.json(user);
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // Face-based login (for both workers and admins with registered faces)
  app.post("/api/auth/login-by-face", async (req, res) => {
    try {
      const { id } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: "ID is required" });
      }

      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Check for face descriptors in both the user record and face_descriptors table
      const additionalDescriptors = await storage.getFaceDescriptors(id);
      
      if (!user.faceDescriptor && additionalDescriptors.length === 0) {
        return res.status(401).json({ error: "No face registered for this user" });
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.userRoles = user.roles || ['employee'];
      req.session.save(err => {
        if (err) return res.status(500).json({ error: "Session save failed" });
        return res.json(user);
      });
    } catch (error) {
      console.error("Face login error:", error);
      return res.status(500).json({ error: "Face login failed" });
    }
  });

  // Admin login by email/password
  app.post("/api/auth/admin-login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      
      // Allow users with adminRole, or line managers (role === 'manager' without adminRole)
      if (!user || (!user.adminRole && user.role !== 'manager')) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const passwordValid = await verifyPassword(password, user.password || '');
      if (!passwordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (user.password && !user.password.startsWith('$2')) {
        const hashed = await hashPassword(password);
        await storage.updateUser(user.id, { password: hashed });
      }

      req.session.userId = user.id;
      req.session.userRole = user.adminRole || user.role;
      req.session.userRoles = user.roles || ['employee'];
      req.session.save(err => {
        if (err) { console.error("Session save failed (admin login):", err); return res.status(500).json({ error: "Session save failed" }); }
        return res.json(user);
      });
    } catch (error) {
      console.error("Admin login error:", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // Manager-approved login: a manager authenticates with their own credentials to log in a worker
  app.post("/api/auth/manager-approved-login", async (req, res) => {
    try {
      const { employeeId, managerEmail, managerPassword } = req.body;

      if (!employeeId || !managerEmail || !managerPassword) {
        return res.status(400).json({ error: "employeeId, managerEmail, and managerPassword are required" });
      }

      const employee = await storage.getUser(employeeId);
      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      if (employee.role === 'manager' || employee.adminRole) {
        return res.status(403).json({ error: "This employee cannot use manager approval login" });
      }

      if (employee.terminationDate) {
        return res.status(403).json({ error: "This employee account is inactive" });
      }

      const manager = await storage.getUserByEmail(managerEmail);
      if (!manager || !manager.adminRole || !['manager', 'maintainer'].includes(manager.adminRole)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const passwordValid = await verifyPassword(managerPassword, manager.password || '');
      if (!passwordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (manager.password && !manager.password.startsWith('$2')) {
        const hashed = await hashPassword(managerPassword);
        await storage.updateUser(manager.id, { password: hashed });
      }

      req.session.userId = employee.id;
      req.session.userRole = employee.role;

      await storage.createAuditLog({
        actorId: manager.id,
        action: 'manager_approved_login',
        entityType: 'user',
        entityId: employee.id,
        changes: { managerId: manager.id, managerEmail: manager.email },
        description: `Manager ${manager.firstName} ${manager.surname} approved kiosk login for ${employee.firstName} ${employee.surname}`,
      }).catch(e => console.error('[audit] manager_approved_login log failed:', e));

      req.session.save(err => {
        if (err) { console.error("Session save failed (manager approved login):", err); return res.status(500).json({ error: "Session save failed" }); }
        return res.json(employee);
      });
    } catch (error) {
      console.error("Manager approved login error:", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // Request password reset
  app.post("/api/auth/request-reset", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      
      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ message: "If an account exists with that email, a reset link has been sent." });
      }

      // Generate reset token
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry
      
      await storage.createPasswordResetToken(token, email, expiry);

      // Send reset email
      const senderEmail = "noreply@aece.co.za";
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'http://localhost:5000';
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      await sendPasswordResetEmail(email, senderEmail, {
        firstName: user.firstName || 'User',
        resetToken: token,
        resetUrl,
      });

      return res.json({ message: "If an account exists with that email, a reset link has been sent." });
    } catch (error) {
      console.error("Password reset request error:", error);
      return res.status(500).json({ error: "Failed to process reset request" });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: "Token and new password are required" });
      }

      const tokenData = await storage.getPasswordResetToken(token);
      
      if (!tokenData) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      if (new Date() > tokenData.expiry) {
        await storage.deletePasswordResetToken(token);
        return res.status(400).json({ error: "Reset token has expired" });
      }

      const user = await storage.getUserByEmail(tokenData.email);
      
      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }

      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashedPassword });
      
      await storage.deletePasswordResetToken(token);

      return res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Password reset error:", error);
      return res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // ========== USER MANAGEMENT ROUTES ==========
  
  // Generate random passwords for users without passwords (admin only)
  app.post("/api/users/generate-passwords", requireAdmin, async (req, res) => {
    try {
      
      const users = await storage.getAllUsers();
      const usersWithoutPasswords = users.filter(u => !u.password);
      
      // Generate a cryptographically secure random password
      const generateSecurePassword = (): string => {
        const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const lowercase = 'abcdefghjkmnpqrstuvwxyz';
        const numbers = '23456789';
        const allChars = uppercase + lowercase + numbers;
        
        // Use crypto for secure random selection
        const secureRandomInt = (max: number): number => {
          return crypto.randomInt(0, max);
        };
        
        // Ensure at least one of each type
        const chars: string[] = [];
        chars.push(uppercase[secureRandomInt(uppercase.length)]);
        chars.push(lowercase[secureRandomInt(lowercase.length)]);
        chars.push(numbers[secureRandomInt(numbers.length)]);
        
        // Fill remaining 7 characters randomly
        for (let i = 0; i < 7; i++) {
          chars.push(allChars[secureRandomInt(allChars.length)]);
        }
        
        // Cryptographically secure shuffle using Fisher-Yates
        for (let i = chars.length - 1; i > 0; i--) {
          const j = secureRandomInt(i + 1);
          [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        
        return chars.join('');
      };
      
      const results = [];
      for (const user of usersWithoutPasswords) {
        const randomPassword = generateSecurePassword();
        const hashedPassword = await hashPassword(randomPassword);
        await storage.updateUser(user.id, { password: hashedPassword });
        results.push({ id: user.id, name: `${user.firstName} ${user.surname}` });
      }
      
      return res.json({ 
        message: `Generated passwords for ${results.length} users`,
        updatedUsers: results
      });
    } catch (error) {
      console.error("Generate passwords error:", error);
      return res.status(500).json({ error: "Failed to generate passwords" });
    }
  });

  // Get all users — admins (manager/maintainer) see everyone; workers see only themselves and direct reports
  app.get("/api/users", async (req, res) => {
    try {
      const sessionUserId = req.session.userId!;
      const sessionRole = req.session.userRole ?? '';
      const allUsers = await storage.getAllUsers();

      if (['manager', 'maintainer'].includes(sessionRole)) {
        return res.json(allUsers);
      }

      // Workers: only see themselves and their direct reports
      const filteredUsers = allUsers.filter(u =>
        u.id === sessionUserId ||
        u.managerId === sessionUserId
      );
      return res.json(filteredUsers);
    } catch (error) {
      console.error("Get users error:", error);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Public endpoint for tile mode kiosk — returns active workers/managers without requiring a session
  app.get("/api/users/kiosk", async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const kioskUsers = allUsers.filter(u =>
        !u.terminationDate && !u.exclude && u.attendanceRequired !== false &&
        (u.role === 'worker' || u.role === 'manager')
      );
      return res.json(kioskUsers);
    } catch (error) {
      console.error("Kiosk users error:", error);
      return res.status(500).json({ error: "Failed to fetch kiosk users" });
    }
  });

  // Employee name search for manager-approved login kiosk flow (public — user not yet logged in)
  app.get("/api/users/search", async (req, res) => {
    try {
      const q = (req.query.q as string || '').trim();
      if (q.length < 2) return res.json([]);

      const allUsers = await storage.getAllUsers();
      const lower = q.toLowerCase();
      const results = allUsers
        .filter(u =>
          !u.terminationDate &&
          !u.exclude &&
          !u.adminRole && // managers with admin credentials use their own login path
          (`${u.firstName} ${u.surname}`.toLowerCase().includes(lower) ||
           u.firstName.toLowerCase().includes(lower) ||
           u.surname.toLowerCase().includes(lower))
        )
        .slice(0, 10)
        .map(u => ({
          id: u.id,
          firstName: u.firstName,
          surname: u.surname,
          department: u.department,
          role: u.role,
          photoUrl: u.photoUrl,
        }));

      return res.json(results);
    } catch (error) {
      console.error("User search error:", error);
      return res.status(500).json({ error: "Search failed" });
    }
  });

  // Attendance kiosk — look up an employee by company ID or national ID (public, returns safe fields only)
  app.get("/api/users/kiosk-lookup/:id", async (req, res) => {
    try {
      const user = await storage.getUserByIdOrNationalId(req.params.id);
      if (!user) return res.status(404).json({ error: "Employee not found" });
      if (user.terminationDate) return res.status(403).json({ error: "Employee account is inactive" });
      return res.json({
        id: user.id,
        firstName: user.firstName,
        surname: user.surname,
        department: user.department,
      });
    } catch (error) {
      console.error("Kiosk lookup error:", error);
      return res.status(500).json({ error: "Lookup failed" });
    }
  });

  // Get all users with face descriptors (for face recognition matching)
  app.get("/api/users/face-descriptors", async (req, res) => {
    try {
      const includeAdmins = req.query.includeAdmins === 'true';
      const users = await storage.getAllUsers();
      const allFaceDescriptors = await storage.getAllFaceDescriptorsForMatching();
      
      // Build a map of userId to their additional descriptors
      const additionalDescriptorsMap = new Map<string, string[]>();
      for (const fd of allFaceDescriptors) {
        if (!additionalDescriptorsMap.has(fd.userId)) {
          additionalDescriptorsMap.set(fd.userId, []);
        }
        additionalDescriptorsMap.get(fd.userId)!.push(fd.descriptor);
      }
      
      // Filter users who have at least one face descriptor (in user record or face_descriptors table)
      const usersWithFaces = users
        .filter(u => (u.faceDescriptor || additionalDescriptorsMap.has(u.id)) && !u.terminationDate && !u.exclude && (u.role === 'worker' ? u.attendanceRequired !== false : true) && (u.role === 'worker' || (includeAdmins && u.role === 'manager')))
        .flatMap(u => {
          const results = [];
          // Include the main face descriptor
          if (u.faceDescriptor) {
            results.push({
              id: u.id,
              firstName: u.firstName,
              surname: u.surname,
              email: u.email,
              role: u.role,
              faceDescriptor: u.faceDescriptor,
            });
          }
          // Include additional descriptors from face_descriptors table
          const additionalDescs = additionalDescriptorsMap.get(u.id) || [];
          for (const desc of additionalDescs) {
            results.push({
              id: u.id,
              firstName: u.firstName,
              surname: u.surname,
              email: u.email,
              role: u.role,
              faceDescriptor: desc,
            });
          }
          return results;
        });
      return res.json(usersWithFaces);
    } catch (error) {
      console.error("Get face descriptors error:", error);
      return res.status(500).json({ error: "Failed to fetch face descriptors" });
    }
  });

  // Get user by ID
  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json(user);
    } catch (error) {
      console.error("Get user error:", error);
      return res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Create new user
  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      const plaintextPassword = validatedData.password;
      if (validatedData.password) {
        validatedData.password = await hashPassword(validatedData.password);
      }
      
      const newUser = await storage.createUser(validatedData);

      // Auto-provision mandatory BCEA leave balances if the employee has a start date
      if (newUser.startDate && newUser.excludeFromLeave !== true) {
        try {
          const ent = calculateFirstMonthAccrual(newUser.startDate);
          await storage.createLeaveBalance({ userId: newUser.id, leaveType: 'Annual Leave',          total: ent.annualLeave,          taken: 0, pending: 0 });
          await storage.createLeaveBalance({ userId: newUser.id, leaveType: 'Sick Leave',             total: ent.sickLeave,            taken: 0, pending: 0 });
          await storage.createLeaveBalance({ userId: newUser.id, leaveType: 'Family Responsibility',  total: ent.familyResponsibility,  taken: 0, pending: 0 });
        } catch (leaveErr) {
          console.error('Failed to provision leave balances for new user:', leaveErr);
        }
      }

      if (validatedData.role === 'manager' && validatedData.email && plaintextPassword) {
        try {
          await sendAdminWelcomeEmail(
            validatedData.email,
            'noreply@aece.co.za',
            {
              firstName: validatedData.firstName,
              surname: validatedData.surname,
              email: validatedData.email,
              password: plaintextPassword,
            }
          );
        } catch (emailError) {
          console.error('Failed to send welcome email:', emailError);
        }
      }
      
      return res.status(201).json(newUser);
    } catch (error: any) {
      console.error("Create user error:", error);
      const message = error?.message || "Invalid user data";
      return res.status(400).json({ error: message });
    }
  });

  // Update user
  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const { id, createdAt, ...updateData } = req.body;

      // Fetch before-state for audit diff on sensitive fields
      const AUDITED_FIELDS = ['role', 'adminRole', 'hasFullAdminAccess', 'terminationDate', 'startDate', 'email', 'department'] as const;
      const before = await storage.getUser(req.params.id);

      if (updateData.password && !updateData.password.startsWith('$2')) {
        updateData.password = await hashPassword(updateData.password);
      }

      const updatedUser = await storage.updateUser(req.params.id, updateData);

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Build change diff for audited fields only
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      for (const field of AUDITED_FIELDS) {
        if (field in updateData && before && String(before[field]) !== String(updateData[field])) {
          changes[field] = { before: before[field], after: updateData[field] };
        }
      }
      if (Object.keys(changes).length > 0) {
        await storage.createAuditLog({
          actorId: req.session.userId ?? null,
          action: 'update_user_profile',
          entityType: 'user',
          entityId: req.params.id,
          changes,
          description: `Updated ${Object.keys(changes).join(', ')} for user ${req.params.id}`,
        }).catch(e => console.error('[audit] log failed:', e));
      }

      return res.json(updatedUser);
    } catch (error) {
      console.error("Update user error:", error);
      return res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Change user ID (rename — migrates all linked records atomically)
  app.post("/api/users/:id/change-id", requireAdmin, async (req, res) => {
    try {
      const oldId = req.params.id;
      const { newId } = req.body;

      if (!newId || typeof newId !== 'string' || !newId.trim()) {
        return res.status(400).json({ error: "newId is required" });
      }
      const trimmedNewId = newId.trim();
      if (trimmedNewId === oldId) {
        return res.status(400).json({ error: "New ID is the same as the current ID" });
      }

      // Check new ID is not already in use
      const existing = await storage.getUser(trimmedNewId);
      if (existing) {
        return res.status(409).json({ error: `Employee ID "${trimmedNewId}" is already in use` });
      }

      const updatedUser = await storage.changeUserId(oldId, trimmedNewId);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.json(updatedUser);
    } catch (error) {
      console.error("Change user ID error:", error);
      return res.status(500).json({ error: "Failed to change employee ID" });
    }
  });

  // Delete user
  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      return res.status(204).send();
    } catch (error) {
      console.error("Delete user error:", error);
      return res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ========== LEAVE BALANCE ROUTES ==========
  
  // Get all leave balances (admin)
  app.get("/api/leave-balances", requireAdmin, async (req, res) => {
    try {
      const balances = await storage.getAllLeaveBalances();
      return res.json(balances);
    } catch (error) {
      console.error("Get all balances error:", error);
      return res.status(500).json({ error: "Failed to fetch leave balances" });
    }
  });

  // Get leave balances for a user
  app.get("/api/leave-balances/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await storage.getUser(userId);

      // Forfeit any expired annual leave carry-over (grace window check only — accrual is handled by the month-end cron)
      if (user && user.startDate && !user.terminationDate && !user.excludeFromLeave) {
        const existingBalances = await storage.getLeaveBalances(userId);
        const annualBalance = existingBalances.find(b => b.leaveType === 'Annual Leave');
        if (annualBalance) {
          const currentCarryOver = annualBalance.carryOverDays || 0;
          const carryOverExpiry = (annualBalance as any).carryOverExpiry as string | null;
          const todayStr = new Date().toISOString().split('T')[0];
          if (currentCarryOver > 0 && carryOverExpiry && todayStr > carryOverExpiry) {
            const safeTaken = annualBalance.taken + annualBalance.pending;
            const safeTotal = Math.max(annualBalance.total - currentCarryOver, safeTaken);
            await storage.updateLeaveBalance(annualBalance.id, { total: safeTotal, carryOverDays: 0, carryOverExpiry: null } as any);
          }
        }
      }

      // Settle past approved leave: move pending → taken for any approved request whose dates have passed
      await settlePastApprovedLeave(userId);

      const balances = await storage.getLeaveBalances(userId);
      return res.json(balances);
    } catch (error) {
      console.error("Get balances error:", error);
      return res.status(500).json({ error: "Failed to fetch leave balances" });
    }
  });

  // Create leave balance
  app.post("/api/leave-balances", requireAdmin, async (req, res) => {
    try {
      const { userId, leaveType, total, taken = 0, pending = 0 } = req.body;
      
      if (!userId || !leaveType || total === undefined) {
        return res.status(400).json({ error: "userId, leaveType, and total are required" });
      }

      const newBalance = await storage.createLeaveBalance({
        userId,
        leaveType,
        total,
        taken,
        pending,
      });
      
      return res.status(201).json(newBalance);
    } catch (error) {
      console.error("Create balance error:", error);
      return res.status(500).json({ error: "Failed to create leave balance" });
    }
  });

  // Update leave balance
  app.patch("/api/leave-balances/:id", requireAdmin, async (req, res) => {
    try {
      const balanceId = parseInt(req.params.id);
      const { total, taken, pending } = req.body;

      const before = await storage.getLeaveBalance(balanceId);
      const updatedBalance = await storage.updateLeaveBalance(balanceId, { total, taken, pending });

      if (!updatedBalance) {
        return res.status(404).json({ error: "Leave balance not found" });
      }

      await storage.createAuditLog({
        actorId: req.session.userId ?? null,
        action: 'update_leave_balance',
        entityType: 'leave_balance',
        entityId: String(balanceId),
        changes: {
          total:   { before: before?.total,   after: updatedBalance.total },
          taken:   { before: before?.taken,   after: updatedBalance.taken },
          pending: { before: before?.pending, after: updatedBalance.pending },
        },
        description: `Adjusted ${updatedBalance.leaveType} balance for user ${updatedBalance.userId}`,
      }).catch(e => console.error('[audit] log failed:', e));

      return res.json(updatedBalance);
    } catch (error) {
      console.error("Update balance error:", error);
      return res.status(500).json({ error: "Failed to update leave balance" });
    }
  });

  // Bulk import leave balances from CSV data
  app.post("/api/leave-balances/bulk-import", requireAdmin, async (req, res) => {
    try {
      const { records } = req.body;
      
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: "No records to import" });
      }

      const results = {
        imported: 0,
        updated: 0,
        errors: [] as string[],
      };

      for (const record of records) {
        try {
          const { employeeId, leaveType, total, taken, pending } = record;
          
          if (!employeeId || !leaveType) {
            results.errors.push(`Missing employeeId or leaveType for record`);
            continue;
          }

          // Find user by employee ID
          const user = await storage.getUser(employeeId);
          if (!user) {
            results.errors.push(`Employee not found: ${employeeId}`);
            continue;
          }

          // Check if balance already exists for this user and leave type
          const existingBalances = await storage.getLeaveBalances(user.id);
          const existingBalance = existingBalances.find(b => b.leaveType === leaveType);

          if (existingBalance) {
            // Update existing balance
            await storage.updateLeaveBalance(existingBalance.id, {
              total: parseFloat(total) || 0,
              taken: parseFloat(taken) || 0,
              pending: parseFloat(pending) || 0,
            });
            results.updated++;
          } else {
            // Create new balance
            await storage.createLeaveBalance({
              userId: user.id,
              leaveType,
              total: parseFloat(total) || 0,
              taken: parseFloat(taken) || 0,
              pending: parseFloat(pending) || 0,
            });
            results.imported++;
          }
        } catch (err) {
          results.errors.push(`Error processing record: ${JSON.stringify(record)}`);
        }
      }

      return res.json(results);
    } catch (error) {
      console.error("Bulk import error:", error);
      return res.status(500).json({ error: "Failed to import leave balances" });
    }
  });

  // ========== SA BCEA LEAVE RECALCULATION ==========

  // Recalculate leave balances for all (or specified) employees using SA BCEA rules
  app.post("/api/leave-balances/recalculate-sa", requireAdmin, async (req, res) => {
    try {
      const { employeeIds } = req.body as { employeeIds?: string[] };

      const allUsers = await storage.getAllUsers();
      const workers = allUsers.filter(
        (u) =>
          u.startDate &&
          !u.terminationDate &&
          !u.excludeFromLeave &&
          (!employeeIds || employeeIds.includes(u.id))
      );

      const results: { updated: number; skipped: number; errors: string[]; details: { userId: string; name: string; annualLeave: number; sickLeave: number; familyResponsibility: number; monthsWorked: number }[] } = {
        updated: 0,
        skipped: 0,
        errors: [],
        details: [],
      };

      const graceMonthsSetting = await storage.getSetting('leave_carry_over_grace_months');
      const carryOverGraceMonths = graceMonthsSetting ? parseInt(graceMonthsSetting.value, 10) || 6 : 6;

      for (const user of workers) {
        try {
          const entitlements = calculateBceaEntitlements(user.startDate!);
          const existingBalances = await storage.getLeaveBalances(user.id);

          const upsertAnnual = async (total: number) => {
            const existing = existingBalances.find((b) => b.leaveType === 'Annual Leave');
            const todayStr = new Date().toISOString().split('T')[0];
            if (existing) {
              const currentCarryOver = existing.carryOverDays || 0;
              const carryOverExpiry = (existing as any).carryOverExpiry as string | null;

              // Forfeit carry-over if the grace window has passed
              if (currentCarryOver > 0 && carryOverExpiry && todayStr > carryOverExpiry) {
                const safeTaken = existing.taken + existing.pending;
                const safeTotal = Math.max(total, safeTaken);
                await storage.updateLeaveBalance(existing.id, { total: safeTotal, carryOverDays: 0, carryOverExpiry: null } as any);
                return;
              }

              const purePrevTotal = existing.total - currentCarryOver;
              // Detect cycle reset: pure entitlement dropped by more than 5 days
              const cycleReset = purePrevTotal > total + 5;
              if (cycleReset) {
                const unusedDays = Math.max(0, Math.round((existing.total - existing.taken - existing.pending) * 10) / 10);
                const expiry = getCarryOverExpiryDate(user.startDate!, carryOverGraceMonths);
                await storage.updateLeaveBalance(existing.id, { total: total + unusedDays, carryOverDays: unusedDays, carryOverExpiry: expiry } as any);
              } else {
                await storage.updateLeaveBalance(existing.id, { total: total + currentCarryOver });
              }
            } else {
              await storage.createLeaveBalance({ userId: user.id, leaveType: 'Annual Leave', total, taken: 0, pending: 0, carryOverDays: 0 });
            }
          };

          const upsert = async (leaveType: string, total: number) => {
            const existing = existingBalances.find((b) => b.leaveType === leaveType);
            if (existing) {
              await storage.updateLeaveBalance(existing.id, { total });
            } else {
              await storage.createLeaveBalance({ userId: user.id, leaveType, total, taken: 0, pending: 0, carryOverDays: 0 });
            }
          };

          await upsertAnnual(entitlements.annualLeave);
          await upsert('Sick Leave', entitlements.sickLeave);
          await upsert('Family Responsibility', entitlements.familyResponsibility);

          results.updated++;
          results.details.push({
            userId: user.id,
            name: `${user.firstName} ${user.surname}`,
            annualLeave: entitlements.annualLeave,
            sickLeave: entitlements.sickLeave,
            familyResponsibility: entitlements.familyResponsibility,
            monthsWorked: entitlements.monthsWorked,
          });
        } catch (err) {
          results.errors.push(`${user.id} (${user.firstName} ${user.surname}): ${err}`);
        }
      }

      return res.json({
        message: `SA BCEA recalculation complete: ${results.updated} employees updated, ${results.errors.length} errors`,
        ...results,
      });
    } catch (error) {
      console.error("SA BCEA recalculate error:", error);
      return res.status(500).json({ error: "Failed to recalculate leave balances" });
    }
  });

  // Preview SA BCEA entitlements for an employee (by userId or startDate)
  app.get("/api/leave-balances/sa-preview/:userId", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ error: "Employee not found" });
      if (!user.startDate) return res.status(400).json({ error: "Employee has no start date" });

      const entitlements = calculateBceaEntitlements(user.startDate);
      return res.json(entitlements);
    } catch (error) {
      console.error("SA preview error:", error);
      return res.status(500).json({ error: "Failed to calculate SA preview" });
    }
  });

  // ========== LEAVE REQUEST ROUTES ==========
  
  // Get all leave requests (or by user)
  app.get("/api/leave-requests", async (req, res) => {
    try {
      const sessionUserId = req.session.userId!;
      const sessionRoles: string[] = req.session.userRoles || [];
      const isHrOrAdmin = sessionRoles.includes('hr') || sessionRoles.includes('admin');
      const isManagerOnly = sessionRoles.includes('manager') && !isHrOrAdmin;

      // HR / admin see everything
      if (isHrOrAdmin) {
        const requests = await storage.getLeaveRequests();
        return res.json(requests);
      }

      // Manager (without HR/admin): only direct reports + own requests
      if (isManagerOnly) {
        const allUsers = await storage.getAllUsers();
        const directReportIds = new Set(
          allUsers.filter(u => u.managerId === sessionUserId).map(u => u.id)
        );
        const allRequests = await storage.getLeaveRequests();
        const filtered = allRequests.filter(
          r => r.userId === sessionUserId || directReportIds.has(r.userId)
        );
        return res.json(filtered);
      }

      // Everyone else: own requests only
      const requests = await storage.getLeaveRequests(sessionUserId);
      return res.json(requests);
    } catch (error) {
      console.error("Get leave requests error:", error);
      return res.status(500).json({ error: "Failed to fetch leave requests" });
    }
  });

  // Create leave request
  app.post("/api/leave-requests", async (req, res) => {
    try {
      const validatedData = insertLeaveRequestSchema.parse(req.body);

      const user = await storage.getUser(validatedData.userId);

      // ── Validation 1: date range sanity ────────────────────────────────────
      if (validatedData.startDate > validatedData.endDate) {
        return res.status(400).json({ error: "End date must be on or after start date" });
      }

      // ── Validation 2: cannot start before employment start date ────────────
      if (user?.startDate && validatedData.startDate < user.startDate) {
        return res.status(400).json({ error: "Leave cannot start before your employment start date" });
      }

      // ── Validation 3: overlap with existing active requests ────────────────
      const existingRequests = await storage.getLeaveRequests(validatedData.userId);
      const activeRequests = existingRequests.filter(
        r => !['rejected', 'cancelled'].includes(r.status)
      );
      const hasOverlap = activeRequests.some(
        r => validatedData.startDate <= r.endDate && validatedData.endDate >= r.startDate
      );
      if (hasOverlap) {
        return res.status(400).json({ error: "These dates overlap with an existing leave request" });
      }

      // ── Validation 4: sufficient leave balance ─────────────────────────────
      // 'taken' only reflects historic entries; the main approval flow never
      // updates it. So we compute consumed days from live pending/approved
      // requests and add the stored 'taken' (historic) on top.
      const requestedDays = await countWorkingDays(
        validatedData.startDate,
        validatedData.endDate,
        user?.religion ?? null
      );
      const balances = await storage.getLeaveBalances(validatedData.userId);
      const balance = balances.find(b => b.leaveType === validatedData.leaveType);
      let available: number | undefined;
      let totalConsumed: number | undefined;
      if (validatedData.leaveType !== 'Unpaid Leave') {
        if (!balance) {
          return res.status(400).json({
            error: `No ${validatedData.leaveType} balance has been configured for your account. Please contact HR.`,
          });
        }
        const pendingApprovedForType = activeRequests.filter(
          r => r.leaveType === validatedData.leaveType && !r.isHistoric
        );
        let consumedByRequests = 0;
        for (const r of pendingApprovedForType) {
          consumedByRequests += await countWorkingDays(r.startDate, r.endDate, user?.religion ?? null);
        }
        totalConsumed = (balance.taken ?? 0) + consumedByRequests;
        // balance.total already includes carryOverDays (stored as entitlement + carryOver).
        // Do NOT add carryOverDays again — it would double-count.
        available = (balance.total ?? 0) - totalConsumed;
        if (available < requestedDays) {
          return res.status(400).json({
            error: `Insufficient ${validatedData.leaveType} balance. Available: ${available.toFixed(1)} day(s), requested: ${requestedDays} day(s)`,
          });
        }
      }

      // ── Validation 5: Unpaid Leave 7-day notice period ────────────────────
      if (validatedData.leaveType === 'Unpaid Leave') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(validatedData.startDate + 'T00:00:00');
        const daysUntilStart = Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilStart < 7) {
          const { bypassNoticeCheck, bypassReason } = req.body;
          if (!bypassNoticeCheck) {
            return res.status(400).json({
              error: `Unpaid leave requires 7 days' notice. This request starts in ${daysUntilStart} day(s). A manager can submit on behalf of the employee with a bypass reason.`,
              code: 'NOTICE_PERIOD_REQUIRED',
              daysUntilStart,
            });
          }
          if (!bypassReason || typeof bypassReason !== 'string' || !bypassReason.trim()) {
            return res.status(400).json({ error: "A bypass reason is required when overriding the notice period requirement" });
          }
          // Log the discretion bypass
          await storage.createAuditLog({
            actorId: req.session.userId ?? null,
            action: 'notice_period_bypass',
            entityType: 'leave_request',
            entityId: null,
            changes: { userId: validatedData.userId, startDate: validatedData.startDate, daysUntilStart, bypassReason: bypassReason.trim() },
            description: `Notice period waived for ${validatedData.userId}: unpaid leave in ${daysUntilStart}d — "${bypassReason.trim()}"`,
          }).catch(e => console.error('[audit] log failed:', e));
          // Append bypass note to adminNotes so it's visible on the request
          (validatedData as any).adminNotes = `[Notice period waived by ${req.session.userId ?? 'admin'}: ${bypassReason.trim()}]`;
        }
      }

      // ── Medical certificate flags (sick leave only) ───────────────────────
      let requiresMedCert = false;
      const medCertFlagList: string[] = [];
      if (validatedData.leaveType === 'Sick Leave') {
        if (requestedDays > 2) {
          requiresMedCert = true;
          medCertFlagList.push('exceeds_2_days');
        }
        const holidays = await storage.getAllPublicHolidays();
        const isHoliday = (dateStr: string): boolean => {
          const d = new Date(dateStr + 'T00:00:00');
          const ymd = dateStr;
          const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          return holidays.some(h => h.isRecurring
            ? `${String(new Date(h.date + 'T00:00:00').getMonth() + 1).padStart(2, '0')}-${String(new Date(h.date + 'T00:00:00').getDate()).padStart(2, '0')}` === mmdd
            : h.date === ymd
          );
        };
        const addDays = (dateStr: string, n: number): string => {
          const d = new Date(dateStr + 'T00:00:00');
          d.setDate(d.getDate() + n);
          return d.toISOString().split('T')[0];
        };
        const startDow = new Date(validatedData.startDate + 'T00:00:00').getDay(); // 0=Sun,1=Mon
        const endDow   = new Date(validatedData.endDate   + 'T00:00:00').getDay();
        // Mon (1) start — suspicious if preceded by a weekend or public holiday
        if (startDow === 1 || isHoliday(addDays(validatedData.startDate, -1))) {
          requiresMedCert = true;
          medCertFlagList.push('mon_start_or_post_holiday');
        }
        // Fri (5) end — suspicious if followed by a weekend or public holiday
        if (endDow === 5 || isHoliday(addDays(validatedData.endDate, 1))) {
          requiresMedCert = true;
          medCertFlagList.push('fri_end_or_pre_holiday');
        }
      }

      // Determine initial status based on whether user has a manager/reporting position
      let initialStatus = 'pending_manager';

      // Resolve manager: prefer reportsToPositionId (position-based), fall back to managerId (legacy)
      let resolvedManagerId: string | null = null;
      if (user?.reportsToPositionId) {
        // Find the person who currently holds that position
        const allUsers = await storage.getAllUsers();
        const positionHolder = allUsers.find(u => u.orgPositionId === user!.reportsToPositionId);
        resolvedManagerId = positionHolder?.id || null;
      } else if (user?.managerId) {
        resolvedManagerId = user.managerId;
      }
      
      if (!resolvedManagerId) {
        // No manager assigned, go directly to HR
        initialStatus = 'pending_hr';
      }
      
      // Override the status with the correct initial status; include med cert flags
      const requestWithStatus = {
        ...validatedData,
        status: initialStatus,
        requiresMedCert,
        medCertFlags: medCertFlagList.length ? JSON.stringify(medCertFlagList) : null,
      };
      const newRequest = await storage.createLeaveRequest(requestWithStatus);

      // Soft-reserve the requested days in pending balance (see decisions.md DEC-001).
      // Deduct from carry-over first — carry-over minimum is 0.
      const pendingBalance = balances.find(b => b.leaveType === validatedData.leaveType);
      if (pendingBalance) {
        const carryConsumed = Math.min(requestedDays, pendingBalance.carryOverDays ?? 0);
        await storage.updateLeaveBalance(pendingBalance.id, {
          pending: (pendingBalance.pending ?? 0) + requestedDays,
          carryOverDays: Math.max(0, (pendingBalance.carryOverDays ?? 0) - carryConsumed),
        });
      }

      // Send email notification to manager and admin recipients
      try {
        const adminEmailSetting = await storage.getSetting('admin_email');
        const senderEmail = "noreply@aece.co.za";
        
        // Construct the app URL from the request
        const appUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.REPLIT_DEPLOYMENT_URL || 'https://aece-checkpoint.replit.app';
        
        const emailData = {
          employeeName: user ? `${user.firstName} ${user.surname}` : 'Unknown',
          employeeId: validatedData.userId,
          leaveType: validatedData.leaveType,
          startDate: validatedData.startDate,
          endDate: validatedData.endDate,
          reason: validatedData.reason || 'No reason provided',
          department: user?.department || undefined,
          requestId: newRequest.id,
          appUrl: appUrl,
          requestedDays,
          totalDays: balance ? (balance.total ?? 0) : undefined,
          consumedDays: totalConsumed,
          availableDays: available !== undefined ? available - requestedDays : undefined,
        };
        
        // Send notification to the resolved manager (via position or direct manager ID)
        if (resolvedManagerId) {
          const manager = await storage.getUser(resolvedManagerId);
          if (manager?.email) {
            console.log(`Sending leave request notification to manager: ${manager.email}`);
            await sendLeaveRequestNotification(manager.email, senderEmail, emailData);
          }
        }
        
        // Also send to configured admin email recipients
        if (adminEmailSetting?.value) {
          // Support multiple email addresses (one per line)
          const emails = adminEmailSetting.value.split('\n').map((e: string) => e.trim()).filter((e: string) => e);
          
          for (const recipientEmail of emails) {
            await sendLeaveRequestNotification(recipientEmail, senderEmail, emailData);
          }
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
      }
      
      return res.status(201).json(newRequest);
    } catch (error) {
      console.error("Create leave request error:", error);
      return res.status(400).json({ error: "Invalid leave request data" });
    }
  });

  // Update leave request status
  app.patch("/api/leave-requests/:id/status", requireAdmin, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const updatedRequest = await storage.updateLeaveRequestStatus(
        parseInt(req.params.id),
        status,
        adminNotes
      );
      
      if (!updatedRequest) {
        return res.status(404).json({ error: "Leave request not found" });
      }

      // Send email notification to employee if approved or rejected
      if (status === 'approved' || status === 'rejected') {
        try {
          const user = await storage.getUser(updatedRequest.userId);
          const senderEmail = "noreply@aece.co.za";
          
          if (user && user.email) {
            await sendLeaveStatusNotification(
              user.email,
              senderEmail,
              {
                employeeName: `${user.firstName} ${user.surname}`,
                employeeEmail: user.email,
                leaveType: updatedRequest.leaveType,
                startDate: updatedRequest.startDate,
                endDate: updatedRequest.endDate,
                status: status as 'approved' | 'rejected',
              }
            );
          }
        } catch (emailError) {
          console.error('Failed to send leave status notification:', emailError);
        }
      }

      return res.json(updatedRequest);
    } catch (error) {
      console.error("Update leave request error:", error);
      return res.status(500).json({ error: "Failed to update leave request" });
    }
  });

  // Get leave requests by status (for approval workflows)
  app.get("/api/leave-requests/by-status/:status", requireAdmin, async (req, res) => {
    try {
      const status = req.params.status;
      const validStatuses = ['pending_manager', 'pending_hr', 'pending_md', 'approved', 'rejected', 'cancelled'];
      
      // Support comma-separated multiple statuses
      const statuses = status.split(',');
      const invalidStatuses = statuses.filter(s => !validStatuses.includes(s));
      
      if (invalidStatuses.length > 0) {
        return res.status(400).json({ error: `Invalid status values: ${invalidStatuses.join(', ')}` });
      }
      
      const requests = await storage.getLeaveRequestsByStatus(statuses);
      return res.json(requests);
    } catch (error) {
      console.error("Get leave requests by status error:", error);
      return res.status(500).json({ error: "Failed to fetch leave requests" });
    }
  });

  // Manager approval decision
  app.post("/api/leave-requests/:id/manager-decision", async (req, res) => {
    try {
      const { approverId, decision, notes } = req.body;
      
      if (!approverId) {
        return res.status(400).json({ error: "Approver ID is required" });
      }
      
      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: "Decision must be 'approved' or 'rejected'" });
      }

      const requestId = parseInt(req.params.id);
      const request = await storage.getLeaveRequest(requestId);

      if (!request) {
        return res.status(404).json({ error: "Leave request not found" });
      }

      if (request.status !== 'pending_manager') {
        return res.status(400).json({ error: "Leave request is not awaiting manager approval" });
      }

      // Enforce reporting-line: only the employee's direct manager may approve
      const sessionRoles: string[] = req.session?.userRoles || [];
      const isHrOrAdmin = sessionRoles.includes('hr') || sessionRoles.includes('admin');
      if (!isHrOrAdmin) {
        const employee = await storage.getUser(request.userId);
        if (!employee || employee.managerId !== approverId) {
          return res.status(403).json({ error: "You are not the reporting manager for this employee" });
        }
      }

      const updatedRequest = await storage.updateManagerDecision(requestId, approverId, decision, notes);

      try {
        const senderEmail = (await storage.getSetting('sender_email'))?.value || 'noreply@aece.co.za';
        const employee = await storage.getUser(request.userId);
        const emailData = {
          employeeName: employee ? `${employee.firstName} ${employee.surname}` : request.userId,
          leaveType: request.leaveType,
          startDate: request.startDate,
          endDate: request.endDate,
        };

        // Both recommend and not-recommend forward to HR — notify all HR users
        const allUsers = await storage.getAllUsers();
        const hrUsers = allUsers.filter(u => Array.isArray((u as any).roles) && (u as any).roles.includes('hr') && u.email);
        for (const hrUser of hrUsers) {
          await sendLeaveStageNotification(hrUser.email!, senderEmail, {
            recipientName: `${hrUser.firstName} ${hrUser.surname}`,
            ...emailData,
            newStage: 'pending_hr',
            notes: decision === 'rejected' ? `[NOT RECOMMENDED] ${notes || ''}`.trim() : (notes || undefined),
          });
        }
      } catch (emailError) {
        console.error('Failed to send manager decision notification:', emailError);
      }

      return res.json(updatedRequest);
    } catch (error) {
      console.error("Manager decision error:", error);
      return res.status(500).json({ error: "Failed to process manager decision" });
    }
  });

  // HR approval decision
  app.post("/api/leave-requests/:id/hr-decision", async (req, res) => {
    try {
      const { approverId, decision, notes } = req.body;
      
      if (!approverId) {
        return res.status(400).json({ error: "Approver ID is required" });
      }
      
      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: "Decision must be 'approved' or 'rejected'" });
      }
      
      const requestId = parseInt(req.params.id);
      const request = await storage.getLeaveRequest(requestId);
      
      if (!request) {
        return res.status(404).json({ error: "Leave request not found" });
      }
      
      if (request.status !== 'pending_hr') {
        return res.status(400).json({ error: "Leave request is not awaiting HR approval" });
      }

      // Enforce HR role — only hr/admin may approve at this stage
      const hrSessionRoles: string[] = req.session?.userRoles || [];
      if (!hrSessionRoles.includes('hr') && !hrSessionRoles.includes('admin')) {
        return res.status(403).json({ error: "Only HR or admin users may approve at this stage" });
      }

      // Block HR approval if a medical certificate is required but not yet uploaded (P3.1)
      if (decision === 'approved' && request.requiresMedCert) {
        const hasDocs = request.documents && request.documents.length > 0;
        if (!hasDocs) {
          return res.status(400).json({
            error: "A medical certificate must be uploaded before this sick leave request can be approved.",
            code: 'MED_CERT_REQUIRED',
          });
        }
      }

      const updatedRequest = await storage.updateHRDecision(requestId, approverId, decision, notes);

      const employee = await storage.getUser(request.userId);
      if (decision === 'rejected') {
        await decrementPending(request, (employee as any)?.religion ?? null);
      }

      // Notify employee of final HR decision
      try {
        const senderEmail = (await storage.getSetting('sender_email'))?.value || 'noreply@aece.co.za';
        if (employee?.email) {
          await sendLeaveStageNotification(employee.email, senderEmail, {
            recipientName: employee.firstName,
            employeeName: `${employee.firstName} ${employee.surname}`,
            leaveType: request.leaveType,
            startDate: request.startDate,
            endDate: request.endDate,
            newStage: decision === 'approved' ? 'approved' : 'rejected',
            notes: notes || undefined,
          });
        }
      } catch (emailError) {
        console.error('Failed to send HR decision notification:', emailError);
      }

      return res.json(updatedRequest);
    } catch (error) {
      console.error("HR decision error:", error);
      return res.status(500).json({ error: "Failed to process HR decision" });
    }
  });

  // MD approval decision (can bypass HR)
  app.post("/api/leave-requests/:id/md-decision", async (req, res) => {
    try {
      const { approverId, decision, notes, bypassHR } = req.body;
      
      if (!approverId) {
        return res.status(400).json({ error: "Approver ID is required" });
      }
      
      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: "Decision must be 'approved' or 'rejected'" });
      }
      
      const requestId = parseInt(req.params.id);
      const request = await storage.getLeaveRequest(requestId);
      
      if (!request) {
        return res.status(404).json({ error: "Leave request not found" });
      }
      
      // MD can approve/reject from pending_hr or pending_md status
      if (!['pending_hr', 'pending_md'].includes(request.status)) {
        return res.status(400).json({ error: "Leave request is not awaiting HR or MD approval" });
      }
      
      // If bypassing HR (request is still at pending_hr), mark bypassHR flag
      const isBypassingHR = request.status === 'pending_hr' && bypassHR;
      
      const updatedRequest = await storage.updateMDDecision(requestId, approverId, decision, notes, isBypassingHR);

      if (decision === 'rejected') {
        const employee = await storage.getUser(request.userId);
        await decrementPending(request, (employee as any)?.religion ?? null);
      }

      // Send final email notification to employee
      if (updatedRequest) {
        try {
          const user = await storage.getUser(updatedRequest.userId);
          const senderEmail = "noreply@aece.co.za";
          
          if (user && user.email) {
            await sendLeaveStatusNotification(
              user.email,
              senderEmail,
              {
                employeeName: `${user.firstName} ${user.surname}`,
                employeeEmail: user.email,
                leaveType: updatedRequest.leaveType,
                startDate: updatedRequest.startDate,
                endDate: updatedRequest.endDate,
                status: decision as 'approved' | 'rejected',
              }
            );
          }
        } catch (emailError) {
          console.error('Failed to send leave status notification:', emailError);
        }
      }
      
      return res.json(updatedRequest);
    } catch (error) {
      console.error("MD decision error:", error);
      return res.status(500).json({ error: "Failed to process MD decision" });
    }
  });

  // Cancel leave request (by employee - pending only)
  app.delete("/api/leave-requests/:id", async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const request = await storage.getLeaveRequest(requestId);
      
      if (!request) {
        return res.status(404).json({ error: "Leave request not found" });
      }
      
      // Only allow cancellation of requests still in pending stages
      const cancellableStatuses = ['pending', 'pending_manager', 'pending_hr', 'pending_md'];
      if (!cancellableStatuses.includes(request.status)) {
        return res.status(400).json({ error: "Only pending requests can be cancelled" });
      }
      
      // Update status to cancelled
      const updatedRequest = await storage.updateLeaveRequestStatus(requestId, 'cancelled');

      const cancelEmployee = await storage.getUser(request.userId);
      await decrementPending(request, (cancelEmployee as any)?.religion ?? null);

      return res.json({ message: "Leave request cancelled successfully", request: updatedRequest });
    } catch (error) {
      console.error("Cancel leave request error:", error);
      return res.status(500).json({ error: "Failed to cancel leave request" });
    }
  });

  // Admin cancel leave request (can cancel any status including approved, adjusts balance)
  app.post("/api/leave-requests/:id/admin-cancel", requireAdmin, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const { reason, adminId } = req.body;
      
      const request = await storage.getLeaveRequest(requestId);
      
      if (!request) {
        return res.status(404).json({ error: "Leave request not found" });
      }
      
      if (request.status === 'cancelled') {
        return res.status(400).json({ error: "Leave request is already cancelled" });
      }
      
      // Update status to cancelled
      const updatedRequest = await storage.updateLeaveRequestStatus(requestId, 'cancelled');

      // Credit back the balance — historic entries live in `taken`, all others in `pending`
      const adminCancelEmployee = await storage.getUser(request.userId);
      const religion = (adminCancelEmployee as any)?.religion ?? null;
      if (request.isHistoric) {
        await decrementTaken(request, religion);
      } else {
        await decrementPending(request, religion);
      }
      
      // Send email notification to employee
      try {
        const user = await storage.getUser(request.userId);
        const adminEmailSetting = await storage.getSetting('admin_email');
        const senderEmail = "noreply@aece.co.za";
        
        if (user && user.email) {
          // TODO: Send cancellation notification email
        }
        
        // Notify HR about the admin cancellation
        if (adminEmailSetting) {
          // TODO: Send HR notification about admin cancellation
        }
      } catch (emailError) {
        console.error('Failed to send cancellation notification:', emailError);
      }
      
      await storage.createAuditLog({
        actorId: req.session.userId ?? null,
        action: 'admin_cancel_leave',
        entityType: 'leave_request',
        entityId: String(requestId),
        changes: { previousStatus: request.status, userId: request.userId, leaveType: request.leaveType, startDate: request.startDate, endDate: request.endDate, reason: reason ?? null },
        description: `Admin cancelled ${request.leaveType} leave for ${request.userId} (was ${request.status})`,
      }).catch(e => console.error('[audit] log failed:', e));

      return res.json({
        message: "Leave request cancelled and balance credited back",
        request: updatedRequest,
      });
    } catch (error) {
      console.error("Admin cancel leave request error:", error);
      return res.status(500).json({ error: "Failed to cancel leave request" });
    }
  });

  // ========== HISTORIC LEAVE REQUEST ROUTES (admin only) ==========

  // Create a historic (pre-approved) leave entry - bypasses approval workflow
  app.post("/api/leave-requests/historic", requireAdmin, async (req, res) => {
    try {
      const { userId, leaveType, startDate, endDate, reason, authorizedBy, referenceNumber, notes } = req.body;

      if (!userId || !leaveType || !startDate || !endDate) {
        return res.status(400).json({ error: "userId, leaveType, startDate, and endDate are required" });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      if (end < start) {
        return res.status(400).json({ error: "End date must be on or after start date" });
      }

      const employee = await storage.getUser(userId);
      const days = await countWorkingDays(startDate, endDate, (employee as any)?.religion || null);

      const newRequest = await storage.createLeaveRequest({
        userId,
        leaveType,
        startDate,
        endDate,
        reason: reason || 'Historic leave entry',
        status: 'approved',
        isHistoric: true,
        authorizedBy: authorizedBy || null,
        referenceNumber: referenceNumber || null,
        adminNotes: notes || null,
        finalizedAt: new Date(),
      } as any);

      // Deduct working days from balance
      const balances = await storage.getLeaveBalances(userId);
      const balance = balances.find((b: any) => b.leaveType === leaveType);
      if (balance) {
        await storage.updateLeaveBalance(balance.id, {
          taken: balance.taken + days,
        });
      }

      await storage.createAuditLog({
        actorId: req.session.userId ?? null,
        action: 'create_historic_leave',
        entityType: 'leave_request',
        entityId: String(newRequest.id),
        changes: { userId, leaveType, startDate, endDate, days, authorizedBy: authorizedBy ?? null, referenceNumber: referenceNumber ?? null },
        description: `Created historic ${leaveType} leave for ${userId}: ${startDate} – ${endDate} (${days} days)`,
      }).catch(e => console.error('[audit] log failed:', e));

      return res.status(201).json(newRequest);
    } catch (error) {
      console.error("Create historic leave request error:", error);
      return res.status(500).json({ error: "Failed to create historic leave request" });
    }
  });

  // Update a historic leave entry (admin only)
  app.put("/api/leave-requests/historic/:id", requireAdmin, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const { userId, leaveType, startDate, endDate, reason, authorizedBy, referenceNumber, notes } = req.body;

      const existingRequest = await storage.getLeaveRequest(requestId);
      if (!existingRequest || !existingRequest.isHistoric) {
        return res.status(404).json({ error: "Historic leave request not found" });
      }

      // Credit back old working days
      const oldEmployee = await storage.getUser(existingRequest.userId);
      const oldDays = await countWorkingDays(existingRequest.startDate, existingRequest.endDate, (oldEmployee as any)?.religion || null);

      const oldBalances = await storage.getLeaveBalances(existingRequest.userId);
      const oldBalance = oldBalances.find((b: any) => b.leaveType === existingRequest.leaveType);
      if (oldBalance) {
        await storage.updateLeaveBalance(oldBalance.id, {
          taken: Math.max(0, oldBalance.taken - oldDays),
        });
      }

      const newUserId = userId || existingRequest.userId;
      const newLeaveType = leaveType || existingRequest.leaveType;
      const newStartDate = startDate || existingRequest.startDate;
      const newEndDate = endDate || existingRequest.endDate;

      const newEmployee = newUserId !== existingRequest.userId ? await storage.getUser(newUserId) : oldEmployee;
      const newDays = await countWorkingDays(newStartDate, newEndDate, (newEmployee as any)?.religion || null);

      // Deduct new working days
      const newBalances = await storage.getLeaveBalances(newUserId);
      const newBalance = newBalances.find((b: any) => b.leaveType === newLeaveType);
      if (newBalance) {
        await storage.updateLeaveBalance(newBalance.id, {
          taken: newBalance.taken + newDays,
        });
      }

      // Update the record via storage
      const updated = await storage.updateHistoricLeaveRequest(requestId, {
        userId: newUserId,
        leaveType: newLeaveType,
        startDate: newStartDate,
        endDate: newEndDate,
        reason: reason !== undefined ? reason : existingRequest.reason,
        authorizedBy: authorizedBy !== undefined ? authorizedBy : existingRequest.authorizedBy,
        referenceNumber: referenceNumber !== undefined ? referenceNumber : existingRequest.referenceNumber,
        adminNotes: notes !== undefined ? notes : existingRequest.adminNotes,
      });

      return res.json(updated);
    } catch (error) {
      console.error("Update historic leave request error:", error);
      return res.status(500).json({ error: "Failed to update historic leave request" });
    }
  });

  // Permanently delete leave request (admin only - for test data cleanup)
  app.delete("/api/leave-requests/:id/permanent", requireAdmin, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const request = await storage.getLeaveRequest(requestId);
      
      if (!request) {
        return res.status(404).json({ error: "Leave request not found" });
      }
      
      // If the leave was approved, credit back the balance before deleting
      if (request.status === 'approved') {
        const deleteEmployee = await storage.getUser(request.userId);
        const days = await countWorkingDays(request.startDate, request.endDate, (deleteEmployee as any)?.religion || null);
        
        const balances = await storage.getLeaveBalances(request.userId);
        const balance = balances.find(b => b.leaveType === request.leaveType);
        if (balance) {
          await storage.updateLeaveBalance(balance.id, {
            taken: Math.max(0, balance.taken - days)
          });
        }
      }
      
      const deleted = await storage.deleteLeaveRequest(requestId);
      
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete leave request" });
      }
      
      return res.json({ message: "Leave request permanently deleted" });
    } catch (error) {
      console.error("Permanent delete leave request error:", error);
      return res.status(500).json({ error: "Failed to delete leave request" });
    }
  });

  // ========== ATTENDANCE ROUTES ==========
  
  // Get all attendance records (admin) - must be before :userId route
  app.get("/api/attendance", async (req, res) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      let endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      // Adjust endDate to include the entire day (end of day instead of start)
      if (endDate) {
        endDate = new Date(endDate);
        endDate.setHours(23, 59, 59, 999);
      }
      
      const records = await storage.getAllAttendanceRecords(startDate, endDate);
      return res.json(records);
    } catch (error) {
      console.error("Get all attendance error:", error);
      return res.status(500).json({ error: "Failed to fetch attendance records" });
    }
  });

  // Get attendance records for a user
  app.get("/api/attendance/:userId", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      let endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      // Adjust endDate to include the entire day
      if (endDate) {
        endDate = new Date(endDate);
        endDate.setHours(23, 59, 59, 999);
      }
      
      const records = await storage.getAttendanceRecords(req.params.userId, limit, startDate, endDate);
      return res.json(records);
    } catch (error) {
      console.error("Get attendance error:", error);
      return res.status(500).json({ error: "Failed to fetch attendance records" });
    }
  });

  // Create attendance record
  app.post("/api/attendance", async (req, res) => {
    try {
      const validatedData = insertAttendanceRecordSchema.parse(req.body);
      
      // Check for valid clock-in/clock-out sequence (only for attendance context)
      if (validatedData.context === 'attendance') {
        const latestRecord = await storage.getTodayLatestAttendance(validatedData.userId);
        
        if (validatedData.type === 'in') {
          // Trying to clock in - check if already clocked in without clocking out
          if (latestRecord && latestRecord.type === 'in') {
            return res.status(409).json({ 
              error: "Already clocked in", 
              message: "Worker is already clocked in. Please clock out before clocking in again." 
            });
          }
        } else if (validatedData.type === 'out') {
          // Trying to clock out - check if there's a clock-in first
          if (!latestRecord || latestRecord.type === 'out') {
            return res.status(409).json({ 
              error: "Not clocked in", 
              message: "Worker has not clocked in yet today." 
            });
          }
        }
      }
      
      let newRecord = await storage.createAttendanceRecord({
        ...validatedData,
        timestamp: new Date(),
      });
      
      // Check for late arrival or early departure and send notification
      if (validatedData.context === 'attendance') {
        const recordTime = new Date(newRecord.timestamp);
        
        // Get timezone setting for proper time formatting
        const timezoneSetting = await storage.getSetting('timezone');
        const timezone = timezoneSetting?.value || 'Africa/Johannesburg';
        
        // Format time in the configured timezone
        const currentTime = recordTime.toLocaleTimeString('en-ZA', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false,
          timeZone: timezone
        });
        
        try {
          const user = await storage.getUser(validatedData.userId);
          const adminEmailSetting = await storage.getSetting('admin_email');
          
          if (user && adminEmailSetting) {
            let isInfringement = false;
            let infringementType: 'late_arrival' | 'early_departure' = 'late_arrival';
            let cutoffTime = '';
            
            if (validatedData.type === 'in') {
              // Check for late arrival
              const clockInCutoff = await storage.getSetting('clock_in_cutoff');
              if (clockInCutoff && currentTime > clockInCutoff.value) {
                isInfringement = true;
                infringementType = 'late_arrival';
                cutoffTime = clockInCutoff.value;
              }
            } else if (validatedData.type === 'out') {
              // Check for early departure
              const clockOutCutoff = await storage.getSetting('clock_out_cutoff');
              if (clockOutCutoff && currentTime < clockOutCutoff.value) {
                isInfringement = true;
                infringementType = 'early_departure';
                cutoffTime = clockOutCutoff.value;
              }
            }
            
            if (isInfringement) {
              await storage.updateAttendanceRecord(newRecord.id, {
                isInfringement: infringementType,
              });
              newRecord = { ...newRecord, isInfringement: infringementType };

              // Get custom message template
              const messageSettingKey = infringementType === 'late_arrival' ? 'late_arrival_message' : 'early_departure_message';
              const messageSetting = await storage.getSetting(messageSettingKey);

              // Build recipient list: upstream managers via org hierarchy + admin_email fallback list
              const hierarchyEmails = await getHierarchyEmails(user.id);
              const adminEmails = adminEmailSetting.value.split('\n').map((e: string) => e.trim()).filter((e: string) => e);
              const allEmailSet = new Set([...hierarchyEmails, ...adminEmails]);

              for (const recipientEmail of allEmailSet) {
                await sendLateAttendanceNotification(
                  recipientEmail,
                  'noreply@aece.co.za',
                  {
                    employeeName: `${user.firstName} ${user.surname}`,
                    firstName: user.firstName,
                    surname: user.surname,
                    employeeId: user.id,
                    department: user.department || undefined,
                    type: infringementType,
                    actualTime: currentTime,
                    cutoffTime: cutoffTime,
                    customMessage: messageSetting?.value,
                  }
                );
              }
            }
          }
        } catch (notificationError) {
          console.error("Failed to check/send late notification:", notificationError);
          // Don't fail the attendance record creation for notification errors
        }
      }
      
      return res.status(201).json(newRecord);
    } catch (error) {
      console.error("Create attendance error:", error);
      return res.status(400).json({ error: "Invalid attendance data" });
    }
  });

  // Create bulk attendance records (manual entry)
  app.post("/api/attendance/bulk", requireAdmin, async (req, res) => {
    try {
      const { records } = req.body;
      
      if (!records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: "Records array is required" });
      }

      // Validate and transform records
      const validRecords: { userId: string; type: string; timestamp: Date; method: string; context: string }[] = [];
      const errors: string[] = [];

      for (const r of records) {
        if (!r.userId || typeof r.userId !== 'string') {
          errors.push(`Invalid userId: ${r.userId}`);
          continue;
        }
        if (!r.type || (r.type !== 'in' && r.type !== 'out')) {
          errors.push(`Invalid type for ${r.userId}: ${r.type}`);
          continue;
        }
        if (!r.timestamp) {
          errors.push(`Missing timestamp for ${r.userId}`);
          continue;
        }
        
        const timestamp = new Date(r.timestamp);
        if (isNaN(timestamp.getTime())) {
          errors.push(`Invalid timestamp for ${r.userId}: ${r.timestamp}`);
          continue;
        }

        validRecords.push({
          userId: r.userId,
          type: r.type,
          timestamp,
          method: 'manual',
          context: 'manual',
        });
      }

      if (validRecords.length === 0) {
        return res.status(400).json({ error: errors.length > 0 ? errors.join('; ') : "No valid records provided" });
      }

      const newRecords = await storage.createBulkAttendanceRecords(validRecords);
      return res.status(201).json(newRecords);
    } catch (error) {
      console.error("Create bulk attendance error:", error);
      return res.status(400).json({ error: "Failed to create attendance records" });
    }
  });

  // Update attendance record (admin only)
  app.patch("/api/attendance/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { timestamp, type, isInfringement, infringementReason } = req.body;
      
      const updateData: { timestamp?: Date; type?: string; isInfringement?: string | null; infringementReason?: string | null } = {};
      if (timestamp) {
        const parsedTime = new Date(timestamp);
        if (isNaN(parsedTime.getTime())) {
          return res.status(400).json({ error: "Invalid timestamp format" });
        }
        updateData.timestamp = parsedTime;
      }
      if (type && (type === 'in' || type === 'out')) {
        updateData.type = type;
      }
      if (isInfringement !== undefined) {
        updateData.isInfringement = isInfringement;
      }
      if (infringementReason !== undefined) {
        updateData.infringementReason = infringementReason;
      }
      
      const updated = await storage.updateAttendanceRecord(parseInt(id), updateData);
      if (!updated) {
        return res.status(404).json({ error: "Attendance record not found" });
      }
      return res.json(updated);
    } catch (error) {
      console.error("Update attendance record error:", error);
      return res.status(500).json({ error: "Failed to update attendance record" });
    }
  });

  // Update infringement reason (for worker popup)
  app.patch("/api/attendance/:id/infringement-reason", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { infringementReason } = req.body;
      
      if (!infringementReason || typeof infringementReason !== 'string') {
        return res.status(400).json({ error: "Infringement reason is required" });
      }
      
      const updated = await storage.updateAttendanceRecord(parseInt(id), { infringementReason });
      if (!updated) {
        return res.status(404).json({ error: "Attendance record not found" });
      }

      // Send follow-up notification email with the reason included
      try {
        if (updated.isInfringement && updated.userId) {
          const user = await storage.getUser(updated.userId);
          const adminEmailSetting = await storage.getSetting('admin_email');
          const timezoneSetting = await storage.getSetting('timezone');
          const timezone = timezoneSetting?.value || 'Africa/Johannesburg';

          if (user && adminEmailSetting) {
            const infringementType = updated.isInfringement as 'late_arrival' | 'early_departure';
            const recordTime = new Date(updated.timestamp);
            const actualTime = recordTime.toLocaleTimeString('en-ZA', {
              hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone
            });

            const cutoffSettingKey = infringementType === 'late_arrival' ? 'clock_in_cutoff' : 'clock_out_cutoff';
            const cutoffSetting = await storage.getSetting(cutoffSettingKey);
            const messageSettingKey = infringementType === 'late_arrival' ? 'late_arrival_message' : 'early_departure_message';
            const messageSetting = await storage.getSetting(messageSettingKey);

            // Build recipient list: upstream managers via org hierarchy + admin_email fallback list
            const hierarchyEmails = await getHierarchyEmails(user.id);
            const adminEmails = adminEmailSetting.value.split('\n').map((e: string) => e.trim()).filter((e: string) => e);
            const allEmailSet = new Set([...hierarchyEmails, ...adminEmails]);

            for (const recipientEmail of allEmailSet) {
              await sendLateAttendanceNotification(
                recipientEmail,
                'noreply@aece.co.za',
                {
                  employeeName: `${user.firstName} ${user.surname}`,
                  firstName: user.firstName,
                  surname: user.surname,
                  employeeId: user.id,
                  department: user.department || undefined,
                  type: infringementType,
                  actualTime,
                  cutoffTime: cutoffSetting?.value || '',
                  customMessage: messageSetting?.value,
                  infringementReason,
                }
              );
            }
          }
        }
      } catch (emailError) {
        console.error("Failed to send infringement reason notification:", emailError);
      }

      return res.json(updated);
    } catch (error) {
      console.error("Update infringement reason error:", error);
      return res.status(500).json({ error: "Failed to update infringement reason" });
    }
  });

  // Delete attendance record (admin only)
  app.delete("/api/attendance/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteAttendanceRecord(parseInt(id));
      if (!deleted) {
        return res.status(404).json({ error: "Attendance record not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete attendance record error:", error);
      return res.status(500).json({ error: "Failed to delete attendance record" });
    }
  });

  // Get clock-in status for a user
  app.get("/api/attendance/status/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const status = await storage.getUserClockInStatus(userId);
      return res.json(status);
    } catch (error) {
      console.error("Get clock-in status error:", error);
      return res.status(500).json({ error: "Failed to fetch clock-in status" });
    }
  });

  // Auto-reset users who forgot to clock out (admin trigger)
  app.post("/api/attendance/auto-reset", requireAdmin, async (req, res) => {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const startOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
      
      const usersNotClockedOut = await storage.getUsersNotClockedOut(startOfToday);
      
      const senderSetting = await storage.getSetting('sender_email');
      const senderEmail = senderSetting?.value || 'noreply@aece.co.za';

      const results = [];
      
      // ── Missed clock-out auto-reset ──────────────────────────────────────
      for (const { user, lastClockIn } of usersNotClockedOut) {
        try {
          const clockInDate = new Date(lastClockIn.timestamp);
          const autoClockOutTime = new Date(clockInDate);
          autoClockOutTime.setHours(23, 59, 0, 0);
          
          await storage.createSystemAutoClockOut(user.id, autoClockOutTime);
          
          const clockInDateStr = clockInDate.toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' });

          if (user.email) {
            const { sendMissedClockOutNotification } = await import('./email');
            await sendMissedClockOutNotification(user.email, senderEmail, {
              employeeName: `${user.firstName} ${user.surname}`,
              firstName: user.firstName,
              employeeId: user.id,
              department: user.department || undefined,
              clockInTime: clockInDate.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
              clockInDate: clockInDateStr,
              autoClockOutTime: autoClockOutTime.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
            });
          }

          // #12: Also alert the employee's manager(s)
          const managerIds = [user.managerId, user.secondManagerId].filter(Boolean) as string[];
          for (const mgId of managerIds) {
            const manager = await storage.getUser(mgId);
            if (manager?.email) {
              await sendManagerMissedClockOutAlert(manager.email, senderEmail, {
                managerName: `${manager.firstName} ${manager.surname}`,
                employeeName: `${user.firstName} ${user.surname}`,
                employeeId: user.id,
                department: user.department || undefined,
                clockInDate: clockInDateStr,
              });
            }
          }
          
          results.push({ userId: user.id, name: `${user.firstName} ${user.surname}`, success: true });
        } catch (err) {
          console.error(`Failed to auto clock-out user ${user.id}:`, err);
          results.push({ userId: user.id, name: `${user.firstName} ${user.surname}`, success: false, error: String(err) });
        }
      }

      // ── #10 AWOL detection: workers with no clock-in and no approved leave yesterday ──
      try {
        const allWorkers = await storage.getAllUsers();
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const activeWorkers = allWorkers.filter((u: any) =>
          u.role === 'worker' &&
          !u.terminationDate &&
          !u.excludeFromLeave &&
          (!u.startDate || u.startDate <= yesterdayStr)
        );

        // Get yesterday's attendance records
        const yesterdayAttendance = await storage.getAllAttendanceRecords(startOfYesterday, startOfToday);
        const workersClockedInYesterday = new Set(yesterdayAttendance.map((r: any) => r.userId));

        // Get approved leave for yesterday
        const allLeaveRequests = await storage.getLeaveRequests();
        const approvedLeaveYesterday = new Set(
          allLeaveRequests
            .filter((lr: any) => lr.status === 'approved' && lr.startDate <= yesterdayStr && lr.endDate >= yesterdayStr)
            .map((lr: any) => lr.userId)
        );

        // Identify AWOL: not clocked in and not on approved leave
        const awolWorkers = activeWorkers.filter((w: any) =>
          !workersClockedInYesterday.has(w.id) && !approvedLeaveYesterday.has(w.id)
        );

        if (awolWorkers.length > 0) {
          // Create AWOL notifications for each worker
          for (const worker of awolWorkers) {
            await storage.createNotification({
              userId: worker.id,
              type: 'awol',
              title: 'AWOL – Unexplained Absence',
              message: `No clock-in recorded and no approved leave for ${yesterdayStr}. Please contact your manager.`,
              isRead: false,
            }).catch(() => {}); // Graceful: notifications table may not have this type
          }

          // Group AWOL workers by manager and send per-manager alert
          const managerToWorkers: Record<string, { manager: any; workers: any[] }> = {};
          for (const worker of awolWorkers) {
            const managerIds = [worker.managerId, worker.secondManagerId].filter(Boolean) as string[];
            if (managerIds.length === 0) {
              // Fall back to admin_email
              const adminSetting = await storage.getSetting('admin_email');
              const adminEmails = adminSetting?.value?.split('\n').map((e: string) => e.trim()).filter(Boolean) || [];
              for (const email of adminEmails) {
                if (!managerToWorkers[email]) managerToWorkers[email] = { manager: { firstName: 'Admin', surname: '', email }, workers: [] };
                managerToWorkers[email].workers.push(worker);
              }
            }
            for (const mgId of managerIds) {
              if (!managerToWorkers[mgId]) {
                const manager = await storage.getUser(mgId);
                if (manager?.email) managerToWorkers[mgId] = { manager, workers: [] };
              }
              if (managerToWorkers[mgId]) managerToWorkers[mgId].workers.push(worker);
            }
          }

          for (const [, { manager, workers }] of Object.entries(managerToWorkers)) {
            if (manager?.email) {
              await sendAWOLAlert(manager.email, senderEmail, {
                managerName: `${manager.firstName} ${manager.surname}`.trim(),
                awolEmployees: workers.map((w: any) => ({
                  name: `${w.firstName} ${w.surname}`,
                  id: w.id,
                  department: w.department || undefined,
                })),
                date: yesterdayStr,
              });
            }
          }
        }

        results.push({ userId: 'awol-check', name: `AWOL check: ${awolWorkers.length} flagged`, success: true });
      } catch (awolErr) {
        console.error('AWOL detection error:', awolErr);
      }

      // ── #17 Auto escalation: remind approvers of leave pending > 3 days ──
      try {
        const escalationsSent = await runEscalationReminders();
        if (escalationsSent > 0) {
          results.push({ userId: 'escalation', name: `Escalation reminders: ${escalationsSent} sent`, success: true });
        }
      } catch (escErr) {
        console.error('Escalation auto-trigger error:', escErr);
      }

      return res.json({ 
        message: `Processed ${results.filter(r => r.userId !== 'awol-check' && r.userId !== 'escalation').length} clock-out reset(s)`, 
        processed: results.filter(r => r.success && r.userId !== 'awol-check' && r.userId !== 'escalation').length,
        results 
      });
    } catch (error) {
      console.error("Auto-reset error:", error);
      return res.status(500).json({ error: "Failed to process auto clock-out" });
    }
  });

  // #17 Leave escalation: send reminders for requests pending > 3 days
  app.post("/api/leave-requests/send-escalation-reminders", requireAdmin, async (req, res) => {
    try {
      const sent = await runEscalationReminders();
      return res.json({ message: `Sent ${sent} escalation reminder(s)` });
    } catch (error) {
      console.error("Escalation reminder error:", error);
      return res.status(500).json({ error: "Failed to send escalation reminders" });
    }
  });

  // ========== AUDIT LOG ROUTES ==========

  app.get("/api/audit-logs", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000);
      const logs = await storage.getAuditLogs(limit);
      return res.json(logs);
    } catch (error) {
      console.error("Get audit logs error:", error);
      return res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ========== HR REPORTING ROUTES ==========

  // GET /api/reports/leave?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Returns leave usage summary, breakdown by type and department, sick leave flags,
  // and employees with high sick leave frequency.
  app.get("/api/reports/leave", requireAdmin, async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };

      const allRequests = await storage.getLeaveRequests();
      const allUsers = await storage.getAllUsers();

      // Build user lookup
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      // Filter to the requested date window (match on startDate)
      const filtered = allRequests.filter(r => {
        if (from && r.startDate < from) return false;
        if (to && r.startDate > to) return false;
        return true;
      });

      // Count working days for a request (reuse the same weekday counter used in submission validation)
      const countWorkingDays = (start: string, end: string): number => {
        const s = new Date(start + 'T00:00:00');
        const e = new Date(end + 'T00:00:00');
        let days = 0;
        const cur = new Date(s);
        while (cur <= e) {
          const dow = cur.getDay();
          if (dow !== 0 && dow !== 6) days++;
          cur.setDate(cur.getDate() + 1);
        }
        return days;
      };

      // Summary counts
      const summary = {
        totalRequests: filtered.length,
        approved: filtered.filter(r => r.status === 'approved').length,
        rejected: filtered.filter(r => r.status === 'rejected').length,
        cancelled: filtered.filter(r => r.status === 'cancelled').length,
        pending: filtered.filter(r => ['pending_manager', 'pending_hr', 'pending_md'].includes(r.status)).length,
      };

      // Breakdown by leave type (approved only for meaningful usage stats)
      const typeMap = new Map<string, { approved: number; totalDays: number }>();
      for (const r of filtered) {
        const entry = typeMap.get(r.leaveType) ?? { approved: 0, totalDays: 0 };
        if (r.status === 'approved') {
          entry.approved++;
          entry.totalDays += countWorkingDays(r.startDate, r.endDate);
        }
        typeMap.set(r.leaveType, entry);
      }
      const byType = Array.from(typeMap.entries())
        .map(([leaveType, data]) => ({ leaveType, ...data }))
        .sort((a, b) => b.totalDays - a.totalDays);

      // Breakdown by department (approved only)
      const deptMap = new Map<string, { approved: number; totalDays: number }>();
      for (const r of filtered.filter(r => r.status === 'approved')) {
        const user = userMap.get(r.userId);
        const dept = user?.department || 'Unknown';
        const entry = deptMap.get(dept) ?? { approved: 0, totalDays: 0 };
        entry.approved++;
        entry.totalDays += countWorkingDays(r.startDate, r.endDate);
        deptMap.set(dept, entry);
      }
      const byDepartment = Array.from(deptMap.entries())
        .map(([department, data]) => ({ department, ...data }))
        .sort((a, b) => b.totalDays - a.totalDays);

      // Sick leave: requests with med cert flags (not historic, any status except cancelled)
      const sickLeaveFlags = filtered
        .filter(r => r.leaveType === 'Sick Leave' && r.requiresMedCert && r.status !== 'cancelled')
        .map(r => {
          const user = userMap.get(r.userId);
          return {
            requestId: r.id,
            userId: r.userId,
            name: user ? `${user.firstName} ${user.surname}` : r.userId,
            department: user?.department || null,
            startDate: r.startDate,
            endDate: r.endDate,
            status: r.status,
            flags: r.medCertFlags ? JSON.parse(r.medCertFlags) : [],
            days: countWorkingDays(r.startDate, r.endDate),
          };
        });

      // Employees with high sick leave frequency: >= 3 sick leave requests in the filtered window
      const sickByEmployee = new Map<string, { count: number; totalDays: number }>();
      for (const r of filtered.filter(r => r.leaveType === 'Sick Leave' && r.status !== 'cancelled' && r.status !== 'rejected')) {
        const entry = sickByEmployee.get(r.userId) ?? { count: 0, totalDays: 0 };
        entry.count++;
        entry.totalDays += countWorkingDays(r.startDate, r.endDate);
        sickByEmployee.set(r.userId, entry);
      }
      const excessiveSickLeave = Array.from(sickByEmployee.entries())
        .filter(([, data]) => data.count >= 3)
        .map(([userId, data]) => {
          const user = userMap.get(userId);
          return {
            userId,
            name: user ? `${user.firstName} ${user.surname}` : userId,
            department: user?.department || null,
            requestCount: data.count,
            totalDays: data.totalDays,
          };
        })
        .sort((a, b) => b.requestCount - a.requestCount);

      return res.json({
        period: { from: from || null, to: to || null },
        summary,
        byType,
        byDepartment,
        sickLeaveFlags,
        excessiveSickLeave,
      });
    } catch (error) {
      console.error("Leave report error:", error);
      return res.status(500).json({ error: "Failed to generate leave report" });
    }
  });

  // ========== SETTINGS ROUTES ==========

  // Get setting by key
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }

      return res.json(setting);
    } catch (error) {
      console.error("Get setting error:", error);
      return res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  // Set setting
  app.put("/api/settings/:key", requireAdminOnly, async (req, res) => {
    try {
      const { value } = req.body;

      if (value === undefined || value === null) {
        return res.status(400).json({ error: "Value is required" });
      }

      const existing = await storage.getSetting(req.params.key);
      const setting = await storage.setSetting(req.params.key, value);

      await storage.createAuditLog({
        actorId: req.session.userId ?? null,
        action: 'update_setting',
        entityType: 'setting',
        entityId: req.params.key,
        changes: { value: { before: existing?.value ?? null, after: value } },
        description: `Changed setting "${req.params.key}"`,
      }).catch(e => console.error('[audit] log failed:', e));

      return res.json(setting);
    } catch (error) {
      console.error("Set setting error:", error);
      return res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // ========== DEPARTMENT ROUTES ==========
  
  // Get all departments
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getAllDepartments();
      return res.json(departments);
    } catch (error) {
      console.error("Get departments error:", error);
      return res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Get department by ID
  app.get("/api/departments/:id", async (req, res) => {
    try {
      const department = await storage.getDepartment(parseInt(req.params.id));
      
      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      return res.json(department);
    } catch (error) {
      console.error("Get department error:", error);
      return res.status(500).json({ error: "Failed to fetch department" });
    }
  });

  // Create department
  app.post("/api/departments", requireAdminOnly, async (req, res) => {
    try {
      const validatedData = insertDepartmentSchema.parse(req.body);
      const newDepartment = await storage.createDepartment(validatedData);
      return res.status(201).json(newDepartment);
    } catch (error: any) {
      console.error("Create department error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "Department name already exists" });
      }
      return res.status(400).json({ error: "Invalid department data" });
    }
  });

  // Update department
  app.patch("/api/departments/:id", requireAdminOnly, async (req, res) => {
    try {
      const updatedDepartment = await storage.updateDepartment(parseInt(req.params.id), req.body);
      
      if (!updatedDepartment) {
        return res.status(404).json({ error: "Department not found" });
      }

      return res.json(updatedDepartment);
    } catch (error: any) {
      console.error("Update department error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "Department name already exists" });
      }
      return res.status(500).json({ error: "Failed to update department" });
    }
  });

  // Delete department
  app.delete("/api/departments/:id", requireAdminOnly, async (req, res) => {
    try {
      const department = await storage.getDepartment(parseInt(req.params.id));
      
      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      // Check if any users are in this department
      const userCount = await storage.getUserCountByDepartment(department.name);
      
      if (userCount > 0) {
        return res.status(409).json({ 
          error: "Cannot delete department with assigned employees",
          userCount 
        });
      }

      await storage.deleteDepartment(parseInt(req.params.id));
      return res.status(204).send();
    } catch (error) {
      console.error("Delete department error:", error);
      return res.status(500).json({ error: "Failed to delete department" });
    }
  });

  // ========== USER GROUP ROUTES ==========
  
  // Get all user groups
  app.get("/api/user-groups", async (req, res) => {
    try {
      const groups = await storage.getAllUserGroups();
      return res.json(groups);
    } catch (error) {
      console.error("Get user groups error:", error);
      return res.status(500).json({ error: "Failed to fetch user groups" });
    }
  });

  // Get user group by ID
  app.get("/api/user-groups/:id", async (req, res) => {
    try {
      const group = await storage.getUserGroup(parseInt(req.params.id));
      
      if (!group) {
        return res.status(404).json({ error: "User group not found" });
      }

      return res.json(group);
    } catch (error) {
      console.error("Get user group error:", error);
      return res.status(500).json({ error: "Failed to fetch user group" });
    }
  });

  // Create user group
  app.post("/api/user-groups", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertUserGroupSchema.parse(req.body);
      const newGroup = await storage.createUserGroup(validatedData);
      return res.status(201).json(newGroup);
    } catch (error: any) {
      console.error("Create user group error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "User group name already exists" });
      }
      return res.status(400).json({ error: "Invalid user group data" });
    }
  });

  // Update user group
  app.patch("/api/user-groups/:id", requireAdmin, async (req, res) => {
    try {
      const updatedGroup = await storage.updateUserGroup(parseInt(req.params.id), req.body);
      
      if (!updatedGroup) {
        return res.status(404).json({ error: "User group not found" });
      }

      return res.json(updatedGroup);
    } catch (error: any) {
      console.error("Update user group error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "User group name already exists" });
      }
      return res.status(500).json({ error: "Failed to update user group" });
    }
  });

  // Delete user group
  app.delete("/api/user-groups/:id", requireAdmin, async (req, res) => {
    try {
      const group = await storage.getUserGroup(parseInt(req.params.id));
      
      if (!group) {
        return res.status(404).json({ error: "User group not found" });
      }

      // Check if any users are in this group
      const userCount = await storage.getUserCountByUserGroup(group.id);
      
      if (userCount > 0) {
        return res.status(409).json({ 
          error: "Cannot delete user group with assigned users",
          userCount 
        });
      }

      await storage.deleteUserGroup(parseInt(req.params.id));
      return res.status(204).send();
    } catch (error) {
      console.error("Delete user group error:", error);
      return res.status(500).json({ error: "Failed to delete user group" });
    }
  });

  // ========== EMPLOYEE TYPE ROUTES ==========

  // Get all employee types
  app.get("/api/employee-types", async (req, res) => {
    try {
      const types = await storage.getAllEmployeeTypes();
      return res.json(types);
    } catch (error) {
      console.error("Get employee types error:", error);
      return res.status(500).json({ error: "Failed to fetch employee types" });
    }
  });

  // Get single employee type
  app.get("/api/employee-types/:id", async (req, res) => {
    try {
      const type = await storage.getEmployeeType(parseInt(req.params.id));
      
      if (!type) {
        return res.status(404).json({ error: "Employee type not found" });
      }

      return res.json(type);
    } catch (error) {
      console.error("Get employee type error:", error);
      return res.status(500).json({ error: "Failed to fetch employee type" });
    }
  });

  // Create employee type
  app.post("/api/employee-types", requireAdminOnly, async (req, res) => {
    try {
      const validated = insertEmployeeTypeSchema.parse(req.body);
      const newType = await storage.createEmployeeType(validated);
      return res.status(201).json(newType);
    } catch (error: any) {
      console.error("Create employee type error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "Employee type name already exists" });
      }
      return res.status(400).json({ error: "Invalid employee type data" });
    }
  });

  // Update employee type
  app.patch("/api/employee-types/:id", requireAdminOnly, async (req, res) => {
    try {
      const updatedType = await storage.updateEmployeeType(parseInt(req.params.id), req.body);
      
      if (!updatedType) {
        return res.status(404).json({ error: "Employee type not found" });
      }

      return res.json(updatedType);
    } catch (error: any) {
      console.error("Update employee type error:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "Employee type name already exists" });
      }
      return res.status(500).json({ error: "Failed to update employee type" });
    }
  });

  // Delete employee type
  app.delete("/api/employee-types/:id", requireAdminOnly, async (req, res) => {
    try {
      const type = await storage.getEmployeeType(parseInt(req.params.id));
      
      if (!type) {
        return res.status(404).json({ error: "Employee type not found" });
      }

      await storage.deleteEmployeeType(parseInt(req.params.id));
      return res.status(204).send();
    } catch (error) {
      console.error("Delete employee type error:", error);
      return res.status(500).json({ error: "Failed to delete employee type" });
    }
  });

  // ========== LEAVE RULE ROUTES ==========

  // Get all leave rules
  app.get("/api/leave-rules", async (req, res) => {
    try {
      const rules = await storage.getAllLeaveRules();
      return res.json(rules);
    } catch (error) {
      console.error("Get leave rules error:", error);
      return res.status(500).json({ error: "Failed to fetch leave rules" });
    }
  });

  // Get single leave rule
  app.get("/api/leave-rules/:id", async (req, res) => {
    try {
      const rule = await storage.getLeaveRule(parseInt(req.params.id));
      
      if (!rule) {
        return res.status(404).json({ error: "Leave rule not found" });
      }

      return res.json(rule);
    } catch (error) {
      console.error("Get leave rule error:", error);
      return res.status(500).json({ error: "Failed to fetch leave rule" });
    }
  });

  // Create leave rule
  app.post("/api/leave-rules", requireAdminOnly, async (req, res) => {
    try {
      const validated = insertLeaveRuleSchema.parse(req.body);
      const newRule = await storage.createLeaveRule(validated);
      return res.status(201).json(newRule);
    } catch (error: any) {
      console.error("Create leave rule error:", error);
      return res.status(400).json({ error: "Invalid leave rule data" });
    }
  });

  // Update leave rule
  app.patch("/api/leave-rules/:id", requireAdminOnly, async (req, res) => {
    try {
      const updatedRule = await storage.updateLeaveRule(parseInt(req.params.id), req.body);
      
      if (!updatedRule) {
        return res.status(404).json({ error: "Leave rule not found" });
      }

      return res.json(updatedRule);
    } catch (error: any) {
      console.error("Update leave rule error:", error);
      return res.status(500).json({ error: "Failed to update leave rule" });
    }
  });

  // Delete leave rule
  app.delete("/api/leave-rules/:id", requireAdmin, async (req, res) => {
    try {
      const rule = await storage.getLeaveRule(parseInt(req.params.id));
      
      if (!rule) {
        return res.status(404).json({ error: "Leave rule not found" });
      }

      await storage.deleteLeaveRule(parseInt(req.params.id));
      return res.status(204).send();
    } catch (error) {
      console.error("Delete leave rule error:", error);
      return res.status(500).json({ error: "Failed to delete leave rule" });
    }
  });

  // ========== LEAVE RULE PHASES ROUTES ==========

  // Get all phases for a leave rule
  app.get("/api/leave-rules/:id/phases", async (req, res) => {
    try {
      const phases = await storage.getLeaveRulePhases(parseInt(req.params.id));
      return res.json(phases);
    } catch (error) {
      console.error("Get leave rule phases error:", error);
      return res.status(500).json({ error: "Failed to fetch leave rule phases" });
    }
  });

  // Create a new phase for a leave rule
  app.post("/api/leave-rules/:id/phases", requireAdmin, async (req, res) => {
    try {
      const leaveRuleId = parseInt(req.params.id);
      const validated = insertLeaveRulePhaseSchema.parse({ ...req.body, leaveRuleId });
      const newPhase = await storage.createLeaveRulePhase(validated);
      return res.status(201).json(newPhase);
    } catch (error: any) {
      console.error("Create leave rule phase error:", error);
      return res.status(400).json({ error: "Invalid leave rule phase data" });
    }
  });

  // Update a leave rule phase
  app.patch("/api/leave-rule-phases/:id", requireAdminOnly, async (req, res) => {
    try {
      const updatedPhase = await storage.updateLeaveRulePhase(parseInt(req.params.id), req.body);
      
      if (!updatedPhase) {
        return res.status(404).json({ error: "Leave rule phase not found" });
      }

      return res.json(updatedPhase);
    } catch (error: any) {
      console.error("Update leave rule phase error:", error);
      return res.status(500).json({ error: "Failed to update leave rule phase" });
    }
  });

  // Delete a leave rule phase
  app.delete("/api/leave-rule-phases/:id", requireAdminOnly, async (req, res) => {
    try {
      await storage.deleteLeaveRulePhase(parseInt(req.params.id));
      return res.status(204).send();
    } catch (error) {
      console.error("Delete leave rule phase error:", error);
      return res.status(500).json({ error: "Failed to delete leave rule phase" });
    }
  });

  // Delete all phases for a leave rule (used when replacing phases)
  app.delete("/api/leave-rules/:id/phases", requireAdmin, async (req, res) => {
    try {
      await storage.deleteAllLeaveRulePhases(parseInt(req.params.id));
      return res.status(204).send();
    } catch (error) {
      console.error("Delete all leave rule phases error:", error);
      return res.status(500).json({ error: "Failed to delete leave rule phases" });
    }
  });

  // Contract History Routes
  app.get("/api/users/:id/contract-history", async (req, res) => {
    try {
      const history = await storage.getContractHistory(req.params.id);
      return res.json(history);
    } catch (error) {
      console.error("Get contract history error:", error);
      return res.status(500).json({ error: "Failed to get contract history" });
    }
  });

  app.post("/api/users/:id/contract-history", requireAdmin, async (req, res) => {
    try {
      const history = await storage.createContractHistory({
        userId: req.params.id,
        ...req.body,
      });
      return res.status(201).json(history);
    } catch (error) {
      console.error("Create contract history error:", error);
      return res.status(500).json({ error: "Failed to create contract history" });
    }
  });

  // Resend admin credentials email
  app.post("/api/users/:id/resend-credentials", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (!user.email) {
        return res.status(400).json({ error: "User does not have an email address" });
      }
      
      const fromEmailSetting = await storage.getSetting('from_email');
      const fromEmail = fromEmailSetting?.value || 'noreply@aece.co.za';
      
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'https://factory-flow--quanga01.replit.app';
      
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await storage.createPasswordResetToken(resetToken, user.email, expiry);
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
      
      const success = await sendAdminCredentialsEmail(
        user.email,
        fromEmail,
        {
          firstName: user.firstName,
          surname: user.surname,
          email: user.email,
          password: `Please set your password using: ${resetUrl}`,
          siteUrl: baseUrl,
        }
      );
      
      if (success) {
        return res.json({ message: "Credentials email sent successfully" });
      } else {
        return res.status(500).json({ error: "Failed to send email. Email service may not be configured." });
      }
    } catch (error) {
      console.error("Resend credentials error:", error);
      return res.status(500).json({ error: "Failed to resend credentials" });
    }
  });

  // ========== GRIEVANCE ROUTES ==========
  
  // Get all grievances (admin) or user's grievances
  app.get("/api/grievances", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const grievances = await storage.getGrievances(userId);
      return res.json(grievances);
    } catch (error) {
      console.error("Get grievances error:", error);
      return res.status(500).json({ error: "Failed to get grievances" });
    }
  });

  // Get single grievance
  app.get("/api/grievances/:id", async (req, res) => {
    try {
      const grievance = await storage.getGrievance(parseInt(req.params.id));
      if (!grievance) {
        return res.status(404).json({ error: "Grievance not found" });
      }
      return res.json(grievance);
    } catch (error) {
      console.error("Get grievance error:", error);
      return res.status(500).json({ error: "Failed to get grievance" });
    }
  });

  // Create grievance
  app.post("/api/grievances", async (req, res) => {
    try {
      const validatedData = insertGrievanceSchema.parse(req.body);
      const grievance = await storage.createGrievance(validatedData);
      return res.status(201).json(grievance);
    } catch (error) {
      console.error("Create grievance error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid grievance data", details: error.errors });
      }
      return res.status(500).json({ error: "Failed to create grievance" });
    }
  });

  // Update grievance
  app.patch("/api/grievances/:id", requireAdmin, async (req, res) => {
    try {
      const grievance = await storage.updateGrievance(parseInt(req.params.id), req.body);
      if (!grievance) {
        return res.status(404).json({ error: "Grievance not found" });
      }
      return res.json(grievance);
    } catch (error) {
      console.error("Update grievance error:", error);
      return res.status(500).json({ error: "Failed to update grievance" });
    }
  });

  // Update grievance status (admin action)
  app.patch("/api/grievances/:id/status", requireAdmin, async (req, res) => {
    try {
      const { status, adminNotes, resolution } = req.body;
      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }
      const grievance = await storage.updateGrievanceStatus(
        parseInt(req.params.id),
        status,
        adminNotes,
        resolution
      );
      if (!grievance) {
        return res.status(404).json({ error: "Grievance not found" });
      }
      return res.json(grievance);
    } catch (error) {
      console.error("Update grievance status error:", error);
      return res.status(500).json({ error: "Failed to update grievance status" });
    }
  });

  // ===== PUBLIC HOLIDAYS ROUTES =====
  
  // Get all public holidays
  app.get("/api/public-holidays", async (req, res) => {
    try {
      const holidays = await storage.getAllPublicHolidays();
      return res.json(holidays);
    } catch (error) {
      console.error("Get public holidays error:", error);
      return res.status(500).json({ error: "Failed to get public holidays" });
    }
  });

  // Create public holiday
  app.post("/api/public-holidays", requireAdminOnly, async (req, res) => {
    try {
      const holiday = await storage.createPublicHoliday(req.body);
      return res.status(201).json(holiday);
    } catch (error) {
      console.error("Create public holiday error:", error);
      return res.status(500).json({ error: "Failed to create public holiday" });
    }
  });

  // Update public holiday
  app.patch("/api/public-holidays/:id", requireAdminOnly, async (req, res) => {
    try {
      const holiday = await storage.updatePublicHoliday(parseInt(req.params.id), req.body);
      if (!holiday) {
        return res.status(404).json({ error: "Public holiday not found" });
      }
      return res.json(holiday);
    } catch (error) {
      console.error("Update public holiday error:", error);
      return res.status(500).json({ error: "Failed to update public holiday" });
    }
  });

  // Delete public holiday
  app.delete("/api/public-holidays/:id", requireAdminOnly, async (req, res) => {
    try {
      await storage.deletePublicHoliday(parseInt(req.params.id));
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete public holiday error:", error);
      return res.status(500).json({ error: "Failed to delete public holiday" });
    }
  });

  // ===== NOTIFICATION ROUTES =====
  
  // Get notifications for user
  app.get("/api/notifications", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      const notifications = await storage.getNotifications(userId);
      return res.json(notifications);
    } catch (error) {
      console.error("Get notifications error:", error);
      return res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  // Get unread count
  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      const count = await storage.getUnreadNotificationCount(userId);
      return res.json({ count });
    } catch (error) {
      console.error("Get unread count error:", error);
      return res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  // Create notification
  app.post("/api/notifications", requireAdmin, async (req, res) => {
    try {
      const notification = await storage.createNotification(req.body);
      return res.status(201).json(notification);
    } catch (error) {
      console.error("Create notification error:", error);
      return res.status(500).json({ error: "Failed to create notification" });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const notification = await storage.markNotificationRead(parseInt(req.params.id));
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      return res.json(notification);
    } catch (error) {
      console.error("Mark notification read error:", error);
      return res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Mark all notifications as read
  app.patch("/api/notifications/mark-all-read", async (req, res) => {
    try {
      const userId = req.body.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      await storage.markAllNotificationsRead(userId);
      return res.json({ success: true });
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      return res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // Delete notification
  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      await storage.deleteNotification(parseInt(req.params.id));
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete notification error:", error);
      return res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // ===== FACE DESCRIPTOR ROUTES =====
  
  // Get face descriptors for a user
  app.get("/api/face-descriptors/:userId", async (req, res) => {
    try {
      const descriptors = await storage.getFaceDescriptors(req.params.userId);
      return res.json(descriptors);
    } catch (error) {
      console.error("Get face descriptors error:", error);
      return res.status(500).json({ error: "Failed to get face descriptors" });
    }
  });

  // Get all face descriptors for matching (returns userId + descriptor only)
  app.get("/api/face-descriptors", async (req, res) => {
    try {
      const descriptors = await storage.getAllFaceDescriptorsForMatching();
      return res.json(descriptors);
    } catch (error) {
      console.error("Get all face descriptors error:", error);
      return res.status(500).json({ error: "Failed to get face descriptors" });
    }
  });

  // Add a new face descriptor for a user
  app.post("/api/face-descriptors", requireAdmin, async (req, res) => {
    try {
      const { userId, descriptor, photoData, label } = req.body;
      if (!userId || !descriptor) {
        return res.status(400).json({ error: "User ID and descriptor are required" });
      }
      const newDescriptor = await storage.createFaceDescriptor({
        userId,
        descriptor,
        photoData,
        label,
      });
      return res.json(newDescriptor);
    } catch (error) {
      console.error("Create face descriptor error:", error);
      return res.status(500).json({ error: "Failed to create face descriptor" });
    }
  });

  // Delete a face descriptor
  app.delete("/api/face-descriptors/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteFaceDescriptor(parseInt(req.params.id));
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete face descriptor error:", error);
      return res.status(500).json({ error: "Failed to delete face descriptor" });
    }
  });

  // ===== BOOTSTRAP RESTORE (unauthenticated, only when DB has no users) =====

  app.post("/api/backup/bootstrap-validate", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      if (users.length > 0) {
        return res.status(403).json({ error: "Bootstrap restore is only available on an empty database", valid: false });
      }
      const { backup } = req.body;
      if (!backup || !backup.data) {
        return res.status(400).json({ error: "Invalid backup file format", valid: false });
      }
      return res.json({
        valid: true,
        version: backup.version || "unknown",
        exportedAt: backup.exportedAt || "unknown",
        counts: {
          departments: backup.data.departments?.length || 0,
          userGroups: backup.data.userGroups?.length || 0,
          employeeTypes: backup.data.employeeTypes?.length || 0,
          companies: backup.data.companies?.length || 0,
          orgPositions: backup.data.orgPositions?.length || 0,
          users: backup.data.users?.length || 0,
          leaveBalances: backup.data.leaveBalances?.length || 0,
          leaveRequests: backup.data.leaveRequests?.length || 0,
          leaveRules: backup.data.leaveRules?.length || 0,
          leaveRulePhases: backup.data.leaveRulePhases?.length || 0,
          attendanceRecords: backup.data.attendanceRecords?.length || 0,
          contractHistory: backup.data.contractHistory?.length || 0,
          grievances: backup.data.grievances?.length || 0,
          publicHolidays: backup.data.publicHolidays?.length || 0,
          notifications: backup.data.notifications?.length || 0,
          settings: backup.data.settings?.length || 0,
          faceDescriptors: backup.data.faceDescriptors?.length || 0,
        }
      });
    } catch (error) {
      console.error("Bootstrap validate error:", error);
      return res.status(400).json({ error: "Invalid backup file", valid: false });
    }
  });

  app.post("/api/backup/bootstrap-import", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      if (users.length > 0) {
        return res.status(403).json({ error: "Bootstrap restore is only available on an empty database" });
      }
      const { backup } = req.body;
      if (!backup || !backup.data) {
        return res.status(400).json({ error: "Invalid backup file format" });
      }

      const importedCounts: Record<string, number> = {};

      if (backup.data.departments?.length) {
        for (const dept of backup.data.departments) {
          try { const e = await storage.getDepartment(dept.id); if (!e) await storage.createDepartment({ name: dept.name, description: dept.description }); } catch (e) {}
        }
        importedCounts.departments = backup.data.departments.length;
      }
      if (backup.data.userGroups?.length) {
        for (const group of backup.data.userGroups) {
          try { const e = await storage.getUserGroup(group.id); if (!e) await storage.createUserGroup({ name: group.name, description: group.description }); } catch (e) {}
        }
        importedCounts.userGroups = backup.data.userGroups.length;
      }
      if (backup.data.employeeTypes?.length) {
        for (const type of backup.data.employeeTypes) {
          try { const e = await storage.getEmployeeType(type.id); if (!e) await storage.createEmployeeType({ name: type.name, description: type.description, leaveLabel: type.leaveLabel, hasLeaveEntitlement: type.hasLeaveEntitlement, isDefault: type.isDefault, isPermanent: type.isPermanent }); } catch (e) {}
        }
        importedCounts.employeeTypes = backup.data.employeeTypes.length;
      }
      if (backup.data.companies?.length) {
        const existing = await storage.getAllCompanies();
        const existingNames = new Set(existing.map((c: any) => c.name));
        for (const company of backup.data.companies) {
          try { if (!existingNames.has(company.name)) await storage.createCompany({ name: company.name, registrationNumber: company.registrationNumber, description: company.description }); } catch (e) {}
        }
        importedCounts.companies = backup.data.companies.length;
      }
      if (backup.data.orgPositions?.length) {
        const sorted = [...backup.data.orgPositions].sort((a: any, b: any) => a.id - b.id);
        const existing = await storage.getAllOrgPositions();
        const existingIds = new Set(existing.map((p: any) => p.id));
        for (const pos of sorted) {
          try { if (!existingIds.has(pos.id)) await storage.createOrgPosition({ title: pos.title, department: pos.department, parentPositionId: pos.parentPositionId, sortOrder: pos.sortOrder, isOutsourced: pos.isOutsourced, tier: pos.tier }); } catch (e) {}
        }
        importedCounts.orgPositions = backup.data.orgPositions.length;
      }
      if (backup.data.users?.length) {
        for (const user of backup.data.users) {
          try { const e = await storage.getUser(user.id); if (!e) await storage.createUser(user); } catch (e) {}
        }
        importedCounts.users = backup.data.users.length;
      }
      if (backup.data.leaveBalances?.length) {
        for (const balance of backup.data.leaveBalances) {
          try { await storage.createLeaveBalance({ userId: balance.userId, leaveType: balance.leaveType, total: balance.total, taken: balance.taken, pending: balance.pending, carryOverDays: balance.carryOverDays ?? 0 }); } catch (e) {}
        }
        importedCounts.leaveBalances = backup.data.leaveBalances.length;
      }
      if (backup.data.leaveRequests?.length) {
        for (const request of backup.data.leaveRequests) {
          try { await storage.createLeaveRequest(request); } catch (e) {}
        }
        importedCounts.leaveRequests = backup.data.leaveRequests.length;
      }
      if (backup.data.leaveRules?.length) {
        for (const rule of backup.data.leaveRules) {
          try { await storage.createLeaveRule(rule); } catch (e) {}
        }
        importedCounts.leaveRules = backup.data.leaveRules.length;
      }
      if (backup.data.leaveRulePhases?.length) {
        for (const phase of backup.data.leaveRulePhases) {
          try { await storage.createLeaveRulePhase(phase); } catch (e) {}
        }
        importedCounts.leaveRulePhases = backup.data.leaveRulePhases.length;
      }
      if (backup.data.attendanceRecords?.length) {
        for (const record of backup.data.attendanceRecords) {
          try { await storage.createAttendanceRecord(record); } catch (e) {}
        }
        importedCounts.attendanceRecords = backup.data.attendanceRecords.length;
      }
      if (backup.data.contractHistory?.length) {
        for (const entry of backup.data.contractHistory) {
          try { await storage.createContractHistory(entry); } catch (e) {}
        }
        importedCounts.contractHistory = backup.data.contractHistory.length;
      }
      if (backup.data.grievances?.length) {
        for (const grievance of backup.data.grievances) {
          try { await storage.createGrievance(grievance); } catch (e) {}
        }
        importedCounts.grievances = backup.data.grievances.length;
      }
      if (backup.data.publicHolidays?.length) {
        for (const holiday of backup.data.publicHolidays) {
          try { await storage.createPublicHoliday(holiday); } catch (e) {}
        }
        importedCounts.publicHolidays = backup.data.publicHolidays.length;
      }
      if (backup.data.settings?.length) {
        for (const setting of backup.data.settings) {
          try { await storage.upsertSetting(setting.key, setting.value); } catch (e) {}
        }
        importedCounts.settings = backup.data.settings.length;
      }
      if (backup.data.faceDescriptors?.length) {
        for (const fd of backup.data.faceDescriptors) {
          try { await storage.createFaceDescriptor({ userId: fd.userId, descriptor: fd.descriptor, photoData: fd.photoData ?? null, label: fd.label ?? null }); } catch (e) {}
        }
        importedCounts.faceDescriptors = backup.data.faceDescriptors.length;
      }

      return res.json({ success: true, message: "Bootstrap restore completed", importedCounts });
    } catch (error) {
      console.error("Bootstrap import error:", error);
      return res.status(500).json({ error: "Bootstrap restore failed" });
    }
  });

  // ===== BACKUP ROUTES =====
  
  // Export full database backup
  app.get("/api/backup/export", requireAdminOnly, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const departments = await storage.getAllDepartments();
      const userGroups = await storage.getAllUserGroups();
      const employeeTypes = await storage.getAllEmployeeTypes();
      const companies = await storage.getAllCompanies();
      const orgPositions = await storage.getAllOrgPositions();
      const leaveBalances = await storage.getAllLeaveBalances();
      const leaveRequests = await storage.getLeaveRequests();
      const leaveRules = await storage.getAllLeaveRules();
      const leaveRulePhases = await storage.getAllLeaveRulePhases();
      const attendanceRecords = await storage.getAllAttendanceRecords();
      const contractHistory = await storage.getAllContractHistory();
      const grievances = await storage.getAllGrievances();
      const publicHolidays = await storage.getAllPublicHolidays();
      const notifications = await storage.getAllNotifications();
      const settings = await storage.getAllSettings();
      const faceDescriptors = await storage.getAllFaceDescriptorsForMatching();

      const backup = {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        data: {
          departments,
          userGroups,
          employeeTypes,
          companies,
          orgPositions,
          users,
          leaveBalances,
          leaveRequests,
          leaveRules,
          leaveRulePhases,
          attendanceRecords,
          contractHistory,
          grievances,
          publicHolidays,
          notifications,
          settings,
          faceDescriptors,
        }
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="aece-backup-${new Date().toISOString().split('T')[0]}.json"`);
      return res.json(backup);
    } catch (error) {
      console.error("Export backup error:", error);
      return res.status(500).json({ error: "Failed to export backup" });
    }
  });
  
  // Import database backup
  app.post("/api/backup/import", requireAdminOnly, async (req, res) => {
    try {
      const { backup, options } = req.body;
      
      if (!backup || !backup.data) {
        return res.status(400).json({ error: "Invalid backup file format" });
      }
      
      const clearExisting = options?.clearExisting ?? false;
      const importedCounts: Record<string, number> = {};
      
      // Import in dependency order — referenced tables before referencing tables.
      // All inserts are additive: existing records (matched by natural key or id) are skipped.

      // 1. Departments
      if (backup.data.departments?.length) {
        for (const dept of backup.data.departments) {
          try { const e = await storage.getDepartment(dept.id); if (!e) await storage.createDepartment({ name: dept.name, description: dept.description }); } catch (e) {}
        }
        importedCounts.departments = backup.data.departments.length;
      }

      // 2. User Groups
      if (backup.data.userGroups?.length) {
        for (const group of backup.data.userGroups) {
          try { const e = await storage.getUserGroup(group.id); if (!e) await storage.createUserGroup({ name: group.name, description: group.description }); } catch (e) {}
        }
        importedCounts.userGroups = backup.data.userGroups.length;
      }

      // 3. Employee Types
      if (backup.data.employeeTypes?.length) {
        for (const type of backup.data.employeeTypes) {
          try { const e = await storage.getEmployeeType(type.id); if (!e) await storage.createEmployeeType({ name: type.name, description: type.description, leaveLabel: type.leaveLabel, hasLeaveEntitlement: type.hasLeaveEntitlement, isDefault: type.isDefault, isPermanent: type.isPermanent }); } catch (e) {}
        }
        importedCounts.employeeTypes = backup.data.employeeTypes.length;
      }

      // 4. Companies
      if (backup.data.companies?.length) {
        const existing = await storage.getAllCompanies();
        const existingNames = new Set(existing.map((c: any) => c.name));
        for (const company of backup.data.companies) {
          try { if (!existingNames.has(company.name)) await storage.createCompany({ name: company.name, registrationNumber: company.registrationNumber, description: company.description }); } catch (e) {}
        }
        importedCounts.companies = backup.data.companies.length;
      }

      // 5. Org Positions (insert in order: parents before children, sort by id)
      if (backup.data.orgPositions?.length) {
        const sorted = [...backup.data.orgPositions].sort((a: any, b: any) => a.id - b.id);
        const existing = await storage.getAllOrgPositions();
        const existingIds = new Set(existing.map((p: any) => p.id));
        for (const pos of sorted) {
          try { if (!existingIds.has(pos.id)) await storage.createOrgPosition({ title: pos.title, department: pos.department, parentPositionId: pos.parentPositionId, sortOrder: pos.sortOrder, isOutsourced: pos.isOutsourced, tier: pos.tier }); } catch (e) {}
        }
        importedCounts.orgPositions = backup.data.orgPositions.length;
      }

      // 6. Users
      if (backup.data.users?.length) {
        for (const user of backup.data.users) {
          try { const e = await storage.getUser(user.id); if (!e) await storage.createUser(user); } catch (e) {}
        }
        importedCounts.users = backup.data.users.length;
      }

      // 7. Leave Balances
      if (backup.data.leaveBalances?.length) {
        for (const balance of backup.data.leaveBalances) {
          try { await storage.createLeaveBalance({ userId: balance.userId, leaveType: balance.leaveType, total: balance.total, taken: balance.taken, pending: balance.pending, carryOverDays: balance.carryOverDays ?? 0 }); } catch (e) {}
        }
        importedCounts.leaveBalances = backup.data.leaveBalances.length;
      }

      // 8. Leave Requests
      if (backup.data.leaveRequests?.length) {
        for (const request of backup.data.leaveRequests) {
          try { await storage.createLeaveRequest(request); } catch (e) {}
        }
        importedCounts.leaveRequests = backup.data.leaveRequests.length;
      }

      // 9. Leave Rules and Phases
      if (backup.data.leaveRules?.length) {
        for (const rule of backup.data.leaveRules) {
          try { await storage.createLeaveRule(rule); } catch (e) {}
        }
        importedCounts.leaveRules = backup.data.leaveRules.length;
      }
      if (backup.data.leaveRulePhases?.length) {
        for (const phase of backup.data.leaveRulePhases) {
          try { await storage.createLeaveRulePhase(phase); } catch (e) {}
        }
        importedCounts.leaveRulePhases = backup.data.leaveRulePhases.length;
      }

      // 10. Attendance Records
      if (backup.data.attendanceRecords?.length) {
        for (const record of backup.data.attendanceRecords) {
          try { await storage.createAttendanceRecord(record); } catch (e) {}
        }
        importedCounts.attendanceRecords = backup.data.attendanceRecords.length;
      }

      // 11. Contract History
      if (backup.data.contractHistory?.length) {
        for (const entry of backup.data.contractHistory) {
          try { await storage.createContractHistory(entry); } catch (e) {}
        }
        importedCounts.contractHistory = backup.data.contractHistory.length;
      }

      // 12. Grievances
      if (backup.data.grievances?.length) {
        for (const grievance of backup.data.grievances) {
          try { await storage.createGrievance(grievance); } catch (e) {}
        }
        importedCounts.grievances = backup.data.grievances.length;
      }

      // 13. Public Holidays
      if (backup.data.publicHolidays?.length) {
        for (const holiday of backup.data.publicHolidays) {
          try { await storage.createPublicHoliday(holiday); } catch (e) {}
        }
        importedCounts.publicHolidays = backup.data.publicHolidays.length;
      }

      // 14. Notifications
      if (backup.data.notifications?.length) {
        for (const notif of backup.data.notifications) {
          try { await storage.createNotification(notif); } catch (e) {}
        }
        importedCounts.notifications = backup.data.notifications.length;
      }

      // 15. Settings
      if (backup.data.settings?.length) {
        for (const setting of backup.data.settings) {
          try { await storage.upsertSetting(setting.key, setting.value); } catch (e) {}
        }
        importedCounts.settings = backup.data.settings.length;
      }

      // 16. Face Descriptors
      if (backup.data.faceDescriptors?.length) {
        for (const fd of backup.data.faceDescriptors) {
          try { await storage.createFaceDescriptor({ userId: fd.userId, descriptor: fd.descriptor, photoData: fd.photoData ?? null, label: fd.label ?? null }); } catch (e) {}
        }
        importedCounts.faceDescriptors = backup.data.faceDescriptors.length;
      }

      return res.json({
        success: true,
        message: "Backup imported successfully",
        importedCounts,
      });
    } catch (error) {
      console.error("Import backup error:", error);
      return res.status(500).json({ error: "Failed to import backup" });
    }
  });
  
  // Get backup info (for validation)
  app.post("/api/backup/validate", requireAdminOnly, async (req, res) => {
    try {
      const { backup } = req.body;
      
      if (!backup || !backup.data) {
        return res.status(400).json({ error: "Invalid backup file format", valid: false });
      }
      
      const info = {
        valid: true,
        version: backup.version || "unknown",
        exportedAt: backup.exportedAt || "unknown",
        counts: {
          departments: backup.data.departments?.length || 0,
          userGroups: backup.data.userGroups?.length || 0,
          employeeTypes: backup.data.employeeTypes?.length || 0,
          companies: backup.data.companies?.length || 0,
          orgPositions: backup.data.orgPositions?.length || 0,
          users: backup.data.users?.length || 0,
          leaveBalances: backup.data.leaveBalances?.length || 0,
          leaveRequests: backup.data.leaveRequests?.length || 0,
          leaveRules: backup.data.leaveRules?.length || 0,
          leaveRulePhases: backup.data.leaveRulePhases?.length || 0,
          attendanceRecords: backup.data.attendanceRecords?.length || 0,
          contractHistory: backup.data.contractHistory?.length || 0,
          grievances: backup.data.grievances?.length || 0,
          publicHolidays: backup.data.publicHolidays?.length || 0,
          notifications: backup.data.notifications?.length || 0,
          settings: backup.data.settings?.length || 0,
          faceDescriptors: backup.data.faceDescriptors?.length || 0,
        }
      };
      
      return res.json(info);
    } catch (error) {
      console.error("Validate backup error:", error);
      return res.status(400).json({ error: "Invalid backup file", valid: false });
    }
  });

  // ===== DASHBOARD STATS ROUTE =====
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const leaveRequests = await storage.getLeaveRequests();
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      const attendanceRecords = await storage.getAllAttendanceRecords(startOfDay, endOfDay);
      const holidays = await storage.getAllPublicHolidays();
      
      const todayDateStr = today.toISOString().split('T')[0];
      // Active employees (not terminated, not excluded, and already started)
      const activeEmployees = users.filter((u: any) => !u.terminationDate && !u.exclude && (!u.startDate || u.startDate <= todayDateStr));
      const eligibleForAttendance = activeEmployees.filter((u: any) => u.attendanceRequired !== false && (u.role === 'worker' || u.role === 'manager'));
      
      // Clocked in today
      const clockedInUsers = new Set<string>();
      const clockedOutUsers = new Set<string>();
      attendanceRecords.forEach((r: any) => {
        if (r.type === 'in') clockedInUsers.add(r.userId);
        if (r.type === 'out') clockedOutUsers.add(r.userId);
      });
      const currentlyClockedIn = Array.from(clockedInUsers).filter(
        userId => !clockedOutUsers.has(userId)
      ).length;
      
      // Pending leave requests
      const pendingLeaves = leaveRequests.filter((l: any) => 
        l.status === 'pending_manager' || l.status === 'pending_hr' || l.status === 'pending_md'
      );
      
      // Today's approved leaves
      const todayStr = today.toISOString().split('T')[0];
      const onLeaveToday = leaveRequests.filter((l: any) => 
        l.status === 'approved' && l.startDate <= todayStr && l.endDate >= todayStr
      );
      
      // Upcoming birthdays (next 30 days) - based on user birth dates if available
      const upcomingBirthdays: { user: any; date: string }[] = [];
      
      // Next public holiday
      const upcomingHolidays = holidays.filter((h: any) => h.date >= todayStr).slice(0, 3);
      
      return res.json({
        totalEmployees: activeEmployees.length,
        eligibleForAttendance: eligibleForAttendance.length,
        currentlyClockedIn,
        pendingLeaveRequests: pendingLeaves.length,
        onLeaveToday: onLeaveToday.length,
        upcomingBirthdays,
        upcomingHolidays,
      });
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      return res.status(500).json({ error: "Failed to get dashboard stats" });
    }
  });

  // ========== ORG POSITION ROUTES ==========

  app.get("/api/org-positions", async (req, res) => {
    try {
      const positions = await storage.getAllOrgPositions();
      return res.json(positions);
    } catch (error) {
      console.error("Get org positions error:", error);
      return res.status(500).json({ error: "Failed to get org positions" });
    }
  });

  app.post("/api/org-positions", requireAdminOnly, async (req, res) => {
    try {
      const position = await storage.createOrgPosition(req.body);
      return res.status(201).json(position);
    } catch (error) {
      console.error("Create org position error:", error);
      return res.status(500).json({ error: "Failed to create org position" });
    }
  });

  app.patch("/api/org-positions/:id", requireAdminOnly, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const position = await storage.updateOrgPosition(id, req.body);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }
      return res.json(position);
    } catch (error) {
      console.error("Update org position error:", error);
      return res.status(500).json({ error: "Failed to update org position" });
    }
  });

  app.delete("/api/org-positions/:id", requireAdminOnly, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteOrgPosition(id);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete org position error:", error);
      return res.status(500).json({ error: "Failed to delete org position" });
    }
  });

  // ── Companies ─────────────────────────────────────────────────────────────

  app.get("/api/companies", async (req, res) => {
    try {
      return res.json(await storage.getAllCompanies());
    } catch (error) {
      console.error("Get companies error:", error);
      return res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.post("/api/companies", requireAdminOnly, async (req, res) => {
    try {
      const { name, registrationNumber, description } = req.body;
      if (!name) return res.status(400).json({ error: "Company name is required" });
      const company = await storage.createCompany({ name, registrationNumber: registrationNumber || null, description: description || null });
      return res.status(201).json(company);
    } catch (error: any) {
      console.error("Create company error:", error);
      if (error.code === '23505') return res.status(409).json({ error: "A company with that name already exists" });
      return res.status(500).json({ error: "Failed to create company" });
    }
  });

  app.patch("/api/companies/:id", requireAdminOnly, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, registrationNumber, description } = req.body;
      const updated = await storage.updateCompany(id, { name, registrationNumber, description });
      if (!updated) return res.status(404).json({ error: "Company not found" });
      return res.json(updated);
    } catch (error: any) {
      console.error("Update company error:", error);
      if (error.code === '23505') return res.status(409).json({ error: "A company with that name already exists" });
      return res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.delete("/api/companies/:id", requireAdminOnly, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCompany(id);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete company error:", error);
      return res.status(500).json({ error: "Failed to delete company" });
    }
  });

  // ── External API ──────────────────────────────────────────────────────────

  // Helper: get the stored API key (or generate + store one on first call)
  async function getOrCreateExternalApiKey(): Promise<string> {
    const existing = await storage.getSetting('external_api_key');
    if (existing?.value) return existing.value;
    const newKey = crypto.randomBytes(32).toString('hex');
    await storage.setSetting('external_api_key', newKey);
    return newKey;
  }

  // Admin: view current external API key
  app.get("/api/admin/external-api-key", requireAdminOnly, async (req, res) => {
    try {
      const key = await getOrCreateExternalApiKey();
      return res.json({ key });
    } catch (error) {
      console.error("Get external API key error:", error);
      return res.status(500).json({ error: "Failed to retrieve API key" });
    }
  });

  // Admin: regenerate external API key
  app.post("/api/admin/external-api-key/regenerate", requireAdminOnly, async (req, res) => {
    try {
      const newKey = crypto.randomBytes(32).toString('hex');
      await storage.setSetting('external_api_key', newKey);
      return res.json({ key: newKey });
    } catch (error) {
      console.error("Regenerate external API key error:", error);
      return res.status(500).json({ error: "Failed to regenerate API key" });
    }
  });

  // External: GET /api/external/employees — returns all employee records
  // Requires header:  X-API-Key: <key>
  app.get("/api/external/employees", async (req, res) => {
    try {
      const providedKey = req.headers['x-api-key'] as string | undefined;
      if (!providedKey) {
        return res.status(401).json({ error: "Missing X-API-Key header" });
      }
      const storedKey = await storage.getSetting('external_api_key');
      if (!storedKey?.value || providedKey !== storedKey.value) {
        return res.status(403).json({ error: "Invalid API key" });
      }

      const [allUsers, departments, employeeTypes, allCompanies] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllDepartments(),
        storage.getAllEmployeeTypes(),
        storage.getAllCompanies(),
      ]);

      const deptMap = new Map(departments.map(d => [d.id, d.name]));
      const typeMap = new Map(employeeTypes.map(t => [t.id, t.name]));
      const companyMap = new Map(allCompanies.map(c => [c.id, c.name]));

      const employees = allUsers.map(u => {
        // Strip sensitive / internal fields
        const { faceDescriptor, password, ...safe } = u as any;
        return {
          ...safe,
          departmentName: u.department ?? null,
          employeeTypeName: (u as any).employeeTypeId ? (typeMap.get((u as any).employeeTypeId) ?? null) : null,
          companyName: (u as any).companyId ? (companyMap.get((u as any).companyId) ?? null) : null,
        };
      });

      return res.json({
        count: employees.length,
        generatedAt: new Date().toISOString(),
        employees,
      });
    } catch (error) {
      console.error("External employees API error:", error);
      return res.status(500).json({ error: "Failed to fetch employee data" });
    }
  });

  return httpServer;
}
