import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import * as schema from "@shared/schema";
import { calculateFirstMonthAccrual } from "./bcea";
import type {
  User,
  InsertUser,
  LeaveBalance,
  InsertLeaveBalance,
  LeaveRequest,
  InsertLeaveRequest,
  AttendanceRecord,
  InsertAttendanceRecord,
  Setting,
  InsertSetting,
  Department,
  InsertDepartment,
  UserGroup,
  InsertUserGroup,
  EmployeeType,
  InsertEmployeeType,
  LeaveRule,
  InsertLeaveRule,
  LeaveRulePhase,
  InsertLeaveRulePhase,
  ContractHistory,
  InsertContractHistory,
  Grievance,
  InsertGrievance,
  PublicHoliday,
  InsertPublicHoliday,
  Notification,
  InsertNotification,
  FaceDescriptor,
  InsertFaceDescriptor,
  OrgPosition,
  InsertOrgPosition,
  Company,
  InsertCompany,
  AuditLog,
  InsertAuditLog,
} from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool errors to prevent app crashes from database connection issues
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

const db = drizzle(pool, { schema });

export { pool };

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  changeUserId(oldId: string, newId: string): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

  // Leave balance operations
  getLeaveBalances(userId: string): Promise<LeaveBalance[]>;
  getLeaveBalance(id: number): Promise<LeaveBalance | undefined>;
  getAllLeaveBalances(): Promise<LeaveBalance[]>;
  createLeaveBalance(balance: InsertLeaveBalance): Promise<LeaveBalance>;
  updateLeaveBalance(id: number, balance: Partial<InsertLeaveBalance>): Promise<LeaveBalance | undefined>;

  // Leave request operations
  getLeaveRequests(userId?: string): Promise<LeaveRequest[]>;
  getLeaveRequestsByStatus(status: string | string[]): Promise<LeaveRequest[]>;
  getLeaveRequest(id: number): Promise<LeaveRequest | undefined>;
  createLeaveRequest(request: InsertLeaveRequest): Promise<LeaveRequest>;
  updateLeaveRequestStatus(id: number, status: string, adminNotes?: string): Promise<LeaveRequest | undefined>;
  updateHistoricLeaveRequest(id: number, fields: Partial<{ userId: string; leaveType: string; startDate: string; endDate: string; reason: string; authorizedBy: string | null; referenceNumber: string | null; adminNotes: string | null; }>): Promise<LeaveRequest | undefined>;
  deleteLeaveRequest(id: number): Promise<boolean>;
  
  // Approval workflow operations
  updateManagerDecision(id: number, approverId: string, decision: 'approved' | 'rejected', notes?: string, skipHR?: boolean): Promise<LeaveRequest | undefined>;
  updateHRDecision(id: number, approverId: string, decision: 'approved' | 'rejected', notes?: string): Promise<LeaveRequest | undefined>;
  updateMDDecision(id: number, approverId: string, decision: 'approved' | 'rejected', notes?: string, bypassHR?: boolean): Promise<LeaveRequest | undefined>;
  
  // Attendance operations
  getAttendanceRecords(userId: string, limit?: number, startDate?: Date, endDate?: Date): Promise<AttendanceRecord[]>;
  getAllAttendanceRecords(startDate?: Date, endDate?: Date): Promise<AttendanceRecord[]>;
  getTodayLatestAttendance(userId: string): Promise<AttendanceRecord | undefined>;
  getLatestAttendance(userId: string): Promise<AttendanceRecord | undefined>;
  getUserClockInStatus(userId: string): Promise<{ isClockedIn: boolean; lastRecord: AttendanceRecord | null }>;
  getUsersNotClockedOut(beforeDate: Date): Promise<{ user: User; lastClockIn: AttendanceRecord }[]>;
  createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord>;
  createBulkAttendanceRecords(records: { userId: string; type: string; timestamp: Date; method?: string; context?: string }[]): Promise<AttendanceRecord[]>;
  createSystemAutoClockOut(userId: string, timestamp: Date): Promise<AttendanceRecord>;
  updateAttendanceRecord(id: number, data: { timestamp?: Date; type?: string; isInfringement?: string | null; infringementReason?: string | null }): Promise<AttendanceRecord | undefined>;
  deleteAttendanceRecord(id: number): Promise<boolean>;
  
  // Settings operations
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;
  upsertSetting(key: string, value: string): Promise<Setting>;

  // Department operations
  getAllDepartments(): Promise<Department[]>;
  getDepartment(id: number): Promise<Department | undefined>;
  createDepartment(department: InsertDepartment): Promise<Department>;
  updateDepartment(id: number, department: Partial<InsertDepartment>): Promise<Department | undefined>;
  deleteDepartment(id: number): Promise<boolean>;
  getUserCountByDepartment(departmentName: string): Promise<number>;

  // User Group operations
  getAllUserGroups(): Promise<UserGroup[]>;
  getUserGroup(id: number): Promise<UserGroup | undefined>;
  createUserGroup(group: InsertUserGroup): Promise<UserGroup>;
  updateUserGroup(id: number, group: Partial<InsertUserGroup>): Promise<UserGroup | undefined>;
  deleteUserGroup(id: number): Promise<boolean>;
  getUserCountByUserGroup(groupId: number): Promise<number>;

  // Employee Type operations
  getAllEmployeeTypes(): Promise<EmployeeType[]>;
  getEmployeeType(id: number): Promise<EmployeeType | undefined>;
  getDefaultEmployeeType(): Promise<EmployeeType | undefined>;
  createEmployeeType(type: InsertEmployeeType): Promise<EmployeeType>;
  updateEmployeeType(id: number, type: Partial<InsertEmployeeType>): Promise<EmployeeType | undefined>;
  deleteEmployeeType(id: number): Promise<boolean>;

  // Leave Rule operations
  getAllLeaveRules(): Promise<LeaveRule[]>;
  getLeaveRule(id: number): Promise<LeaveRule | undefined>;
  createLeaveRule(rule: InsertLeaveRule): Promise<LeaveRule>;
  updateLeaveRule(id: number, rule: Partial<InsertLeaveRule>): Promise<LeaveRule | undefined>;
  deleteLeaveRule(id: number): Promise<boolean>;

  // Leave Rule Phase operations
  getLeaveRulePhases(leaveRuleId: number): Promise<LeaveRulePhase[]>;
  getAllLeaveRulePhases(): Promise<LeaveRulePhase[]>;
  createLeaveRulePhase(phase: InsertLeaveRulePhase): Promise<LeaveRulePhase>;
  updateLeaveRulePhase(id: number, phase: Partial<InsertLeaveRulePhase>): Promise<LeaveRulePhase | undefined>;
  deleteLeaveRulePhase(id: number): Promise<boolean>;
  deleteAllLeaveRulePhases(leaveRuleId: number): Promise<boolean>;

  // Contract History operations
  getContractHistory(userId: string): Promise<ContractHistory[]>;
  getAllContractHistory(): Promise<ContractHistory[]>;
  createContractHistory(history: InsertContractHistory): Promise<ContractHistory>;

  // Grievance operations
  getGrievances(userId?: string): Promise<Grievance[]>;
  getAllGrievances(): Promise<Grievance[]>;
  getGrievance(id: number): Promise<Grievance | undefined>;
  createGrievance(grievance: InsertGrievance): Promise<Grievance>;
  updateGrievance(id: number, grievance: Partial<InsertGrievance>): Promise<Grievance | undefined>;
  updateGrievanceStatus(id: number, status: string, adminNotes?: string, resolution?: string): Promise<Grievance | undefined>;

  // Company operations
  getAllCompanies(): Promise<Company[]>;
  getCompany(id: number): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: number): Promise<boolean>;

  // Public Holiday operations
  getAllPublicHolidays(): Promise<PublicHoliday[]>;
  getPublicHoliday(id: number): Promise<PublicHoliday | undefined>;
  createPublicHoliday(holiday: InsertPublicHoliday): Promise<PublicHoliday>;
  updatePublicHoliday(id: number, holiday: Partial<InsertPublicHoliday>): Promise<PublicHoliday | undefined>;
  deletePublicHoliday(id: number): Promise<boolean>;

  // Notification operations
  getNotifications(userId: string): Promise<Notification[]>;
  getAllNotifications(): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: number): Promise<boolean>;

  // Face Descriptor operations (for multiple face photos per user)
  getFaceDescriptors(userId: string): Promise<FaceDescriptor[]>;
  getAllFaceDescriptorsForMatching(): Promise<{ userId: string; descriptor: string }[]>;
  createFaceDescriptor(data: InsertFaceDescriptor): Promise<FaceDescriptor>;
  deleteFaceDescriptor(id: number): Promise<boolean>;

  // Org Position operations
  getAllOrgPositions(): Promise<OrgPosition[]>;
  getOrgPosition(id: number): Promise<OrgPosition | undefined>;
  createOrgPosition(position: InsertOrgPosition): Promise<OrgPosition>;
  updateOrgPosition(id: number, position: Partial<InsertOrgPosition>): Promise<OrgPosition | undefined>;
  deleteOrgPosition(id: number): Promise<boolean>;

  // Password Reset Token operations
  createPasswordResetToken(token: string, email: string, expiry: Date): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ email: string; expiry: Date } | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;

  // Audit log operations
  createAuditLog(entry: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
}

export class DrizzleStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const users = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return users[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const users = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return users[0];
  }

  async getUserByNationalId(nationalId: string): Promise<User | undefined> {
    const users = await db.select().from(schema.users).where(eq(schema.users.nationalId, nationalId));
    return users[0];
  }

  async getUserByIdOrNationalId(idOrNationalId: string): Promise<User | undefined> {
    // Try company ID, then national ID, then email
    let user = await this.getUser(idOrNationalId);
    if (user) return user;
    user = await this.getUserByNationalId(idOrNationalId);
    if (user) return user;
    user = await this.getUserByEmail(idOrNationalId);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(schema.users);
  }

  async createUser(user: InsertUser): Promise<User> {
    // Auto-populate the legacy 'name' field from firstName + surname
    const userWithName = {
      ...user,
      name: `${user.firstName} ${user.surname}`,
    };
    const [newUser] = await db.insert(schema.users).values(userWithName).returning();
    
    // Create default leave balances for new users using SA BCEA calculations
    if (user.role === 'worker') {
      // Calculate pro-rated entitlements based on start date (SA BCEA)
      const ent = user.startDate
        ? calculateFirstMonthAccrual(user.startDate)
        : { annualLeave: 21, sickLeave: 30, familyResponsibility: 3 };

      const { annualLeave, sickLeave, familyResponsibility } = ent;

      await this.createLeaveBalance({
        userId: newUser.id,
        leaveType: 'Annual Leave',
        total: annualLeave,
        taken: 0,
        pending: 0,
      });
      await this.createLeaveBalance({
        userId: newUser.id,
        leaveType: 'Sick Leave',
        total: sickLeave,
        taken: 0,
        pending: 0,
      });
      await this.createLeaveBalance({
        userId: newUser.id,
        leaveType: 'Family Responsibility',
        total: familyResponsibility,
        taken: 0,
        pending: 0,
      });
    }
    
    return newUser;
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(schema.users)
      .set(user)
      .where(eq(schema.users.id, id))
      .returning();
    return updatedUser;
  }

  async changeUserId(oldId: string, newId: string): Promise<User | undefined> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert new user row (copy of old with new ID)
      await client.query(`
        INSERT INTO users (id, name, email, password, role, department, photo_url, created_at,
          face_descriptor, first_name, surname, nickname, mobile, home_address, gender,
          user_group_id, employee_type_id, national_id, tax_number, next_of_kin,
          emergency_number, popia_waiver_url, start_date, contract_end_date, termination_date,
          manager_id, admin_role, has_full_admin_access, exclude, attendance_required,
          second_manager_id, org_position_id)
        SELECT $1, name, email, password, role, department, photo_url, created_at,
          face_descriptor, first_name, surname, nickname, mobile, home_address, gender,
          user_group_id, employee_type_id, national_id, tax_number, next_of_kin,
          emergency_number, popia_waiver_url, start_date, contract_end_date, termination_date,
          manager_id, admin_role, has_full_admin_access, exclude, attendance_required,
          second_manager_id, org_position_id
        FROM users WHERE id = $2
      `, [newId, oldId]);

      // 2. Migrate all FK references in child tables
      await client.query(`UPDATE attendance_records SET user_id = $1 WHERE user_id = $2`, [newId, oldId]);
      await client.query(`UPDATE contract_history SET user_id = $1 WHERE user_id = $2`, [newId, oldId]);
      await client.query(`UPDATE contract_history SET performed_by = $1 WHERE performed_by = $2`, [newId, oldId]);
      await client.query(`UPDATE face_descriptors SET user_id = $1 WHERE user_id = $2`, [newId, oldId]);
      await client.query(`UPDATE grievances SET user_id = $1 WHERE user_id = $2`, [newId, oldId]);
      await client.query(`UPDATE grievances SET target_employee_id = $1 WHERE target_employee_id = $2`, [newId, oldId]);
      await client.query(`UPDATE grievances SET assigned_to = $1 WHERE assigned_to = $2`, [newId, oldId]);
      await client.query(`UPDATE leave_balances SET user_id = $1 WHERE user_id = $2`, [newId, oldId]);
      await client.query(`UPDATE leave_requests SET user_id = $1 WHERE user_id = $2`, [newId, oldId]);
      await client.query(`UPDATE notifications SET user_id = $1 WHERE user_id = $2`, [newId, oldId]);
      await client.query(`UPDATE users SET manager_id = $1 WHERE manager_id = $2`, [newId, oldId]);
      await client.query(`UPDATE users SET second_manager_id = $1 WHERE second_manager_id = $2`, [newId, oldId]);

      // 3. Delete the old user row (all references now point to newId)
      await client.query(`DELETE FROM users WHERE id = $1`, [oldId]);

      await client.query('COMMIT');

      const result = await client.query(`SELECT * FROM users WHERE id = $1`, [newId]);
      return result.rows[0] as User | undefined;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(schema.users).where(eq(schema.users.id, id));
  }

  // Leave balance operations
  async getLeaveBalances(userId: string): Promise<LeaveBalance[]> {
    return db
      .select()
      .from(schema.leaveBalances)
      .where(eq(schema.leaveBalances.userId, userId));
  }

  async getLeaveBalance(id: number): Promise<LeaveBalance | undefined> {
    const [b] = await db.select().from(schema.leaveBalances).where(eq(schema.leaveBalances.id, id));
    return b;
  }

  async getAllLeaveBalances(): Promise<LeaveBalance[]> {
    return db.select().from(schema.leaveBalances);
  }

  async createLeaveBalance(balance: InsertLeaveBalance): Promise<LeaveBalance> {
    const [newBalance] = await db.insert(schema.leaveBalances).values(balance).returning();
    return newBalance;
  }

  async updateLeaveBalance(id: number, balance: Partial<InsertLeaveBalance>): Promise<LeaveBalance | undefined> {
    const [updatedBalance] = await db
      .update(schema.leaveBalances)
      .set(balance)
      .where(eq(schema.leaveBalances.id, id))
      .returning();
    return updatedBalance;
  }

  // Leave request operations
  async getLeaveRequests(userId?: string): Promise<LeaveRequest[]> {
    if (userId) {
      return db
        .select()
        .from(schema.leaveRequests)
        .where(eq(schema.leaveRequests.userId, userId))
        .orderBy(desc(schema.leaveRequests.createdAt));
    }
    return db
      .select()
      .from(schema.leaveRequests)
      .orderBy(desc(schema.leaveRequests.createdAt));
  }

  async getLeaveRequest(id: number): Promise<LeaveRequest | undefined> {
    const requests = await db
      .select()
      .from(schema.leaveRequests)
      .where(eq(schema.leaveRequests.id, id));
    return requests[0];
  }

  async createLeaveRequest(request: InsertLeaveRequest): Promise<LeaveRequest> {
    const [newRequest] = await db.insert(schema.leaveRequests).values(request).returning();
    return newRequest;
  }

  async updateLeaveRequestStatus(id: number, status: string, adminNotes?: string): Promise<LeaveRequest | undefined> {
    const updateData: { status: string; updatedAt: Date; adminNotes?: string } = { 
      status, 
      updatedAt: new Date() 
    };
    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes;
    }
    const [updatedRequest] = await db
      .update(schema.leaveRequests)
      .set(updateData)
      .where(eq(schema.leaveRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async updateHistoricLeaveRequest(id: number, fields: Partial<{ userId: string; leaveType: string; startDate: string; endDate: string; reason: string; authorizedBy: string | null; referenceNumber: string | null; adminNotes: string | null; }>): Promise<LeaveRequest | undefined> {
    const [updated] = await db
      .update(schema.leaveRequests)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(schema.leaveRequests.id, id))
      .returning();
    return updated;
  }

  async deleteLeaveRequest(id: number): Promise<boolean> {
    const result = await db
      .delete(schema.leaveRequests)
      .where(eq(schema.leaveRequests.id, id))
      .returning();
    return result.length > 0;
  }

  async getLeaveRequestsByStatus(status: string | string[]): Promise<LeaveRequest[]> {
    const statuses = Array.isArray(status) ? status : [status];
    return db
      .select()
      .from(schema.leaveRequests)
      .where(inArray(schema.leaveRequests.status, statuses))
      .orderBy(desc(schema.leaveRequests.createdAt));
  }

  async updateManagerDecision(id: number, approverId: string, decision: 'approved' | 'rejected', notes?: string, skipHR = false): Promise<LeaveRequest | undefined> {
    const now = new Date();
    // Both recommend and not-recommend forward to HR for final decision
    const nextStatus = 'pending_hr';

    const updateData: Record<string, unknown> = {
      status: nextStatus,
      managerApproverId: approverId,
      managerDecision: decision,
      managerDecisionAt: now,
      updatedAt: now,
    };

    if (notes) {
      updateData.managerNotes = notes;
    }

    const [updatedRequest] = await db
      .update(schema.leaveRequests)
      .set(updateData)
      .where(eq(schema.leaveRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async updateHRDecision(id: number, approverId: string, decision: 'approved' | 'rejected', notes?: string): Promise<LeaveRequest | undefined> {
    const now = new Date();
    // HR is the final approver — no MD stage
    const nextStatus = decision === 'approved' ? 'approved' : 'rejected';
    
    const updateData: Record<string, unknown> = {
      status: nextStatus,
      hrApproverId: approverId,
      hrDecision: decision,
      hrDecisionAt: now,
      updatedAt: now,
    };
    
    if (notes) {
      updateData.hrNotes = notes;
    }
    
    updateData.finalizedById = approverId;
    updateData.finalizedAt = now;

    const [updatedRequest] = await db
      .update(schema.leaveRequests)
      .set(updateData)
      .where(eq(schema.leaveRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async updateMDDecision(id: number, approverId: string, decision: 'approved' | 'rejected', notes?: string, bypassHR?: boolean): Promise<LeaveRequest | undefined> {
    const now = new Date();
    const finalStatus = decision === 'approved' ? 'approved' : 'rejected';
    
    const updateData: Record<string, unknown> = {
      status: finalStatus,
      mdApproverId: approverId,
      mdDecision: decision,
      mdDecisionAt: now,
      finalizedById: approverId,
      finalizedAt: now,
      updatedAt: now,
    };
    
    if (notes) {
      updateData.mdNotes = notes;
    }
    
    // If MD bypasses HR (approving directly from pending_hr status), mark HR as skipped
    if (bypassHR && decision === 'approved') {
      updateData.hrDecision = 'skipped';
      updateData.hrDecisionAt = now;
    }
    
    const [updatedRequest] = await db
      .update(schema.leaveRequests)
      .set(updateData)
      .where(eq(schema.leaveRequests.id, id))
      .returning();
    return updatedRequest;
  }

  // Attendance operations
  async getAttendanceRecords(userId: string, limit = 10, startDate?: Date, endDate?: Date): Promise<AttendanceRecord[]> {
    const conditions = [eq(schema.attendanceRecords.userId, userId)];
    if (startDate) conditions.push(gte(schema.attendanceRecords.timestamp, startDate));
    if (endDate) conditions.push(lte(schema.attendanceRecords.timestamp, endDate));
    
    return db
      .select()
      .from(schema.attendanceRecords)
      .where(and(...conditions))
      .orderBy(desc(schema.attendanceRecords.timestamp))
      .limit(limit);
  }

  async getAllAttendanceRecords(startDate?: Date, endDate?: Date): Promise<AttendanceRecord[]> {
    if (startDate && endDate) {
      return db
        .select()
        .from(schema.attendanceRecords)
        .where(and(
          gte(schema.attendanceRecords.timestamp, startDate),
          lte(schema.attendanceRecords.timestamp, endDate)
        ))
        .orderBy(desc(schema.attendanceRecords.timestamp));
    }
    return db
      .select()
      .from(schema.attendanceRecords)
      .orderBy(desc(schema.attendanceRecords.timestamp));
  }

  async getTodayLatestAttendance(userId: string): Promise<AttendanceRecord | undefined> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    
    const records = await db
      .select()
      .from(schema.attendanceRecords)
      .where(
        and(
          eq(schema.attendanceRecords.userId, userId),
          gte(schema.attendanceRecords.timestamp, startOfDay),
          lte(schema.attendanceRecords.timestamp, endOfDay)
        )
      )
      .orderBy(desc(schema.attendanceRecords.timestamp))
      .limit(1);
    
    return records[0];
  }

  async createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const [newRecord] = await db.insert(schema.attendanceRecords).values(record).returning();
    return newRecord;
  }

  async createBulkAttendanceRecords(records: { userId: string; type: string; timestamp: Date; method?: string; context?: string }[]): Promise<AttendanceRecord[]> {
    if (records.length === 0) return [];
    const insertRecords = records.map(r => ({
      userId: r.userId,
      type: r.type,
      timestamp: r.timestamp,
      method: r.method || 'manual',
      context: r.context || 'manual',
    }));
    const newRecords = await db.insert(schema.attendanceRecords).values(insertRecords).returning();
    return newRecords;
  }

  async getLatestAttendance(userId: string): Promise<AttendanceRecord | undefined> {
    const records = await db
      .select()
      .from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.userId, userId))
      .orderBy(desc(schema.attendanceRecords.timestamp))
      .limit(1);
    return records[0];
  }

  async getUserClockInStatus(userId: string): Promise<{ isClockedIn: boolean; lastRecord: AttendanceRecord | null }> {
    const lastRecord = await this.getLatestAttendance(userId);
    if (!lastRecord) {
      return { isClockedIn: false, lastRecord: null };
    }
    return { isClockedIn: lastRecord.type === 'in', lastRecord };
  }

  async getUsersNotClockedOut(beforeDate: Date): Promise<{ user: User; lastClockIn: AttendanceRecord }[]> {
    const allUsers = await this.getAllUsers();
    const results: { user: User; lastClockIn: AttendanceRecord }[] = [];

    for (const user of allUsers) {
      if (user.role !== 'worker') continue;
      
      const lastRecord = await this.getLatestAttendance(user.id);
      if (!lastRecord) continue;
      
      // Only consider users whose last action was a clock-in before the cutoff date
      if (lastRecord.type === 'in' && new Date(lastRecord.timestamp) < beforeDate) {
        // Verify no clock-out exists after this clock-in (to avoid duplicates)
        const records = await db
          .select()
          .from(schema.attendanceRecords)
          .where(
            and(
              eq(schema.attendanceRecords.userId, user.id),
              eq(schema.attendanceRecords.type, 'out'),
              gte(schema.attendanceRecords.timestamp, new Date(lastRecord.timestamp))
            )
          )
          .limit(1);
        
        // Only add if no clock-out exists after the last clock-in
        if (records.length === 0) {
          results.push({ user, lastClockIn: lastRecord });
        }
      }
    }
    return results;
  }

  async createSystemAutoClockOut(userId: string, timestamp: Date): Promise<AttendanceRecord> {
    const [newRecord] = await db.insert(schema.attendanceRecords).values({
      userId,
      type: 'out',
      timestamp,
      method: 'system_auto',
      context: 'missed_clockout',
    }).returning();
    return newRecord;
  }

  async updateAttendanceRecord(id: number, data: { timestamp?: Date; type?: string; isInfringement?: string | null; infringementReason?: string | null }): Promise<AttendanceRecord | undefined> {
    const updateData: Record<string, unknown> = {};
    if (data.timestamp !== undefined) updateData.timestamp = data.timestamp;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.isInfringement !== undefined) updateData.isInfringement = data.isInfringement;
    if (data.infringementReason !== undefined) updateData.infringementReason = data.infringementReason;
    
    if (Object.keys(updateData).length === 0) return undefined;
    
    const [updated] = await db
      .update(schema.attendanceRecords)
      .set(updateData)
      .where(eq(schema.attendanceRecords.id, id))
      .returning();
    return updated;
  }

  async deleteAttendanceRecord(id: number): Promise<boolean> {
    const result = await db
      .delete(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.id, id))
      .returning();
    return result.length > 0;
  }

  // Settings operations
  async getSetting(key: string): Promise<Setting | undefined> {
    const settings = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key));
    return settings[0];
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    const existing = await this.getSetting(key);
    
    if (existing) {
      const [updated] = await db
        .update(schema.settings)
        .set({ value })
        .where(eq(schema.settings.key, key))
        .returning();
      return updated;
    }
    
    const [newSetting] = await db
      .insert(schema.settings)
      .values({ key, value })
      .returning();
    return newSetting;
  }

  async getAllSettings(): Promise<Setting[]> {
    return db.select().from(schema.settings);
  }

  async upsertSetting(key: string, value: string): Promise<Setting> {
    return this.setSetting(key, value);
  }

  // Department operations
  async getAllDepartments(): Promise<Department[]> {
    return db.select().from(schema.departments).orderBy(schema.departments.name);
  }

  async getDepartment(id: number): Promise<Department | undefined> {
    const departments = await db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.id, id));
    return departments[0];
  }

  async createDepartment(department: InsertDepartment): Promise<Department> {
    const [newDepartment] = await db
      .insert(schema.departments)
      .values(department)
      .returning();
    return newDepartment;
  }

  async updateDepartment(id: number, department: Partial<InsertDepartment>): Promise<Department | undefined> {
    const [updatedDepartment] = await db
      .update(schema.departments)
      .set(department)
      .where(eq(schema.departments.id, id))
      .returning();
    return updatedDepartment;
  }

  async deleteDepartment(id: number): Promise<boolean> {
    const result = await db.delete(schema.departments).where(eq(schema.departments.id, id));
    return true;
  }

  async getUserCountByDepartment(departmentName: string): Promise<number> {
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.department, departmentName));
    return users.length;
  }

  // User Group operations
  async getAllUserGroups(): Promise<UserGroup[]> {
    return db.select().from(schema.userGroups).orderBy(schema.userGroups.name);
  }

  async getUserGroup(id: number): Promise<UserGroup | undefined> {
    const groups = await db
      .select()
      .from(schema.userGroups)
      .where(eq(schema.userGroups.id, id));
    return groups[0];
  }

  async createUserGroup(group: InsertUserGroup): Promise<UserGroup> {
    const [newGroup] = await db
      .insert(schema.userGroups)
      .values(group)
      .returning();
    return newGroup;
  }

  async updateUserGroup(id: number, group: Partial<InsertUserGroup>): Promise<UserGroup | undefined> {
    const [updatedGroup] = await db
      .update(schema.userGroups)
      .set(group)
      .where(eq(schema.userGroups.id, id))
      .returning();
    return updatedGroup;
  }

  async deleteUserGroup(id: number): Promise<boolean> {
    await db.delete(schema.userGroups).where(eq(schema.userGroups.id, id));
    return true;
  }

  async getUserCountByUserGroup(groupId: number): Promise<number> {
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.userGroupId, groupId));
    return users.length;
  }

  // Employee Type operations
  async getAllEmployeeTypes(): Promise<EmployeeType[]> {
    return db.select().from(schema.employeeTypes).orderBy(schema.employeeTypes.name);
  }

  async getEmployeeType(id: number): Promise<EmployeeType | undefined> {
    const types = await db
      .select()
      .from(schema.employeeTypes)
      .where(eq(schema.employeeTypes.id, id));
    return types[0];
  }

  async getDefaultEmployeeType(): Promise<EmployeeType | undefined> {
    const types = await db
      .select()
      .from(schema.employeeTypes)
      .where(eq(schema.employeeTypes.isDefault, 'yes'));
    return types[0];
  }

  async createEmployeeType(type: InsertEmployeeType): Promise<EmployeeType> {
    const [newType] = await db
      .insert(schema.employeeTypes)
      .values(type)
      .returning();
    return newType;
  }

  async updateEmployeeType(id: number, type: Partial<InsertEmployeeType>): Promise<EmployeeType | undefined> {
    const [updatedType] = await db
      .update(schema.employeeTypes)
      .set(type)
      .where(eq(schema.employeeTypes.id, id))
      .returning();
    return updatedType;
  }

  async deleteEmployeeType(id: number): Promise<boolean> {
    await db.delete(schema.employeeTypes).where(eq(schema.employeeTypes.id, id));
    return true;
  }

  // Leave Rule operations
  async getAllLeaveRules(): Promise<LeaveRule[]> {
    return db.select().from(schema.leaveRules).orderBy(schema.leaveRules.name);
  }

  async getLeaveRule(id: number): Promise<LeaveRule | undefined> {
    const rules = await db
      .select()
      .from(schema.leaveRules)
      .where(eq(schema.leaveRules.id, id));
    return rules[0];
  }

  async createLeaveRule(rule: InsertLeaveRule): Promise<LeaveRule> {
    const [newRule] = await db
      .insert(schema.leaveRules)
      .values(rule)
      .returning();
    return newRule;
  }

  async updateLeaveRule(id: number, rule: Partial<InsertLeaveRule>): Promise<LeaveRule | undefined> {
    const [updatedRule] = await db
      .update(schema.leaveRules)
      .set(rule)
      .where(eq(schema.leaveRules.id, id))
      .returning();
    return updatedRule;
  }

  async deleteLeaveRule(id: number): Promise<boolean> {
    await db.delete(schema.leaveRules).where(eq(schema.leaveRules.id, id));
    return true;
  }

  // Leave Rule Phase operations
  async getLeaveRulePhases(leaveRuleId: number): Promise<LeaveRulePhase[]> {
    return db
      .select()
      .from(schema.leaveRulePhases)
      .where(eq(schema.leaveRulePhases.leaveRuleId, leaveRuleId))
      .orderBy(schema.leaveRulePhases.sequence);
  }

  async getAllLeaveRulePhases(): Promise<LeaveRulePhase[]> {
    return db.select().from(schema.leaveRulePhases);
  }

  async createLeaveRulePhase(phase: InsertLeaveRulePhase): Promise<LeaveRulePhase> {
    const [newPhase] = await db
      .insert(schema.leaveRulePhases)
      .values(phase)
      .returning();
    return newPhase;
  }

  async updateLeaveRulePhase(id: number, phase: Partial<InsertLeaveRulePhase>): Promise<LeaveRulePhase | undefined> {
    const [updatedPhase] = await db
      .update(schema.leaveRulePhases)
      .set(phase)
      .where(eq(schema.leaveRulePhases.id, id))
      .returning();
    return updatedPhase;
  }

  async deleteLeaveRulePhase(id: number): Promise<boolean> {
    await db.delete(schema.leaveRulePhases).where(eq(schema.leaveRulePhases.id, id));
    return true;
  }

  async deleteAllLeaveRulePhases(leaveRuleId: number): Promise<boolean> {
    await db.delete(schema.leaveRulePhases).where(eq(schema.leaveRulePhases.leaveRuleId, leaveRuleId));
    return true;
  }

  // Contract History operations
  async getContractHistory(userId: string): Promise<ContractHistory[]> {
    return db
      .select()
      .from(schema.contractHistory)
      .where(eq(schema.contractHistory.userId, userId))
      .orderBy(desc(schema.contractHistory.createdAt));
  }

  async getAllContractHistory(): Promise<ContractHistory[]> {
    return db.select().from(schema.contractHistory).orderBy(desc(schema.contractHistory.createdAt));
  }

  async createContractHistory(history: InsertContractHistory): Promise<ContractHistory> {
    const [newHistory] = await db
      .insert(schema.contractHistory)
      .values(history)
      .returning();
    return newHistory;
  }

  // Grievance operations
  async getGrievances(userId?: string): Promise<Grievance[]> {
    if (userId) {
      return db
        .select()
        .from(schema.grievances)
        .where(eq(schema.grievances.userId, userId))
        .orderBy(desc(schema.grievances.createdAt));
    }
    return db
      .select()
      .from(schema.grievances)
      .orderBy(desc(schema.grievances.createdAt));
  }

  async getAllGrievances(): Promise<Grievance[]> {
    return db
      .select()
      .from(schema.grievances)
      .orderBy(desc(schema.grievances.createdAt));
  }

  async getGrievance(id: number): Promise<Grievance | undefined> {
    const [grievance] = await db
      .select()
      .from(schema.grievances)
      .where(eq(schema.grievances.id, id));
    return grievance;
  }

  async createGrievance(grievance: InsertGrievance): Promise<Grievance> {
    const [newGrievance] = await db
      .insert(schema.grievances)
      .values(grievance)
      .returning();
    return newGrievance;
  }

  async updateGrievance(id: number, grievance: Partial<InsertGrievance>): Promise<Grievance | undefined> {
    const [updated] = await db
      .update(schema.grievances)
      .set(grievance)
      .where(eq(schema.grievances.id, id))
      .returning();
    return updated;
  }

  async updateGrievanceStatus(id: number, status: string, adminNotes?: string, resolution?: string): Promise<Grievance | undefined> {
    const updateData: Partial<Grievance> = { status };
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (resolution !== undefined) updateData.resolution = resolution;
    if (status === 'resolved' || status === 'rejected' || status === 'closed') {
      updateData.resolvedAt = new Date();
    }
    const [updated] = await db
      .update(schema.grievances)
      .set(updateData)
      .where(eq(schema.grievances.id, id))
      .returning();
    return updated;
  }

  // Public Holiday operations
  async getAllPublicHolidays(): Promise<PublicHoliday[]> {
    return db
      .select()
      .from(schema.publicHolidays)
      .orderBy(schema.publicHolidays.date);
  }

  async getPublicHoliday(id: number): Promise<PublicHoliday | undefined> {
    const [holiday] = await db
      .select()
      .from(schema.publicHolidays)
      .where(eq(schema.publicHolidays.id, id));
    return holiday;
  }

  async createPublicHoliday(holiday: InsertPublicHoliday): Promise<PublicHoliday> {
    const [newHoliday] = await db
      .insert(schema.publicHolidays)
      .values(holiday)
      .returning();
    return newHoliday;
  }

  async updatePublicHoliday(id: number, holiday: Partial<InsertPublicHoliday>): Promise<PublicHoliday | undefined> {
    const [updated] = await db
      .update(schema.publicHolidays)
      .set(holiday)
      .where(eq(schema.publicHolidays.id, id))
      .returning();
    return updated;
  }

  async deletePublicHoliday(id: number): Promise<boolean> {
    const result = await db
      .delete(schema.publicHolidays)
      .where(eq(schema.publicHolidays.id, id));
    return true;
  }

  // Notification operations
  async getNotifications(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(desc(schema.notifications.createdAt));
  }

  async getAllNotifications(): Promise<Notification[]> {
    return db.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const results = await db
      .select()
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.isRead, false)
      ));
    return results.length;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db
      .insert(schema.notifications)
      .values(notification)
      .returning();
    return newNotification;
  }

  async markNotificationRead(id: number): Promise<Notification | undefined> {
    const [updated] = await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.id, id))
      .returning();
    return updated;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.userId, userId));
  }

  async deleteNotification(id: number): Promise<boolean> {
    await db
      .delete(schema.notifications)
      .where(eq(schema.notifications.id, id));
    return true;
  }

  // Face Descriptor operations
  async getFaceDescriptors(userId: string): Promise<FaceDescriptor[]> {
    return db
      .select()
      .from(schema.faceDescriptors)
      .where(eq(schema.faceDescriptors.userId, userId))
      .orderBy(desc(schema.faceDescriptors.createdAt));
  }

  async getAllFaceDescriptorsForMatching(): Promise<{ userId: string; descriptor: string }[]> {
    return db
      .select({
        userId: schema.faceDescriptors.userId,
        descriptor: schema.faceDescriptors.descriptor,
      })
      .from(schema.faceDescriptors);
  }

  async createFaceDescriptor(data: InsertFaceDescriptor): Promise<FaceDescriptor> {
    const [newDescriptor] = await db
      .insert(schema.faceDescriptors)
      .values(data)
      .returning();
    return newDescriptor;
  }

  async deleteFaceDescriptor(id: number): Promise<boolean> {
    await db
      .delete(schema.faceDescriptors)
      .where(eq(schema.faceDescriptors.id, id));
    return true;
  }

  // Org Position operations
  async getAllOrgPositions(): Promise<OrgPosition[]> {
    return db.select().from(schema.orgPositions).orderBy(schema.orgPositions.sortOrder);
  }

  async getOrgPosition(id: number): Promise<OrgPosition | undefined> {
    const results = await db.select().from(schema.orgPositions).where(eq(schema.orgPositions.id, id));
    return results[0];
  }

  async createOrgPosition(position: InsertOrgPosition): Promise<OrgPosition> {
    const [newPosition] = await db.insert(schema.orgPositions).values(position).returning();
    return newPosition;
  }

  async updateOrgPosition(id: number, position: Partial<InsertOrgPosition>): Promise<OrgPosition | undefined> {
    const [updated] = await db.update(schema.orgPositions).set(position).where(eq(schema.orgPositions.id, id)).returning();
    return updated;
  }

  async deleteOrgPosition(id: number): Promise<boolean> {
    await db.delete(schema.orgPositions).where(eq(schema.orgPositions.id, id));
    return true;
  }

  // Company operations
  async getAllCompanies(): Promise<Company[]> {
    return db.select().from(schema.companies).orderBy(schema.companies.name);
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const rows = await db.select().from(schema.companies).where(eq(schema.companies.id, id));
    return rows[0];
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [newCompany] = await db.insert(schema.companies).values(company).returning();
    return newCompany;
  }

  async updateCompany(id: number, company: Partial<InsertCompany>): Promise<Company | undefined> {
    const [updated] = await db.update(schema.companies).set(company).where(eq(schema.companies.id, id)).returning();
    return updated;
  }

  async deleteCompany(id: number): Promise<boolean> {
    await db.delete(schema.companies).where(eq(schema.companies.id, id));
    return true;
  }

  async createPasswordResetToken(token: string, email: string, expiry: Date): Promise<void> {
    await db.insert(schema.passwordResetTokens).values({ token, email, expiry });
  }

  async getPasswordResetToken(token: string): Promise<{ email: string; expiry: Date } | undefined> {
    const results = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token));
    if (results.length === 0) return undefined;
    return { email: results[0].email, expiry: results[0].expiry };
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token));
  }

  async createAuditLog(entry: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(schema.auditLogs).values(entry).returning();
    return log;
  }

  async getAuditLogs(limit = 500): Promise<AuditLog[]> {
    return db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.timestamp)).limit(limit);
  }
}

export const storage = new DrizzleStorage();
