import { feedbackApi, type FeedbackPayload } from "./api";

const STORAGE_KEY = "ff_pending_feedback";

interface PendingReport {
  id: string;
  payload: FeedbackPayload;
  savedAt: number;
  attempts: number;
}

function loadPending(): PendingReport[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePending(reports: PendingReport[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

function generateIdempotencyKey(payload: FeedbackPayload): string {
  const str = `${payload.type}:${payload.title}:${payload.current_route || ""}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return `ff-${hash.toString(16)}-${Date.now()}`;
}

function persist(payload: FeedbackPayload): string {
  const id = generateIdempotencyKey(payload);
  const pending = loadPending();
  pending.push({ id, payload: { ...payload, idempotency_key: id }, savedAt: Date.now(), attempts: 0 });
  savePending(pending);
  return id;
}

function remove(id: string): void {
  savePending(loadPending().filter(r => r.id !== id));
}

async function attemptSubmit(report: PendingReport): Promise<boolean> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
      await feedbackApi.submit(report.payload);
      return true;
    } catch {
      // continue retrying
    }
  }
  return false;
}

/** Submit feedback: persist first, attempt delivery, remove on success. */
export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  const enriched: FeedbackPayload = {
    ...payload,
    idempotency_key: generateIdempotencyKey(payload),
  };
  const id = persist(enriched);
  const report = loadPending().find(r => r.id === id)!;
  const success = await attemptSubmit(report);
  if (success) remove(id);
}

/** On app start: retry any reports that failed to deliver previously. */
export async function flushPendingFeedback(): Promise<void> {
  const pending = loadPending();
  if (pending.length === 0) return;

  for (const report of pending) {
    // Drop reports older than 48 hours
    if (Date.now() - report.savedAt > 48 * 60 * 60 * 1000) {
      remove(report.id);
      continue;
    }
    const success = await attemptSubmit(report);
    if (success) remove(report.id);
  }
}
