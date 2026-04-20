// Quota-aware localStorage wrapper.
// localStorage caps at ~5–10MB. Power users hit this in months and writes start
// failing silently. This wrapper detects QuotaExceededError, prunes the largest
// unbounded keys, and retries once.

const UNBOUNDED_KEYS = [
  "ctt_sm2_attempts",
  "ctt_activity_log",
  "ctt_puzzle_times",
  "ctt_personal_puzzles",
  "ctt_attempts",
] as const;

const PRUNE_TARGETS: Record<string, number> = {
  ctt_sm2_attempts: 1000,
  ctt_activity_log: 365,
  ctt_puzzle_times: 500,
  ctt_attempts: 1000,
};

let quotaWarned = false;

function isQuotaError(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  return (
    e.code === 22 ||
    e.code === 1014 ||
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
}

function pruneArrayKey(key: string, keepLast: number): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length <= keepLast) return false;
    const pruned = parsed.slice(parsed.length - keepLast);
    localStorage.setItem(key, JSON.stringify(pruned));
    return true;
  } catch {
    return false;
  }
}

function pruneObjectKey(key: string, keepLast: number): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const entries = Object.entries(parsed);
    if (entries.length <= keepLast) return false;
    // Keep the most recently inserted entries (object key order is insertion order)
    const kept = Object.fromEntries(entries.slice(entries.length - keepLast));
    localStorage.setItem(key, JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}

function attemptPrune(): boolean {
  let prunedSomething = false;
  for (const key of UNBOUNDED_KEYS) {
    const target = PRUNE_TARGETS[key] ?? 500;
    if (pruneArrayKey(key, target) || pruneObjectKey(key, target)) {
      prunedSomething = true;
    }
  }
  return prunedSomething;
}

export type StorageWriteResult = "ok" | "quota_exceeded" | "unavailable";

export function safeSetItem(key: string, value: string): StorageWriteResult {
  if (typeof window === "undefined") return "unavailable";
  try {
    localStorage.setItem(key, value);
    return "ok";
  } catch (e) {
    if (!isQuotaError(e)) throw e;
    if (attemptPrune()) {
      try {
        localStorage.setItem(key, value);
        return "ok";
      } catch (retry) {
        if (!isQuotaError(retry)) throw retry;
      }
    }
    if (!quotaWarned) {
      quotaWarned = true;
      console.warn(`localStorage quota exceeded; write to "${key}" dropped.`);
      try {
        // Best-effort analytics ping; ignored if PostHog not loaded.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        if (w.posthog?.capture) {
          w.posthog.capture("storage_quota_exceeded", { key });
        }
      } catch { /* noop */ }
    }
    return "quota_exceeded";
  }
}

export function safeRemoveItem(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch { /* noop */ }
}

// Run once on app startup to keep unbounded keys trimmed proactively.
let initialized = false;
export function initStorageMaintenance(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    attemptPrune();
  } catch { /* noop */ }
}
