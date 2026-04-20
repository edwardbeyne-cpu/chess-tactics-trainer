import { safeSetItem } from "@/lib/safe-storage";

/**
 * Sprint 8 — Weekly Aggregate Stats Foundation
 *
 * Collects anonymized usage data for eventual Supabase sync.
 * Opt-in only (checked via user settings).
 * No PII. No puzzle IDs. Only statistical aggregates.
 *
 * Storage key: ctt_aggregate_contribution
 * Flag for later Supabase sync: syncPending: true
 */

const AGGREGATE_KEY = "ctt_aggregate_contribution";

export interface PatternAggregate {
  patternName: string;
  tier: number;
  totalAttempts: number;
  solvedFirstTry: number;
  solveRate: number;     // 0-1
  avgSolveTimeMs: number | null;
}

export interface WeeklyAggregate {
  weekKey: string;             // YYYY-WW (ISO week)
  subscriptionTier: string;    // "free" | "improver" | "serious"
  puzzlesThisSession: number;
  ratingGainThisWeek: number;  // tactics rating delta
  patternAggregates: PatternAggregate[];
  syncPending: boolean;        // flag for future Supabase sync
  updatedAt: string;           // ISO timestamp
}

function getISOWeekKey(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getAggregate(): WeeklyAggregate | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(AGGREGATE_KEY) || "null") as WeeklyAggregate | null;
  } catch {
    return null;
  }
}

function saveAggregate(data: WeeklyAggregate): void {
  if (typeof window === "undefined") return;
  safeSetItem(AGGREGATE_KEY, JSON.stringify(data));
}

/**
 * Check if user has opted in to aggregate data collection.
 * Opt-in flag stored under ctt_settings as `contributeAnonymousData`.
 * Defaults to false if not set.
 */
function isOptedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const settings = JSON.parse(localStorage.getItem("ctt_settings") || "null");
    return settings?.contributeAnonymousData === true;
  } catch {
    return false;
  }
}

/**
 * Record a puzzle attempt for aggregate stats.
 * Call this after every puzzle attempt for opted-in users.
 *
 * @param patternName    Pattern name (e.g. "Fork")
 * @param patternTier    Pattern tier (1, 2, or 3)
 * @param solved         True if solved first try
 * @param solveTimeMs    Time to solve in ms (null if failed/hint)
 * @param subscriptionTier  User's subscription tier
 * @param currentRating  Current tactics rating (for weekly delta calc)
 * @param puzzlesInSession  Puzzles attempted in current session
 */
export function recordAggregateAttempt(params: {
  patternName: string;
  patternTier: number;
  solved: boolean;
  solveTimeMs: number | null;
  subscriptionTier: string;
  currentRating: number;
  puzzlesInSession: number;
}): void {
  if (!isOptedIn()) return;
  if (typeof window === "undefined") return;

  const weekKey = getISOWeekKey();
  const existing = getAggregate();

  // Start fresh week if week changed
  const base: WeeklyAggregate =
    existing && existing.weekKey === weekKey
      ? existing
      : {
          weekKey,
          subscriptionTier: params.subscriptionTier,
          puzzlesThisSession: 0,
          ratingGainThisWeek: 0,
          patternAggregates: [],
          syncPending: true,
          updatedAt: new Date().toISOString(),
        };

  // Update session puzzle count
  base.puzzlesThisSession = params.puzzlesInSession;
  base.subscriptionTier = params.subscriptionTier;

  // Upsert pattern aggregate
  const existingPattern = base.patternAggregates.find(
    (p) => p.patternName === params.patternName
  );

  if (existingPattern) {
    existingPattern.totalAttempts += 1;
    if (params.solved) {
      existingPattern.solvedFirstTry += 1;
    }
    existingPattern.solveRate =
      existingPattern.solvedFirstTry / existingPattern.totalAttempts;
    if (params.solveTimeMs !== null && params.solved) {
      // Running average of solve time
      existingPattern.avgSolveTimeMs =
        existingPattern.avgSolveTimeMs === null
          ? params.solveTimeMs
          : (existingPattern.avgSolveTimeMs + params.solveTimeMs) / 2;
    }
  } else {
    base.patternAggregates.push({
      patternName: params.patternName,
      tier: params.patternTier,
      totalAttempts: 1,
      solvedFirstTry: params.solved ? 1 : 0,
      solveRate: params.solved ? 1 : 0,
      avgSolveTimeMs: params.solved ? params.solveTimeMs : null,
    });
  }

  base.updatedAt = new Date().toISOString();
  base.syncPending = true;

  saveAggregate(base);
}

/**
 * Update the weekly rating gain.
 * Call after each tactics rating update.
 */
export function updateWeeklyRatingGain(delta: number): void {
  if (!isOptedIn()) return;
  if (typeof window === "undefined") return;

  const weekKey = getISOWeekKey();
  const existing = getAggregate();
  if (!existing || existing.weekKey !== weekKey) return;

  existing.ratingGainThisWeek += delta;
  existing.updatedAt = new Date().toISOString();
  saveAggregate(existing);
}

/**
 * Get current aggregate data (for debugging / future sync).
 */
export function getAggregateData(): WeeklyAggregate | null {
  return getAggregate();
}

/**
 * Mark aggregate as synced (call after successful Supabase write).
 */
export function markAggregateSynced(): void {
  if (typeof window === "undefined") return;
  const existing = getAggregate();
  if (!existing) return;
  existing.syncPending = false;
  existing.updatedAt = new Date().toISOString();
  saveAggregate(existing);
}
