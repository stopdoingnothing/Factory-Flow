import { sql } from "drizzle-orm";
import { pgTable, text, integer, real, timestamp, serial, varchar, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Departments Table
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
});
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

// User Groups Table (for admin users)
export const userGroups = pgTable("user_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserGroupSchema = createInsertSchema(userGroups).omit({
  id: true,
  createdAt: true,
});
export type InsertUserGroup = z.infer<typeof insertUserGroupSchema>;
export type UserGroup = typeof userGroups.$inferSelect;

// Employee Types Table
export const employeeTypes = pgTable("employee_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  leaveLabel: text("leave_label").notNull().default("Leave"), // "Leave" for employees, "Unavailable" for contractors
  hasLeaveEntitlement: text("has_leave_entitlement").notNull().default("yes"), // "yes" or "no"
  isDefault: text("is_default").notNull().default("no"), // "yes" for the default type
  isPermanent: text("is_permanent").notNull().default("yes"), // "yes" for permanent employees (no end date), "no" for contract-based
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmployeeTypeSchema = createInsertSchema(employeeTypes).omit({
  id: true,
  createdAt: true,
});
export type InsertEmployeeType = z.infer<typeof insertEmployeeTypeSchema>;
export type EmployeeType = typeof employeeTypes.$inferSelect;

// Leave Rules Table (for configuring leave accrual rules)
export const leaveRules = pgTable("leave_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  leaveType: text("leave_type").notNull(), // 'Annual Leave', 'Sick Leave', etc.
  employeeTypeId: integer("employee_type_id").references(() => employeeTypes.id),
  accrualType: text("accrual_type").notNull().default("per_days_worked"), // 'monthly', 'annual', 'per_days_worked', 'fixed_per_cycle'
  daysEarned: text("days_earned").notNull().default("1"), // Numerator: days earned (e.g., "1" or "1.6")
  periodDaysWorked: integer("period_days_worked").default(26), // Denominator: days worked to earn (e.g., 26 or 28)
  accrualRate: text("accrual_rate").notNull().default("0"), // Legacy: e.g., "1.667" days per month
  maxAccrual: integer("max_accrual"), // Maximum days that can be accrued
  carryOverLimit: integer("carry_over_limit"), // Max days that can carry over to next year
  waitingPeriodDays: integer("waiting_period_days").default(0), // Days before accrual starts
  cycleMonths: integer("cycle_months"), // e.g., 36 for "every 3 years"
  pausesAnnualAccrual: boolean("pauses_annual_accrual").notNull().default(false), // Whether this leave type pauses annual leave accrual (spec §9.1)
  cycleAnchor: text("cycle_anchor").notNull().default("calendar_year"), // 'calendar_year' | 'employment_start_date' (spec §3.3)
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLeaveRuleSchema = createInsertSchema(leaveRules).omit({
  id: true,
  createdAt: true,
});
export type InsertLeaveRule = z.infer<typeof insertLeaveRuleSchema>;
export type LeaveRule = typeof leaveRules.$inferSelect;

// Leave Rule Phases Table (for tiered rules like sick leave with different rates before/after probation)
export const leaveRulePhases = pgTable("leave_rule_phases", {
  id: serial("id").primaryKey(),
  leaveRuleId: integer("leave_rule_id").notNull().references(() => leaveRules.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull().default(1), // Order of phases
  phaseName: text("phase_name").notNull(), // e.g., "Probation Period", "After 6 Months"
  startsAfterMonths: integer("starts_after_months").default(0), // Phase starts after X months of employment
  startsAfterDaysWorked: integer("starts_after_days_worked"), // Or starts after X days worked
  accrualType: text("accrual_type").notNull().default("per_days_worked"), // 'per_days_worked', 'fixed_per_cycle'
  daysEarned: text("days_earned").notNull().default("1"), // Days earned in this phase
  periodDaysWorked: integer("period_days_worked").default(26), // Days worked to earn (for per_days_worked)
  cycleMonths: integer("cycle_months"), // Cycle length for fixed_per_cycle (e.g., 36 for 3 years)
  maxBalanceDays: integer("max_balance_days"), // Max balance during this phase
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLeaveRulePhaseSchema = createInsertSchema(leaveRulePhases).omit({
  id: true,
  createdAt: true,
});
export type InsertLeaveRulePhase = z.infer<typeof insertLeaveRulePhaseSchema>;
export type LeaveRulePhase = typeof leaveRulePhases.$inferSelect;

// Companies Table (for payroll company assignment)
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  registrationNumber: text("registration_number"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// Users Table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"), // Legacy field - auto-populated from firstName + surname
  firstName: text("first_name").notNull(),
  surname: text("surname").notNull(),
  nickname: text("nickname"),
  email: text("email"),
  password: text("password"),
  mobile: text("mobile"),
  homeAddress: text("home_address"),
  gender: text("gender"), // 'male', 'female', 'other'
  religion: text("religion"), // null/unspecified, 'christian', 'muslim', 'jewish', 'hindu', 'other'
  role: text("role").notNull().default("worker"), // legacy — kept for compat; use roles[] as source of truth
  adminRole: text("admin_role"), // legacy — kept for compat; use roles[] as source of truth
  hasFullAdminAccess: text("has_full_admin_access"), // legacy
  // Explicit role set: 'employee' | 'manager' | 'hr' | 'md' | 'admin'
  // A user can hold multiple roles. Roles are additive — no implicit inheritance.
  roles: text("roles").array().notNull().default(sql`ARRAY['employee']::text[]`),
  department: text("department"), // for workers
  userGroupId: integer("user_group_id").references(() => userGroups.id), // for admins
  employeeTypeId: integer("employee_type_id").references(() => employeeTypes.id), // employee type
  nationalId: text("national_id"), // National ID number
  taxNumber: text("tax_number"), // Tax number
  nextOfKin: text("next_of_kin"), // Next of kin name and relationship
  emergencyNumber: text("emergency_number"), // Emergency contact number
  popiaWaiverUrl: text("popia_waiver_url"), // URL to uploaded POPIA waiver document
  startDate: text("start_date"), // Employment start date for leave calculations
  contractEndDate: text("contract_end_date"), // End date for contractors/temps (null for permanent)
  terminationDate: text("termination_date"), // Date when employee was terminated (null if active)
  managerId: text("manager_id"), // ID of the employee's direct line manager
  orgPositionId: integer("org_position_id"), // ID of the org position this employee holds
  reportsToPositionId: integer("reports_to_position_id"), // Org chart position this employee reports to (used for org chart display only)
  companyId: integer("company_id").references(() => companies.id), // Payroll company
  photoUrl: text("photo_url"),
  faceDescriptor: text("face_descriptor"), // JSON array of 128 face embedding values
  exclude: boolean("exclude").default(false), // Exclude from org chart and attendance (for test/dummy users)
  excludeFromLeave: boolean("exclude_from_leave").default(false), // Exclude from leave management (external contractors, system accounts)
  attendanceRequired: boolean("attendance_required").default(true), // Whether employee needs to clock in/out (false for contractors, consultants, off-site workers)
  workDaysPerWeek: integer("work_days_per_week").notNull().default(5), // Standard working days per week — affects sick leave entitlement and FRL eligibility (spec §13.2)
  annualLeaveOverrideDays: real("annual_leave_override_days"), // Optional per-employee override: annual leave days/year. When set, RATE = this/12; tier logic skipped. (spec §5.1)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Leave Balances Table
export const leaveBalances = pgTable("leave_balances", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leaveType: text("leave_type").notNull(), // 'Annual Leave', 'Sick Leave', etc.
  total: real("total").notNull().default(0),
  taken: real("taken").notNull().default(0),
  pending: real("pending").notNull().default(0),
  carryOverDays: real("carry_over_days").notNull().default(0), // Unused days carried forward from previous cycle
  carryOverExpiry: text("carry_over_expiry"), // 'yyyy-MM-dd' — carry-over forfeited if unused beyond this date (6 months into new cycle)
});

export const insertLeaveBalanceSchema = createInsertSchema(leaveBalances).omit({
  id: true,
});
export type InsertLeaveBalance = z.infer<typeof insertLeaveBalanceSchema>;
export type LeaveBalance = typeof leaveBalances.$inferSelect;

// Leave Requests Table
// Status workflow: pending_manager -> pending_hr -> pending_md -> approved/rejected
// MD can approve directly (bypassing HR), cancelled by employee
export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leaveType: text("leave_type").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason").notNull(),
  comments: text("comments"), // Employee's additional comments
  // Status: 'pending_manager', 'pending_hr', 'pending_md', 'approved', 'rejected', 'cancelled'
  status: text("status").notNull().default("pending_manager"),
  adminNotes: text("admin_notes"), // Legacy/general admin notes
  documents: text("documents").array(),
  
  // Manager recommendation fields (manager recommends or does not recommend; HR can override)
  managerApproverId: text("manager_approver_id"),
  managerDecision: text("manager_decision"), // 'recommended', 'not_recommended'
  managerNotes: text("manager_notes"),
  managerDecisionAt: timestamp("manager_decision_at"),
  
  // HR approval fields
  hrApproverId: text("hr_approver_id"),
  hrDecision: text("hr_decision"), // 'approved', 'rejected'
  hrNotes: text("hr_notes"),
  hrDecisionAt: timestamp("hr_decision_at"),
  
  // MD approval fields
  mdApproverId: text("md_approver_id"),
  mdDecision: text("md_decision"), // 'approved', 'rejected'
  mdNotes: text("md_notes"),
  mdDecisionAt: timestamp("md_decision_at"),
  
  // Final approval tracking
  finalizedById: text("finalized_by_id"), // Who made the final decision
  finalizedAt: timestamp("finalized_at"), // When it was finalized
  
  // Medical certificate flags (set on submission for sick leave)
  requiresMedCert: boolean("requires_med_cert").default(false).notNull(),
  medCertFlags: text("med_cert_flags"), // JSON array: ["exceeds_2_days","fri_mon_pattern","public_holiday_adjacent"]

  // Historic leave entry fields (admin backfill from physical records)
  isHistoric: boolean("is_historic").default(false).notNull(),
  authorizedBy: text("authorized_by"), // Name of the person who authorized in the old system
  referenceNumber: text("reference_number"), // Reference number from the physical leave book
  
  // Set when an approved request's dates have passed and pending days have been moved to taken
  settledAt: timestamp("settled_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type LeaveRequest = typeof leaveRequests.$inferSelect;

// Attendance Records Table
export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'in' or 'out'
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  photoUrl: text("photo_url"),
  method: text("method").default("face"), // 'face' or 'id'
  context: text("context").default("attendance"), // 'attendance' (kiosk) or 'manual'
  isInfringement: text("is_infringement"),
  infringementReason: text("infringement_reason"),
});

export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecords).omit({
  id: true,
}).extend({
  timestamp: z.date().optional(),
});
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;

export const manualAttendanceRecordSchema = createInsertSchema(attendanceRecords).omit({
  id: true,
});
export type ManualAttendanceRecord = z.infer<typeof manualAttendanceRecordSchema>;

// Settings Table
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
});
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Contract History Table (tracks contract extensions and type changes)
export const contractHistory = pgTable("contract_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // 'created', 'extended', 'converted', 'ended'
  previousEmployeeTypeId: integer("previous_employee_type_id").references(() => employeeTypes.id),
  newEmployeeTypeId: integer("new_employee_type_id").references(() => employeeTypes.id),
  previousEndDate: text("previous_end_date"),
  newEndDate: text("new_end_date"),
  reason: text("reason"), // Reason for extension/conversion
  performedBy: text("performed_by").references(() => users.id), // Admin who made the change
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContractHistorySchema = createInsertSchema(contractHistory).omit({
  id: true,
  createdAt: true,
});
export type InsertContractHistory = z.infer<typeof insertContractHistorySchema>;
export type ContractHistory = typeof contractHistory.$inferSelect;

// Grievances Table
export const grievances = pgTable("grievances", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(), // 'company' or 'employee'
  targetEmployeeId: text("target_employee_id").references(() => users.id),
  category: text("category").notNull(), // 'harassment', 'discrimination', 'safety', 'policy', 'other'
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("submitted"), // 'draft', 'submitted', 'in_review', 'resolved', 'rejected', 'closed'
  priority: text("priority").default("normal"), // 'low', 'normal', 'high', 'urgent'
  attachments: text("attachments").array(), // Array of document URLs/base64
  adminNotes: text("admin_notes"),
  resolution: text("resolution"),
  assignedTo: text("assigned_to").references(() => users.id),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGrievanceSchema = createInsertSchema(grievances).omit({
  id: true,
  submittedAt: true,
  resolvedAt: true,
  createdAt: true,
});
export type InsertGrievance = z.infer<typeof insertGrievanceSchema>;
export type Grievance = typeof grievances.$inferSelect;

// Public Holidays Table
export const publicHolidays = pgTable("public_holidays", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
  isRecurring: boolean("is_recurring").default(false), // True for annual holidays
  type: text("type").default("public"), // 'public' or 'religious'
  religionGroup: text("religion_group"), // null = applies to all; 'muslim', 'jewish', 'christian', 'hindu'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPublicHolidaySchema = createInsertSchema(publicHolidays).omit({
  id: true,
  createdAt: true,
});
export type InsertPublicHoliday = z.infer<typeof insertPublicHolidaySchema>;
export type PublicHoliday = typeof publicHolidays.$inferSelect;

// Notifications Table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'leave_status', 'leave_request', 'attendance', 'system'
  title: text("title").notNull(),
  message: text("message").notNull(),
  relatedId: integer("related_id"), // ID of related leave request, attendance, etc.
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Org Positions Table (defines the org chart structure independently of employees)
export const orgPositions = pgTable("org_positions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  department: text("department"),
  parentPositionId: integer("parent_position_id"),
  sortOrder: integer("sort_order").default(0),
  isOutsourced: boolean("is_outsourced").default(false),
  tier: integer("tier").default(1), // Visual tier within siblings: 1 = normal level, higher = pushed down
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrgPositionSchema = createInsertSchema(orgPositions).omit({
  id: true,
  createdAt: true,
});
export type InsertOrgPosition = z.infer<typeof insertOrgPositionSchema>;
export type OrgPosition = typeof orgPositions.$inferSelect;

// Password Reset Tokens Table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  expiry: timestamp("expiry").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Face Descriptors Table (for storing multiple face photos per user to improve recognition)
export const faceDescriptors = pgTable("face_descriptors", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  descriptor: text("descriptor").notNull(), // JSON array of 128 face embedding values
  photoData: text("photo_data"), // Base64 encoded photo for reference
  label: text("label"), // Optional label like "front", "left side", "with glasses"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFaceDescriptorSchema = createInsertSchema(faceDescriptors).omit({
  id: true,
  createdAt: true,
});
export type InsertFaceDescriptor = z.infer<typeof insertFaceDescriptorSchema>;
export type FaceDescriptor = typeof faceDescriptors.$inferSelect;

// Audit Log Table
// Records admin-initiated changes to sensitive data: user profiles, leave balances, settings.
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  actorId: text("actor_id"),          // session userId; null for system-initiated actions
  action: text("action").notNull(),   // e.g. "update_user_profile", "update_leave_balance"
  entityType: text("entity_type").notNull(), // "user" | "leave_balance" | "setting" | "leave_request"
  entityId: text("entity_id"),        // primary key of the affected row (as string)
  changes: jsonb("changes"),          // { field: { before, after } } or event-specific payload
  description: text("description"),   // human-readable one-liner
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// Accrual Rate Tiers Table (spec §5.1, §13.5)
// System-wide, HR-editable. Default: Tier 1 = 15 days/yr (0+ months), Tier 2 = 20 days/yr (24+ months).
export const accrualRateTiers = pgTable("accrual_rate_tiers", {
  id: serial("id").primaryKey(),
  minMonthsOfService: integer("min_months_of_service").notNull(),
  annualEntitlementDays: real("annual_entitlement_days").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AccrualRateTier = typeof accrualRateTiers.$inferSelect;
export type InsertAccrualRateTier = typeof accrualRateTiers.$inferInsert;

// Sick Leave Tracking Table (spec §13.4)
// Per-employee state needed for the graduated accrual period and 36-month cycle resets.
export const sickLeaveTracking = pgTable("sick_leave_tracking", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  sickCycleStartDate: text("sick_cycle_start_date").notNull(),   // 'yyyy-MM-dd'
  graduatedAccrualActive: boolean("graduated_accrual_active").notNull().default(true),
  cumulativeDaysWorked: integer("cumulative_days_worked").notNull().default(0),
  graduatedDaysCredited: integer("graduated_days_credited").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SickLeaveTracking = typeof sickLeaveTracking.$inferSelect;
export type InsertSickLeaveTracking = typeof sickLeaveTracking.$inferInsert;

// Leave Accrual Records Table (spec §12, §4 idempotency)
// One row per accrual event. The unique constraint enforces idempotency: running the
// engine twice for the same (employee, leave_type, accrual_period, event_type) is safe.
export const leaveAccrualRecords = pgTable("leave_accrual_records", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leaveType: text("leave_type").notNull(),
  accrualPeriod: text("accrual_period").notNull(),       // 'YYYY-MM'
  eventType: text("event_type").notNull(),               // see spec §12 event_type enum
  amount: real("amount").notNull(),
  balanceBefore: real("balance_before").notNull(),
  balanceAfter: real("balance_after").notNull(),
  calculationBasis: text("calculation_basis"),
  triggeredBy: text("triggered_by").notNull().default("system"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LeaveAccrualRecord = typeof leaveAccrualRecords.$inferSelect;
export type InsertLeaveAccrualRecord = typeof leaveAccrualRecords.$inferInsert;
