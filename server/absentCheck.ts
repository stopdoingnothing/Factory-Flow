import { storage } from './storage';
import { sendAWOLAlert } from './email';

export interface AbsentCheckResult {
  date: string;
  checked: number;
  absent: number;
  emailsSent: number;
  absentEmployees: { id: string; name: string; department?: string }[];
  note?: string;
}

/** Today's YYYY-MM-DD in the given IANA timezone. */
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Day of week (0 = Sunday … 6 = Saturday) for a YYYY-MM-DD date string. */
function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Is the given date a company-wide public holiday? Recurring holidays match on MM-DD. */
async function isPublicHoliday(dateStr: string): Promise<{ holiday: boolean; name?: string }> {
  const holidays = await storage.getAllPublicHolidays();
  const match = holidays.find(h =>
    h.type !== 'religious' && !h.religionGroup &&
    (h.date === dateStr || (h.isRecurring && h.date.slice(5) === dateStr.slice(5)))
  );
  return match ? { holiday: true, name: match.name } : { holiday: false };
}

/**
 * Runs the same-day absent (AWOL) check:
 * finds active employees who have not clocked in today and have no approved
 * leave covering today, then emails their manager — or the admin email(s)
 * as a fallback for unmanaged employees.
 *
 * Weekend handling: on Saturday only employees with workDaysPerWeek >= 6 are
 * checked, on Sunday only workDaysPerWeek >= 7. Public holidays skip the check.
 */
export async function runAbsentCheck(dateStr?: string): Promise<AbsentCheckResult> {
  const tz = (await storage.getSetting('timezone'))?.value || 'Africa/Johannesburg';
  const senderEmail = (await storage.getSetting('sender_email'))?.value?.trim() || 'noreply@aece.co.za';

  const todayStr = dateStr ?? todayInTz(tz);

  const holidayCheck = await isPublicHoliday(todayStr);
  if (holidayCheck.holiday) {
    return {
      date: todayStr, checked: 0, absent: 0, emailsSent: 0, absentEmployees: [],
      note: `Skipped — public holiday (${holidayCheck.name})`,
    };
  }

  // Active employees expected to clock in today (mirrors the daily AWOL filter in routes.ts)
  const dow = dayOfWeek(todayStr);
  const allUsers = await storage.getAllUsers();
  const activeWorkers = allUsers.filter((u: any) =>
    u.attendanceRequired !== false &&
    !((u.roles || []).some((r: string) => ['admin', 'hr'].includes(r))) &&
    !u.terminationDate &&
    !u.excludeFromLeave &&
    (!u.startDate || u.startDate <= todayStr) &&
    // Weekend: only include employees whose work week covers this day
    (dow !== 6 || (u.workDaysPerWeek ?? 5) >= 6) &&
    (dow !== 0 || (u.workDaysPerWeek ?? 5) >= 7)
  );

  // Who has clocked in today?
  const dayStart = new Date(`${todayStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${todayStr}T23:59:59.999Z`);
  const todayAttendance = await storage.getAllAttendanceRecords(dayStart, dayEnd);
  const clockedInToday = new Set(
    todayAttendance.filter((r: any) => r.type === 'in').map((r: any) => r.userId)
  );

  // Who has approved leave covering today?
  const allLeave = await storage.getLeaveRequests();
  const onLeaveToday = new Set(
    allLeave
      .filter((lr: any) => lr.status === 'approved' && lr.startDate <= todayStr && lr.endDate >= todayStr)
      .map((lr: any) => lr.userId)
  );

  const absentWorkers = activeWorkers.filter((w: any) =>
    !clockedInToday.has(w.id) && !onLeaveToday.has(w.id)
  );

  let emailsSent = 0;

  if (absentWorkers.length > 0) {
    // Group absent workers by manager; fall back to admin_email for unmanaged workers
    const managerToWorkers: Record<string, { manager: { firstName: string; surname: string; email: string }; workers: any[] }> = {};

    const adminSetting = await storage.getSetting('admin_email');
    const adminEmails = adminSetting?.value?.split('\n').map((e: string) => e.trim()).filter(Boolean) || [];

    for (const worker of absentWorkers) {
      const managerIds = [worker.managerId].filter(Boolean) as string[];

      if (managerIds.length === 0) {
        for (const email of adminEmails) {
          if (!managerToWorkers[email]) {
            managerToWorkers[email] = { manager: { firstName: 'Admin', surname: '', email }, workers: [] };
          }
          managerToWorkers[email].workers.push(worker);
        }
      }

      for (const mgId of managerIds) {
        if (!managerToWorkers[mgId]) {
          const manager = await storage.getUser(mgId);
          if (manager?.email) {
            managerToWorkers[mgId] = {
              manager: { firstName: manager.firstName, surname: manager.surname, email: manager.email },
              workers: [],
            };
          }
        }
        if (managerToWorkers[mgId]) {
          managerToWorkers[mgId].workers.push(worker);
        }
      }
    }

    for (const { manager, workers } of Object.values(managerToWorkers)) {
      if (!manager?.email) continue;
      const sent = await sendAWOLAlert(manager.email, senderEmail, {
        managerName: `${manager.firstName} ${manager.surname}`.trim() || 'Admin',
        awolEmployees: workers.map((w: any) => ({
          name: `${w.firstName} ${w.surname}`,
          id: w.id,
          department: w.department || undefined,
        })),
        date: todayStr,
      });
      if (sent) emailsSent++;
    }
  }

  return {
    date: todayStr,
    checked: activeWorkers.length,
    absent: absentWorkers.length,
    emailsSent,
    absentEmployees: absentWorkers.map((w: any) => ({
      id: w.id,
      name: `${w.firstName} ${w.surname}`,
      department: w.department || undefined,
    })),
  };
}
