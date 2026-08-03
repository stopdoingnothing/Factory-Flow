import { storage } from './storage';
import { runAbsentCheck } from './absentCheck';

const LAST_RUN_KEY = 'last_awol_check_date';

function getCurrentDateInTz(tz: string): { dateStr: string; timeStr: string } {
  const parts = new Intl.DateTimeFormat('en-ZA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());

  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    timeStr: `${get('hour')}:${get('minute')}`,
  };
}

/** Adds one hour to an HH:MM string (wraps past midnight). */
function addOneHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The check fires at the `absent_check_time` setting if set; otherwise it
 * defaults to one hour after the clock-in cut-off time.
 */
async function getConfig(): Promise<{ tz: string; checkTime: string }> {
  const tz = (await storage.getSetting('timezone'))?.value || 'Africa/Johannesburg';

  const explicit = (await storage.getSetting('absent_check_time'))?.value;
  if (explicit) return { tz, checkTime: explicit };

  const clockInCutoff = (await storage.getSetting('clock_in_cutoff'))?.value || '08:00';
  return { tz, checkTime: addOneHour(clockInCutoff) };
}

async function getLastRunDate(): Promise<string> {
  try {
    return (await storage.getSetting(LAST_RUN_KEY))?.value || '';
  } catch {
    return '';
  }
}

async function maybeRunCheck(dateStr: string, reason: string) {
  const lastRunDate = await getLastRunDate();
  if (dateStr === lastRunDate) return;

  try {
    await storage.upsertSetting(LAST_RUN_KEY, dateStr);
  } catch (err) {
    console.error('[scheduler] Failed to persist last run date:', err);
  }

  console.log(`[scheduler] Absent check triggered (${reason}) for ${dateStr}`);
  try {
    const result = await runAbsentCheck(dateStr);
    console.log(
      `[scheduler] Absent check complete — ${result.absent} absent of ${result.checked} checked, ` +
      `${result.emailsSent} email(s) sent${result.note ? ` (${result.note})` : ''}`
    );
  } catch (err) {
    console.error('[scheduler] Absent check failed:', err);
  }
}

export async function startScheduler() {
  console.log('[scheduler] Started — daily absent check fires 1h after clock-in cut-off (or at absent_check_time)');

  // ── Startup catch-up ──────────────────────────────────────────────────────
  // If the server restarted after the check time, run it immediately so the
  // window is never silently missed. The last-run date is persisted in the DB
  // so multiple restarts on the same day only fire the check once.
  try {
    const { tz, checkTime } = await getConfig();
    const { dateStr, timeStr } = getCurrentDateInTz(tz);
    if (timeStr >= checkTime) {
      await maybeRunCheck(dateStr, 'startup catch-up');
    }
  } catch (err) {
    console.error('[scheduler] Startup catch-up error:', err);
  }

  // ── Minute-by-minute tick ─────────────────────────────────────────────────
  setInterval(async () => {
    try {
      const { tz, checkTime } = await getConfig();
      const { dateStr, timeStr } = getCurrentDateInTz(tz);

      if (timeStr >= checkTime) {
        await maybeRunCheck(dateStr, `scheduled at ${checkTime}`);
      }
    } catch (err) {
      console.error('[scheduler] Error during interval tick:', err);
    }
  }, 60_000);
}
