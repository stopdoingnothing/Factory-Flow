// Shared backup import logic.
//
// Previously this lived as two ~175-line near-identical copies inside server/routes.ts — one for
// POST /api/backup/import (admin) and one for POST /api/backup/bootstrap-import (empty DB). They had
// already drifted: the bootstrap copy silently lost its `notifications` step. Both now delegate here.
//
// The importer accepts both backup formats:
//   version "1.0" — no `companies`, `orgPositions`, `contractHistory`; users have no `roles[]`
//   version "2.0" — current shape emitted by GET /api/backup/export
// v1.0 payloads are upgraded in memory by normalizeBackupData(); the backup file itself is never
// modified. See docs in normalizeBackupData for the specific compatibility fixes.

import { pool, db, storage } from "./storage";
import * as schema from "@shared/schema";
import { deriveRolesFromLegacy } from "@shared/roles";
import type { ImportReport, TableResult } from "@shared/backup";

export type { ImportReport, TableResult };

// Cap per-table error samples so a systemic failure (e.g. every one of 4992 attendance rows hitting
// the same FK violation) returns a readable report instead of a 4992-element array.
const MAX_ERROR_SAMPLES = 10;

// ── Date revival ────────────────────────────────────────────────────────────
// JSON serialisation turns Date objects into strings — convert them back so Drizzle's timestamp
// columns receive real Date instances. The regex requires a `T` and a time component, so plain
// 'yyyy-MM-dd' text columns (leave start/end dates, public holiday dates) are left as strings.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export function reviveDates(obj: any): any {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates);
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "string" && ISO_DATE_RE.test(v) ? new Date(v) : reviveDates(v);
  }
  return out;
}

// ── Backwards compatibility shim ────────────────────────────────────────────
// Upgrades a v1.0 payload in memory. Every branch is conditional on the older shape, so a v2.0
// backup passes through untouched (verified by the round-trip test).
export function normalizeBackupData(data: any, warnings: string[]): any {
  const users: any[] = Array.isArray(data.users) ? data.users : [];

  // (A) `roles[]` is the RBAC source of truth but did not exist in v1.0. Without this every restored
  // user lands on the column default ARRAY['employee'] and nobody can reach an admin route until the
  // app is restarted and the startup backfill in routes.ts runs.
  let rolesDerived = 0;
  for (const u of users) {
    if (!Array.isArray(u.roles) || u.roles.length === 0) {
      u.roles = deriveRolesFromLegacy(u);
      rolesDerived++;
    }
  }
  if (rolesDerived > 0) {
    const admins = users.filter((u) => u.roles?.includes("admin")).length;
    warnings.push(
      `Derived roles[] for ${rolesDerived} user(s) from the legacy role/adminRole fields (${admins} received the admin role).`
    );
  }

  // (B) users.companyId is a real FK to companies.id. v1.0 backups have no companies array, so every
  // user carrying a companyId would fail the constraint and be silently dropped.
  if (!Array.isArray(data.companies) || data.companies.length === 0) {
    const cleared = users.filter((u) => u.companyId != null).length;
    if (cleared > 0) {
      for (const u of users) u.companyId = null;
      warnings.push(
        `${cleared} user(s) referenced a payroll company but the backup contains no companies — companyId cleared. Reassign these under Settings → Companies.`
      );
    }
  }

  // (E) orgPositionId / reportsToPositionId have no FK constraint, so dangling values import without
  // error but leave a broken org chart. Clear them rather than leave silent corruption behind.
  if (!Array.isArray(data.orgPositions) || data.orgPositions.length === 0) {
    const cleared = users.filter(
      (u) => u.orgPositionId != null || u.reportsToPositionId != null
    ).length;
    if (cleared > 0) {
      for (const u of users) {
        u.orgPositionId = null;
        u.reportsToPositionId = null;
      }
      warnings.push(
        `${cleared} user(s) referenced org chart positions but the backup contains none — orgPositionId cleared. Rebuild the org chart under Settings → Org Chart.`
      );
    }
  }

  // `secondManagerId` exists in migrations/0000 but not in shared/schema.ts. Drizzle iterates the
  // table's columns so the key is dropped anyway; strip it explicitly to keep the payload honest.
  for (const u of users) delete u.secondManagerId;

  // (D) total/taken/pending/carryOverDays are `real NOT NULL DEFAULT 0`, but explicit nulls in the
  // payload defeat the default and raise a not-null violation.
  const balances: any[] = Array.isArray(data.leaveBalances) ? data.leaveBalances : [];
  let coerced = 0;
  for (const b of balances) {
    for (const f of ["total", "taken", "pending", "carryOverDays"] as const) {
      if (b[f] == null) {
        b[f] = 0;
        coerced++;
      }
    }
  }
  if (coerced > 0) {
    warnings.push(`Coerced ${coerced} null leave-balance value(s) to 0.`);
  }

  // (C) Lookup rows are inserted with their original ids below, but sorting by id keeps parent rows
  // ahead of children (org positions) and makes the insert order deterministic.
  for (const key of ["departments", "userGroups", "employeeTypes", "companies", "orgPositions"]) {
    if (Array.isArray(data[key])) {
      data[key] = [...data[key]].sort((a: any, b: any) => (a?.id ?? 0) - (b?.id ?? 0));
    }
  }

  return data;
}

// ── Per-table insert helper ─────────────────────────────────────────────────
// Replaces the previous `catch (e) {}` blocks, which swallowed every failure, and the
// `importedCounts.X = data.X.length` lines, which reported the *input* length as if it were the
// number of rows inserted.
// The `insert` callback returns true when it wrote a row and false when the row was already there.
// A unique/primary-key violation (23505) is also treated as "already there": restores are additive,
// so re-importing the same backup must report 0 inserted rather than N failures.
const UNIQUE_VIOLATION = "23505";

async function runTable(
  report: ImportReport,
  name: string,
  rows: any[] | undefined,
  insert: (row: any) => Promise<boolean>
): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const result: TableResult = { attempted: rows.length, inserted: 0, skipped: 0, failed: 0, errors: [] };
  for (const row of rows) {
    try {
      if (await insert(row)) result.inserted++;
      else result.skipped++;
    } catch (e: any) {
      if (e?.code === UNIQUE_VIOLATION) {
        result.skipped++;
        continue;
      }
      result.failed++;
      if (result.errors.length < MAX_ERROR_SAMPLES) {
        const code = e?.code ? `[${e.code}] ` : "";
        const detail = e?.detail ? ` (${e.detail})` : "";
        result.errors.push(`${code}${e?.message ?? String(e)}${detail}`);
      }
    }
  }

  report.tables[name] = result;
  report.totalInserted += result.inserted;
  report.totalSkipped += result.skipped;
  report.totalFailed += result.failed;
  if (result.failed > 0) {
    console.error(
      `[backup-import] ${name}: ${result.failed}/${result.attempted} row(s) failed. First error: ${result.errors[0]}`
    );
  }
}

// ── Sequence reset ──────────────────────────────────────────────────────────
// Several tables are restored with their original ids (the whole record is passed through so that
// cross-table references survive). Explicit ids do not advance a serial sequence, so without this the
// next natural insert — a kiosk clock-in, a leave request — collides with a duplicate primary key.
const SERIAL_TABLES = [
  "departments",
  "user_groups",
  "employee_types",
  "companies",
  "org_positions",
  "leave_rules",
  "leave_rule_phases",
  "leave_balances",
  "leave_requests",
  "attendance_records",
  "contract_history",
  "grievances",
  "public_holidays",
  "notifications",
  "settings",
  "face_descriptors",
  "audit_logs",
  "accrual_rate_tiers",
  "sick_leave_tracking",
  "leave_accrual_records",
  "password_reset_tokens",
];

export async function resetSequences(): Promise<string[]> {
  const problems: string[] = [];
  for (const table of SERIAL_TABLES) {
    try {
      // to_regclass guards against a table that does not exist yet — pg_get_serial_sequence raises
      // rather than returning NULL for an unknown relation. setval(..., MAX(id)+1, false) means the
      // next nextval() returns exactly MAX(id)+1; COALESCE makes an empty table start at 1.
      await pool.query(
        `
        SELECT setval(
          pg_get_serial_sequence($1, 'id'),
          COALESCE((SELECT MAX(id) FROM ` + `"${table}"` + `), 0) + 1,
          false
        )
        WHERE to_regclass($1) IS NOT NULL
          AND pg_get_serial_sequence($1, 'id') IS NOT NULL
        `,
        [table]
      );
    } catch (e: any) {
      problems.push(`${table}: ${e?.message ?? String(e)}`);
      console.error(`[backup-import] sequence reset failed for ${table}:`, e?.message);
    }
  }
  return problems;
}

// ── Main entry point ────────────────────────────────────────────────────────
// Import order matters: referenced tables before referencing tables. Inserts are additive — an
// existing row with the same primary key is left alone (ON CONFLICT DO NOTHING) rather than
// overwritten. Settings are the deliberate exception: they are upserted by key.
export async function importBackup(rawData: any): Promise<ImportReport> {
  const report: ImportReport = {
    tables: {},
    totalInserted: 0,
    totalSkipped: 0,
    totalFailed: 0,
    warnings: [],
  };

  const data = normalizeBackupData(reviveDates(rawData), report.warnings);

  // Lookup tables are inserted WITH their original ids. The previous implementation field-picked the
  // columns and let serial reassign, which silently rewired users.employeeTypeId / userGroupId to
  // whichever row happened to land on that number — on the AECE backup that mapped 23 permanent
  // employees onto "Consultant" (hasLeaveEntitlement: "no").
  //
  // `.onConflictDoNothing().returning()` yields an empty array when the row was already present,
  // which is how a skip is told apart from an insert.
  await runTable(report, "departments", data.departments, async (d) =>
    (
      await db
        .insert(schema.departments)
        .values({ id: d.id, name: d.name, description: d.description ?? null })
        .onConflictDoNothing()
        .returning({ id: schema.departments.id })
    ).length > 0
  );

  await runTable(report, "userGroups", data.userGroups, async (g) =>
    (
      await db
        .insert(schema.userGroups)
        .values({ id: g.id, name: g.name, description: g.description ?? null })
        .onConflictDoNothing()
        .returning({ id: schema.userGroups.id })
    ).length > 0
  );

  await runTable(report, "employeeTypes", data.employeeTypes, async (t) =>
    (
      await db
        .insert(schema.employeeTypes)
        .values({
          id: t.id,
          name: t.name,
          description: t.description ?? null,
          leaveLabel: t.leaveLabel,
          hasLeaveEntitlement: t.hasLeaveEntitlement,
          isDefault: t.isDefault,
          isPermanent: t.isPermanent,
        })
        .onConflictDoNothing()
        .returning({ id: schema.employeeTypes.id })
    ).length > 0
  );

  await runTable(report, "companies", data.companies, async (c) =>
    (
      await db
        .insert(schema.companies)
        .values({
          id: c.id,
          name: c.name,
          registrationNumber: c.registrationNumber ?? null,
          description: c.description ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: schema.companies.id })
    ).length > 0
  );

  // Sorted by id in normalizeBackupData so parents precede children.
  await runTable(report, "orgPositions", data.orgPositions, async (p) =>
    (
      await db
        .insert(schema.orgPositions)
        .values({
          id: p.id,
          title: p.title,
          department: p.department ?? null,
          parentPositionId: p.parentPositionId ?? null,
          sortOrder: p.sortOrder,
          isOutsourced: p.isOutsourced,
          tier: p.tier,
        })
        .onConflictDoNothing()
        .returning({ id: schema.orgPositions.id })
    ).length > 0
  );

  // Users keep their text primary keys. storage.createUser auto-fills the legacy `name` column from
  // firstName + surname, so it is used rather than a raw insert.
  await runTable(report, "users", data.users, async (u) => {
    if (await storage.getUser(u.id)) return false;
    await storage.createUser(u);
    return true;
  });

  // leaveBalances has no unique constraint on (userId, leaveType), so a duplicate would be inserted
  // rather than rejected. Check explicitly to keep a re-import from giving everyone a second
  // entitlement row. Loaded once up front rather than per row.
  const existingBalanceKeys = new Set(
    (await storage.getAllLeaveBalances()).map((b: any) => `${b.userId} ${b.leaveType}`)
  );
  await runTable(report, "leaveBalances", data.leaveBalances, async (b) => {
    const key = `${b.userId} ${b.leaveType}`;
    if (existingBalanceKeys.has(key)) return false;
    existingBalanceKeys.add(key);
    await storage.createLeaveBalance({
      userId: b.userId,
      leaveType: b.leaveType,
      total: b.total,
      taken: b.taken,
      pending: b.pending,
      carryOverDays: b.carryOverDays,
      carryOverExpiry: b.carryOverExpiry ?? null,
    });
    return true;
  });

  // The remaining tables carry their original ids, so a re-import raises 23505 and runTable counts
  // the row as skipped.
  await runTable(report, "leaveRequests", data.leaveRequests, async (r) => {
    await storage.createLeaveRequest(r);
    return true;
  });
  await runTable(report, "leaveRules", data.leaveRules, async (r) => {
    await storage.createLeaveRule(r);
    return true;
  });
  await runTable(report, "leaveRulePhases", data.leaveRulePhases, async (p) => {
    await storage.createLeaveRulePhase(p);
    return true;
  });
  await runTable(report, "attendanceRecords", data.attendanceRecords, async (r) => {
    await storage.createAttendanceRecord(r);
    return true;
  });
  await runTable(report, "contractHistory", data.contractHistory, async (h) => {
    await storage.createContractHistory(h);
    return true;
  });
  await runTable(report, "grievances", data.grievances, async (g) => {
    await storage.createGrievance(g);
    return true;
  });
  await runTable(report, "publicHolidays", data.publicHolidays, async (h) => {
    await storage.createPublicHoliday(h);
    return true;
  });
  // The bootstrap path previously omitted notifications entirely — restored here for both callers.
  await runTable(report, "notifications", data.notifications, async (n) => {
    await storage.createNotification(n);
    return true;
  });

  // Settings are keyed by name, so this is a genuine upsert and does overwrite existing values.
  await runTable(report, "settings", data.settings, async (s) => {
    await storage.upsertSetting(s.key, s.value);
    return true;
  });

  await runTable(report, "faceDescriptors", data.faceDescriptors, async (fd) => {
    await storage.createFaceDescriptor({
      userId: fd.userId,
      descriptor: fd.descriptor,
      photoData: fd.photoData ?? null,
      label: fd.label ?? null,
    });
    return true;
  });

  const sequenceProblems = await resetSequences();
  if (sequenceProblems.length > 0) {
    report.warnings.push(
      `Could not reset ${sequenceProblems.length} id sequence(s): ${sequenceProblems.join("; ")}. New records in those tables may fail with a duplicate key error.`
    );
  }

  return report;
}

// The two existing clients read `importedCounts` — keep emitting it, but populated with rows actually
// inserted rather than the length of the input array.
export function toImportedCounts(report: ImportReport): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [table, result] of Object.entries(report.tables)) {
    counts[table] = result.inserted;
  }
  return counts;
}
