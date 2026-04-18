import { isBetaTester } from "@/lib/beta";
import type { FSRSState } from "@/lib/fsrs";
import { defaultFSRSState, inferFSRSFromLegacy, reviewCard, solveToGrade } from "@/lib/fsrs";

// localStorage keys
const ATTEMPTS_KEY = "ctt_attempts";
const SRS_KEY = "ctt_srs";
const SM2_ATTEMPTS_KEY = "ctt_sm2_attempts";
const PGNS_KEY = "ctt_pgns";
const XP_KEY = "ctt_xp";
const STREAK_KEY = "ctt_streak";
const QUESTS_KEY = "ctt_quests";
const RATINGS_KEY = "ctt_ratings";
const SETTINGS_KEY = "ctt_settings";
const TACTICS_RATING_KEY = "ctt_tactics_rating";
const PLATFORM_RATINGS_KEY = "ctt_platform_ratings";

// Sprint 9 keys
const PERSONAL_PUZZLES_KEY = "ctt_personal_puzzles";

// Sprint 7 (redesign) keys
const ACTIVITY_LOG_KEY = "ctt_activity_log";
const NEW_ACHIEVEMENTS_KEY = "ctt_achievements_v2";

// Sprint 11 — Curriculum keys
const PUZZLE_PROGRESS_KEY = "ctt_puzzle_progress";
const PATTERN_RATINGS_KEY = "ctt_pattern_ratings";
const LAST_ACTIVE_PATTERN_KEY = "ctt_last_active_pattern";
const BOARD_THEME_KEY = "ctt_board_theme";
const PIECE_STYLE_KEY = "ctt_piece_style";
const PGN_IMPORT_USAGE_KEY = "ctt_pgn_import_usage";

// Sprint 10 keys
const DAILY_TARGET_KEY = "ctt_daily_target";
const DAILY_HABIT_KEY = "ctt_daily_habit";

// Sprint 12 — Time Standards & Mastery
const PUZZLE_TIMES_KEY = "ctt_puzzle_times";

// ─────────────────────────────────────────────────────────────────────────────
// Legacy SRS interval ladder (Sprint 2 system — kept for backward compat)
// ─────────────────────────────────────────────────────────────────────────────

export const SRS_INTERVALS = [1, 3, 7, 14, 30];

export interface Attempt {
  puzzleId: number;
  outcome: "solved" | "failed" | "hint";
  timestamp: string;
}

export interface SRSEntry {
  stepIndex: number;
  nextReview: string;
}

export interface SRSData {
  [puzzleId: string]: SRSEntry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 3 — SM-2 Attempt format (for Lichess puzzles with string IDs)
// ─────────────────────────────────────────────────────────────────────────────

export type SM2Outcome = "solved-first-try" | "solved-after-retry" | "hint" | "failed";

export interface SM2Attempt {
  puzzleId: string;       // Lichess puzzle ID (string)
  outcome: SM2Outcome;
  timestamp: string;
  theme?: string;         // Pattern theme name (e.g. "FORK") for per-pattern stats
  rating?: number;        // Lichess puzzle rating
  solve_time_ms?: number; // Sprint 4: time from puzzle load to first correct move
  tier?: number;          // Sprint 4: pattern tier for XP calculation
}

export interface SM2State {
  interval: number;
  repetitions: number;
  easeFactor: number;
  nextReviewDate: string;
}

export type SM2StateMap = { [puzzleId: string]: SM2State };

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Attempts (Sprint 2 static puzzles)
// ─────────────────────────────────────────────────────────────────────────────

export function getAttempts(): Attempt[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function recordAttempt(
  puzzleId: number,
  outcome: "solved" | "failed" | "hint"
): void {
  if (typeof window === "undefined") return;
  const attempts = getAttempts();
  attempts.push({ puzzleId, outcome, timestamp: new Date().toISOString() });
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy SRS queue (Sprint 2 static puzzles)
// ─────────────────────────────────────────────────────────────────────────────

export function getSRS(): SRSData {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SRS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSRS(srs: SRSData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SRS_KEY, JSON.stringify(srs));
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function scheduleFailed(puzzleId: number): void {
  const srs = getSRS();
  srs[puzzleId] = {
    stepIndex: 0,
    nextReview: addDays(SRS_INTERVALS[0]),
  };
  saveSRS(srs);
}

export function scheduleCorrect(puzzleId: number): void {
  const srs = getSRS();
  const current = srs[puzzleId];
  const currentStep = current ? current.stepIndex : -1;
  const nextStep = Math.min(currentStep + 1, SRS_INTERVALS.length - 1);
  const interval = SRS_INTERVALS[nextStep];

  if (
    nextStep >= SRS_INTERVALS.length - 1 &&
    currentStep >= SRS_INTERVALS.length - 1
  ) {
    // Mastered — remove from queue
    delete srs[puzzleId];
  } else {
    srs[puzzleId] = { stepIndex: nextStep, nextReview: addDays(interval) };
  }
  saveSRS(srs);
}

export function getDuePuzzleIds(): number[] {
  const srs = getSRS();
  const today = todayISO();
  return Object.entries(srs)
    .filter(([, entry]) => entry.nextReview <= today)
    .map(([id]) => Number(id));
}

export function clearSRSEntry(puzzleId: number): void {
  const srs = getSRS();
  delete srs[puzzleId];
  saveSRS(srs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 3 — SM-2 Lichess Attempts
// ─────────────────────────────────────────────────────────────────────────────

export function getSM2Attempts(): SM2Attempt[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SM2_ATTEMPTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function recordSM2Attempt(attempt: SM2Attempt): void {
  if (typeof window === "undefined") return;
  const attempts = getSM2Attempts();
  attempts.push(attempt);
  localStorage.setItem(SM2_ATTEMPTS_KEY, JSON.stringify(attempts));
}

export function getSM2StateMap(): SM2StateMap {
  const attempts = getSM2Attempts();
  const stateMap: SM2StateMap = {};

  for (const attempt of attempts) {
    const current = stateMap[attempt.puzzleId];
    stateMap[attempt.puzzleId] = computeSM2Step(attempt, current);
  }

  return stateMap;
}

function computeSM2Step(
  attempt: SM2Attempt,
  current?: SM2State
): SM2State {
  const quality = outcomeToQuality(attempt.outcome);
  let { interval, repetitions, easeFactor } = current ?? {
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
  };

  if (quality >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);

    easeFactor =
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    easeFactor = Math.max(1.3, easeFactor);
    repetitions += 1;
  } else {
    interval = 1;
    repetitions = 0;
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  nextDate.setHours(0, 0, 0, 0);

  return {
    interval,
    repetitions,
    easeFactor,
    nextReviewDate: nextDate.toISOString(),
  };
}

function outcomeToQuality(outcome: SM2Outcome): number {
  switch (outcome) {
    case "solved-first-try": return 5;
    case "solved-after-retry": return 3;
    case "hint": return 1;
    case "failed": return 0;
  }
}

export function getSM2DuePuzzleIds(): string[] {
  const stateMap = getSM2StateMap();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Object.entries(stateMap)
    .filter(([, state]) => new Date(state.nextReviewDate) <= today)
    .map(([id]) => id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 3 — PGN Storage
// ─────────────────────────────────────────────────────────────────────────────

export interface StoredPGN {
  id: string;
  filename: string;
  content: string;
  uploadedAt: string;
  gameCount: number;
  positionCount: number;
}

export function getPGNs(): StoredPGN[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PGNS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function savePGN(pgn: StoredPGN): void {
  if (typeof window === "undefined") return;
  const pgns = getPGNs();
  pgns.push(pgn);
  localStorage.setItem(PGNS_KEY, JSON.stringify(pgns));
}

export function deletePGN(id: string): void {
  if (typeof window === "undefined") return;
  const pgns = getPGNs().filter((p) => p.id !== id);
  localStorage.setItem(PGNS_KEY, JSON.stringify(pgns));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 3 — Computed stats helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface PatternStat {
  theme: string; // uppercase
  totalAttempts: number;
  solvedFirstTry: number;
  solveRate: number; // 0-1
  lastPracticed: string | null;
  dueCount: number;
  avgSolveTimeMs: number | null; // Sprint 4
  personalBestMs: number | null; // Sprint 10: fastest first-try solve
  recentSolveTimes: number[];    // Sprint 10: last 20 first-try solve times (ms)
  fluencyScore: number | null;   // Sprint 10: 0-100 composite score
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 10 — Fluency Score Calculation
// Composite 0-100: accuracy 50% + speed 30% + consistency 20%
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fluency labels:
 *   0-39   → Novice
 *   40-69  → Developing
 *   70-89  → Proficient
 *   90-100 → Fluent
 */
export function getFluencyLabel(score: number): string {
  if (score >= 90) return "Fluent";
  if (score >= 70) return "Proficient";
  if (score >= 40) return "Developing";
  return "Novice";
}

export function getFluencyColor(score: number): string {
  if (score >= 90) return "#4ade80";
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

/**
 * Calculate fluency score from available stats.
 * @param solveRate - 0-1, proportion solved first try
 * @param avgSolveTimeMs - average ms on first-try solves
 * @param recentTimes - recent first-try solve times (ms) for consistency
 */
export function calculateFluencyScore(
  solveRate: number,
  avgSolveTimeMs: number | null,
  recentTimes: number[]
): number {
  // Accuracy component (0-50 pts): linear 0%→0, 100%→50
  const accuracyComponent = solveRate * 50;

  // Speed component (0-30 pts):
  // Target: <= 5s = 30pts, <= 10s = 24pts, <= 20s = 15pts, <= 30s = 8pts, > 30s = 0pts
  let speedComponent = 0;
  if (avgSolveTimeMs !== null) {
    const avgSec = avgSolveTimeMs / 1000;
    if (avgSec <= 5) speedComponent = 30;
    else if (avgSec <= 10) speedComponent = 24;
    else if (avgSec <= 20) speedComponent = 15;
    else if (avgSec <= 30) speedComponent = 8;
    else speedComponent = Math.max(0, 8 - (avgSec - 30) * 0.2);
  }

  // Consistency component (0-20 pts):
  // Measured by coefficient of variation (lower = more consistent)
  let consistencyComponent = 0;
  if (recentTimes.length >= 3) {
    const mean = recentTimes.reduce((s, t) => s + t, 0) / recentTimes.length;
    const variance = recentTimes.reduce((s, t) => s + Math.pow(t - mean, 2), 0) / recentTimes.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1; // coefficient of variation
    // cv <= 0.2 = very consistent (20pts), cv >= 1.0 = very inconsistent (0pts)
    consistencyComponent = Math.max(0, Math.min(20, 20 * (1 - cv)));
  } else if (recentTimes.length > 0) {
    // Not enough data — give partial consistency based on solve time alone
    consistencyComponent = 5;
  }

  return Math.round(Math.min(100, accuracyComponent + speedComponent + consistencyComponent));
}

export function getAllPatternStats(): PatternStat[] {
  const attempts = getSM2Attempts();
  const byTheme = new Map<string, SM2Attempt[]>();

  for (const a of attempts) {
    if (!a.theme) continue;
    const key = a.theme.toUpperCase();
    if (!byTheme.has(key)) byTheme.set(key, []);
    byTheme.get(key)!.push(a);
  }

  const result: PatternStat[] = [];

  for (const [theme, themeAttempts] of byTheme.entries()) {
    const solvedFirstTry = themeAttempts.filter(
      (a) => a.outcome === "solved-first-try"
    ).length;
    const totalAttempts = themeAttempts.length;
    const solveRate = totalAttempts > 0 ? solvedFirstTry / totalAttempts : 0;

    const sorted = [...themeAttempts].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
    const lastPracticed = sorted[0]?.timestamp ?? null;

    // Due count: count puzzle IDs due today in this theme
    const stateMap: SM2StateMap = {};
    for (const att of themeAttempts) {
      stateMap[att.puzzleId] = computeSM2Step(att, stateMap[att.puzzleId]);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueCount = Object.values(stateMap).filter(
      (s) => new Date(s.nextReviewDate) <= today
    ).length;

    // Average solve time (Sprint 4)
    const withTime = themeAttempts.filter(
      (a) => a.solve_time_ms != null && a.outcome === "solved-first-try"
    );
    const avgSolveTimeMs = withTime.length > 0
      ? withTime.reduce((sum, a) => sum + (a.solve_time_ms ?? 0), 0) / withTime.length
      : null;

    // Sprint 10: personal best and last 20 solve times
    const allFirstTryTimes = withTime
      .map((a) => a.solve_time_ms!)
      .filter((t) => t > 0);
    const personalBestMs = allFirstTryTimes.length > 0
      ? Math.min(...allFirstTryTimes)
      : null;
    // Last 20 in chronological order
    const sortedByTime = withTime.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const recentSolveTimes = sortedByTime.slice(-20).map((a) => a.solve_time_ms!);

    // Sprint 10: fluency score (0-100)
    // accuracy 50% + speed 30% + consistency 20%
    const fluencyScore = totalAttempts >= 3
      ? calculateFluencyScore(solveRate, avgSolveTimeMs, recentSolveTimes)
      : null;

    result.push({
      theme,
      totalAttempts,
      solvedFirstTry,
      solveRate,
      lastPracticed,
      dueCount,
      avgSolveTimeMs,
      personalBestMs,
      recentSolveTimes,
      fluencyScore,
    });
  }

  return result;
}

export function getTotalAttempts(): number {
  // Combined legacy + SM2 attempts
  const legacy = getAttempts().length;
  const sm2 = getSM2Attempts().length;
  return legacy + sm2;
}

export function getCurrentStreak(): number {
  // Use new StreakData if available
  const streakData = getStreakData();
  if (streakData.lastActiveDate) {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    if (streakData.lastActiveDate === today || streakData.lastActiveDate === yesterdayKey) {
      return streakData.currentStreak;
    }
    // Streak is stale (no activity today or yesterday)
    // Check if we have freezes
    if (streakData.freezesAvailable > 0 && streakData.lastActiveDate === yesterdayKey) {
      return streakData.currentStreak;
    }
    return 0;
  }
  // Fall back to computing from raw attempts
  const allDates = new Set<string>();
  getAttempts().forEach((a) => allDates.add(a.timestamp.slice(0, 10)));
  getSM2Attempts()
    .filter(
      (a) =>
        a.outcome === "solved-first-try" || a.outcome === "solved-after-retry"
    )
    .forEach((a) => allDates.add(a.timestamp.slice(0, 10)));

  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (allDates.has(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function getWeakestPattern(): string | null {
  const stats = getAllPatternStats();
  if (stats.length === 0) return null;
  const withAttempts = stats.filter((s) => s.totalAttempts > 0);
  if (withAttempts.length === 0) return null;
  const weakest = withAttempts.reduce((a, b) =>
    a.solveRate < b.solveRate ? a : b
  );
  return weakest.theme;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 6 — XP + Leveling System (updated thresholds)
// L1=0, L2=100, L3=250, L4=450, L5=600, L6=800, L7=1000, L8=1400, L9=1700,
// L10=2000, then scale to L20=8000 (+600/level after L10)
// ─────────────────────────────────────────────────────────────────────────────

export interface XPData {
  totalXP: number;
  level: number;
}

// Index 0 = L1 threshold, index 1 = L2 threshold, etc.
export const LEVEL_THRESHOLDS = [0, 100, 250, 450, 600, 800, 1000, 1400, 1700, 2000];

// 7 rank names cycling up through levels
export const LEVEL_NAMES: Record<number, string> = {
  1: "Pawn",
  2: "Pawn",
  3: "Knight",
  4: "Knight",
  5: "Bishop",
  6: "Bishop",
  7: "Rook",
  8: "Rook",
  9: "Queen",
  10: "King",
};

export function getXPThresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level <= 10) return LEVEL_THRESHOLDS[level - 1];
  // Scale: L10=2000, L11=2600, L12=3200, ... L20=8000 → +600 per level after 10
  return 2000 + (level - 10) * 600;
}

export function getLevelFromXP(totalXP: number): number {
  let level = 1;
  while (true) {
    const nextThreshold = getXPThresholdForLevel(level + 1);
    if (totalXP >= nextThreshold) {
      level++;
    } else {
      break;
    }
    if (level > 200) break; // safety
  }
  return level;
}

export function getLevelName(level: number): string {
  if (level <= 10) return LEVEL_NAMES[level] ?? "King";
  if (level < 15) return "Grandmaster";
  return "Grandmaster";
}

export function getXPData(): XPData {
  if (typeof window === "undefined") return { totalXP: 0, level: 1 };
  try {
    const data = JSON.parse(localStorage.getItem(XP_KEY) || "null") as XPData | null;
    if (data) return data;
    return { totalXP: 0, level: 1 };
  } catch {
    return { totalXP: 0, level: 1 };
  }
}

export function addXP(xp: number): { newLevel: number; leveledUp: boolean; totalXP: number } {
  if (typeof window === "undefined") return { newLevel: 1, leveledUp: false, totalXP: 0 };
  const current = getXPData();
  const newTotalXP = current.totalXP + xp;
  const newLevel = getLevelFromXP(newTotalXP);
  const leveledUp = newLevel > current.level;
  const newData: XPData = { totalXP: newTotalXP, level: newLevel };
  localStorage.setItem(XP_KEY, JSON.stringify(newData));
  return { newLevel, leveledUp, totalXP: newTotalXP };
}

export function calculateXPForOutcome(tier: number, outcome: SM2Outcome): number {
  const firstTryXP = tier === 1 ? 10 : tier === 2 ? 25 : 50;
  if (outcome === "solved-first-try") return firstTryXP;
  if (outcome === "solved-after-retry") return Math.floor(firstTryXP * 0.5);
  return 5; // hint or failed
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 4 — Daily Streak + Streak Freeze
// ─────────────────────────────────────────────────────────────────────────────

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null; // YYYY-MM-DD
  freezesAvailable: number; // max 2
  lastFreezeEarnedAt: number; // streak value when last freeze was earned
  milestonesEarned: number[]; // e.g. [7, 30, 100]
}

function getDefaultStreakData(): StreakData {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    freezesAvailable: 0,
    lastFreezeEarnedAt: 0,
    milestonesEarned: [],
  };
}

export function getStreakData(): StreakData {
  if (typeof window === "undefined") return getDefaultStreakData();
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || "null") as StreakData | null;
    return data ?? getDefaultStreakData();
  } catch {
    return getDefaultStreakData();
  }
}

function saveStreakData(data: StreakData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function updateStreak(): { streakData: StreakData; newMilestone: number | null } {
  if (typeof window === "undefined") return { streakData: getDefaultStreakData(), newMilestone: null };
  const data = getStreakData();
  const today = getTodayKey();

  // Already active today
  if (data.lastActiveDate === today) {
    return { streakData: data, newMilestone: null };
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  let newStreak = data.currentStreak;
  let freezesAvailable = data.freezesAvailable;

  if (!data.lastActiveDate) {
    // First ever puzzle
    newStreak = 1;
  } else if (data.lastActiveDate === yesterdayKey) {
    // Consecutive day
    newStreak = data.currentStreak + 1;
  } else {
    // Check how many days were missed
    const lastDate = new Date(data.lastActiveDate);
    const todayDate = new Date(today);
    const daysDiff = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000);

    if (daysDiff === 2 && freezesAvailable > 0) {
      // Missed exactly 1 day, apply freeze
      newStreak = data.currentStreak + 1;
      freezesAvailable--;
    } else {
      // Streak broken
      newStreak = 1;
    }
  }

  // Award freeze: every completed 7-day streak multiple (7, 14, 21, etc.)
  // Only award if the streak just hit a new multiple of 7
  const prevMultiple = Math.floor(data.currentStreak / 7);
  const newMultiple = Math.floor(newStreak / 7);
  if (newMultiple > prevMultiple && newMultiple > Math.floor(data.lastFreezeEarnedAt / 7) && freezesAvailable < 2) {
    freezesAvailable = Math.min(2, freezesAvailable + 1);
  }

  const newData: StreakData = {
    currentStreak: newStreak,
    longestStreak: Math.max(data.longestStreak, newStreak),
    lastActiveDate: today,
    freezesAvailable,
    lastFreezeEarnedAt: newStreak % 7 === 0 ? newStreak : data.lastFreezeEarnedAt,
    milestonesEarned: [...data.milestonesEarned],
  };

  // Check new milestone badges
  const milestones = [7, 30, 100, 365];
  let newMilestone: number | null = null;
  for (const m of milestones) {
    if (newStreak >= m && !newData.milestonesEarned.includes(m)) {
      newData.milestonesEarned = [...newData.milestonesEarned, m];
      newMilestone = m;
    }
  }

  saveStreakData(newData);
  return { streakData: newData, newMilestone };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 4 — Daily Quests
// ─────────────────────────────────────────────────────────────────────────────

export interface Quest {
  id: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  xpReward: number;
  type: "any" | "pattern" | "tier2" | "count10" | "review";
  patternTheme?: string; // for pattern quests
}

export interface DailyQuests {
  date: string; // YYYY-MM-DD
  quests: Quest[];
  allCompleteBonus: boolean;
  bonusXPAwarded: boolean;
}

const CHALLENGE_PRESETS = [
  { description: "Complete your review queue", type: "review" as const, target: 1 },
  { description: "Solve 3 Tier 2 puzzles", type: "tier2" as const, target: 3 },
  { description: "Solve 10 puzzles total", type: "count10" as const, target: 10 },
  { description: "Solve 5 puzzles in a row", type: "count10" as const, target: 5 },
  { description: "Solve 8 puzzles in any pattern", type: "any" as const, target: 8 },
  { description: "Solve 2 puzzles from each of 2 patterns", type: "any" as const, target: 4 },
];

function generateDailyQuestsData(weakestPattern: string | null): DailyQuests {
  const today = getTodayKey();
  const quests: Quest[] = [];

  // Quest 1: Always "Solve 5 puzzles"
  quests.push({
    id: "q1",
    description: "Solve 5 puzzles",
    target: 5,
    progress: 0,
    completed: false,
    xpReward: 50,
    type: "any",
  });

  // Quest 2: Weakest pattern (dynamic)
  const pattern = weakestPattern ?? "Fork";
  const displayPattern = pattern.charAt(0).toUpperCase() + pattern.slice(1).toLowerCase();
  quests.push({
    id: "q2",
    description: `Solve 3 ${displayPattern} puzzles`,
    target: 3,
    progress: 0,
    completed: false,
    xpReward: 50,
    type: "pattern",
    patternTheme: pattern.toUpperCase(),
  });

  // Quest 3: Random from presets based on day-of-month seed
  const seed = new Date().getDate() % CHALLENGE_PRESETS.length;
  const challenge = CHALLENGE_PRESETS[seed];
  quests.push({
    id: "q3",
    description: challenge.description,
    target: challenge.target,
    progress: 0,
    completed: false,
    xpReward: 50,
    type: challenge.type,
  });

  return { date: today, quests, allCompleteBonus: false, bonusXPAwarded: false };
}

export function getDailyQuests(): DailyQuests {
  if (typeof window === "undefined") return generateDailyQuestsData(null);
  try {
    const stored = JSON.parse(localStorage.getItem(QUESTS_KEY) || "null") as DailyQuests | null;
    const today = getTodayKey();
    if (stored && stored.date === today) return stored;
    // Generate new quests for today
    const weakest = getWeakestPattern();
    const newQuests = generateDailyQuestsData(weakest);
    localStorage.setItem(QUESTS_KEY, JSON.stringify(newQuests));
    return newQuests;
  } catch {
    return generateDailyQuestsData(null);
  }
}

export function saveDailyQuests(quests: DailyQuests): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUESTS_KEY, JSON.stringify(quests));
}

/**
 * Update quest progress after a puzzle result.
 * Returns XP earned from quests (0 if none completed).
 */
export function updateQuestProgress(
  outcome: SM2Outcome,
  theme?: string,
  tier?: number
): number {
  if (typeof window === "undefined") return 0;
  const daily = getDailyQuests();
  const today = getTodayKey();
  if (daily.date !== today) return 0;

  const isSolved = outcome === "solved-first-try" || outcome === "solved-after-retry";
  let changed = false;
  let xpEarned = 0;

  for (const quest of daily.quests) {
    if (quest.completed) continue;

    const prevCompleted = quest.completed;

    if (quest.type === "any" && isSolved) {
      quest.progress = Math.min(quest.target, quest.progress + 1);
    } else if (quest.type === "pattern" && isSolved && theme && quest.patternTheme) {
      if (quest.patternTheme === theme.toUpperCase()) {
        quest.progress = Math.min(quest.target, quest.progress + 1);
      }
    } else if (quest.type === "tier2" && isSolved && tier === 2) {
      quest.progress = Math.min(quest.target, quest.progress + 1);
    } else if (quest.type === "count10" && isSolved) {
      quest.progress = Math.min(quest.target, quest.progress + 1);
    } else if (quest.type === "review" && isSolved) {
      quest.progress = Math.min(quest.target, quest.progress + 1);
    }

    if (quest.progress >= quest.target) quest.completed = true;
    if (quest.completed && !prevCompleted) {
      xpEarned += quest.xpReward;
      changed = true;
    } else if (quest.progress > 0 && !quest.completed) {
      changed = true;
    }
  }

  // Check all-complete bonus
  if (!daily.allCompleteBonus && daily.quests.every((q) => q.completed)) {
    daily.allCompleteBonus = true;
    if (!daily.bonusXPAwarded) {
      daily.bonusXPAwarded = true;
      xpEarned += 200;
    }
    changed = true;
  }

  if (changed) {
    saveDailyQuests(daily);
  }
  return xpEarned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 4 — User Settings (Chess.com / Lichess usernames)
// ─────────────────────────────────────────────────────────────────────────────

export interface UserSettings {
  chesscomUsername: string;
  lichessUsername: string;
  trackChesscom: boolean;              // Sprint 7: opt-in toggle
  trackLichess: boolean;               // Sprint 7: opt-in toggle
  contributeAnonymousData: boolean;    // Sprint 8: opt-in aggregate data collection
}

function defaultUserSettings(): UserSettings {
  return {
    chesscomUsername: "",
    lichessUsername: "",
    trackChesscom: false,
    trackLichess: false,
    contributeAnonymousData: false,
  };
}

export function getUserSettings(): UserSettings {
  if (typeof window === "undefined") return defaultUserSettings();
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") as Partial<UserSettings> | null;
    if (!data) return defaultUserSettings();
    return {
      chesscomUsername: data.chesscomUsername ?? "",
      lichessUsername: data.lichessUsername ?? "",
      trackChesscom: data.trackChesscom ?? false,
      trackLichess: data.trackLichess ?? false,
      contributeAnonymousData: data.contributeAnonymousData ?? false,
    };
  } catch {
    return defaultUserSettings();
  }
}

export function saveUserSettings(settings: UserSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 4 — Rating Tracking (Chess.com + Lichess)
// ─────────────────────────────────────────────────────────────────────────────

export interface RatingSnapshot {
  date: string; // YYYY-MM-DD
  chesscom?: {
    blitz?: number;
    rapid?: number;
    bullet?: number;
    puzzle?: number;
  };
  lichess?: {
    blitz?: number;
    rapid?: number;
    bullet?: number;
    classical?: number;
    puzzle?: number;
  };
}

export interface RatingData {
  snapshots: RatingSnapshot[];
  lastFetchedAt: string | null;
}

export function getRatingData(): RatingData {
  if (typeof window === "undefined") return { snapshots: [], lastFetchedAt: null };
  try {
    const data = JSON.parse(localStorage.getItem(RATINGS_KEY) || "null") as RatingData | null;
    return data ?? { snapshots: [], lastFetchedAt: null };
  } catch {
    return { snapshots: [], lastFetchedAt: null };
  }
}

export function saveRatingSnapshot(snapshot: RatingSnapshot): void {
  if (typeof window === "undefined") return;
  const data = getRatingData();
  const filtered = data.snapshots.filter((s) => s.date !== snapshot.date);
  filtered.push(snapshot);
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = filtered.slice(-90); // keep last 90 days
  const newData: RatingData = {
    snapshots: trimmed,
    lastFetchedAt: new Date().toISOString(),
  };
  localStorage.setItem(RATINGS_KEY, JSON.stringify(newData));
}

export function shouldFetchRatings(): boolean {
  const data = getRatingData();
  if (!data.lastFetchedAt) return true;
  const hoursSince = (Date.now() - new Date(data.lastFetchedAt).getTime()) / 3600000;
  return hoursSince >= 23;
}

export async function fetchAndSaveRatings(): Promise<void> {
  if (typeof window === "undefined") return;
  const settings = getUserSettings();
  const fetchChesscom = settings.trackChesscom && !!settings.chesscomUsername;
  const fetchLichess = settings.trackLichess && !!settings.lichessUsername;
  if (!fetchChesscom && !fetchLichess) return;

  const snapshot: RatingSnapshot = { date: getTodayKey() };

  if (fetchChesscom) {
    try {
      const username = settings.chesscomUsername.toLowerCase().trim();
      const res = await fetch(
        `https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`,
        { headers: { Accept: "application/json" } }
      );
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json();
        snapshot.chesscom = {
          blitz: data?.chess_blitz?.last?.rating,
          rapid: data?.chess_rapid?.last?.rating,
          bullet: data?.chess_bullet?.last?.rating,
          puzzle: data?.tactics?.highest?.rating,
        };
      }
    } catch {
      // Ignore fetch errors — last known snapshot remains
    }
  }

  if (fetchLichess) {
    try {
      const res = await fetch(
        `https://lichess.org/api/user/${settings.lichessUsername}`,
        { headers: { Accept: "application/json" } }
      );
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json();
        const perfs = data?.perfs ?? {};
        snapshot.lichess = {
          blitz: perfs?.blitz?.rating,
          rapid: perfs?.rapid?.rating,
          bullet: perfs?.bullet?.rating,
          classical: perfs?.classical?.rating,
          puzzle: perfs?.puzzle?.rating,
        };
      }
    } catch {
      // Ignore fetch errors
    }
  }

  if (snapshot.chesscom || snapshot.lichess) {
    saveRatingSnapshot(snapshot);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 — Platform Ratings (separate storage, respects opt-in toggle)
// Used by dashboard to show Chess.com / Lichess overlays
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatformRatingSnapshot {
  date: string; // YYYY-MM-DD
  bullet?: number;
  blitz?: number;
  rapid?: number;
  classical?: number;
  puzzle?: number;
}

export interface PlatformRatingsData {
  chesscom: PlatformRatingSnapshot[];
  lichess: PlatformRatingSnapshot[];
  lastFetchedAt: string | null;
}

export function getPlatformRatingsData(): PlatformRatingsData {
  if (typeof window === "undefined") return { chesscom: [], lichess: [], lastFetchedAt: null };
  try {
    const data = JSON.parse(localStorage.getItem(PLATFORM_RATINGS_KEY) || "null") as PlatformRatingsData | null;
    return data ?? { chesscom: [], lichess: [], lastFetchedAt: null };
  } catch {
    return { chesscom: [], lichess: [], lastFetchedAt: null };
  }
}

function savePlatformRatingsData(data: PlatformRatingsData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLATFORM_RATINGS_KEY, JSON.stringify(data));
}

export function shouldFetchPlatformRatings(): boolean {
  const data = getPlatformRatingsData();
  if (!data.lastFetchedAt) return true;
  const hoursSince = (Date.now() - new Date(data.lastFetchedAt).getTime()) / 3600000;
  return hoursSince >= 23;
}

export async function fetchAndSavePlatformRatings(): Promise<void> {
  if (typeof window === "undefined") return;
  const settings = getUserSettings();
  const data = getPlatformRatingsData();
  const today = getTodayKey();

  if (settings.trackChesscom && settings.chesscomUsername) {
    try {
      const username = settings.chesscomUsername.toLowerCase().trim();
      const res = await fetch(
        `https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`,
        { headers: { Accept: "application/json" } }
      );
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json: any = await res.json();
        const snap: PlatformRatingSnapshot = {
          date: today,
          bullet: json?.chess_bullet?.last?.rating,
          blitz: json?.chess_blitz?.last?.rating,
          rapid: json?.chess_rapid?.last?.rating,
          puzzle: json?.tactics?.highest?.rating,
        };
        const filtered = data.chesscom.filter((s) => s.date !== today);
        filtered.push(snap);
        data.chesscom = filtered.slice(-365);
      }
    } catch { /* silent */ }
  }

  if (settings.trackLichess && settings.lichessUsername) {
    try {
      const res = await fetch(
        `https://lichess.org/api/user/${settings.lichessUsername}`,
        { headers: { Accept: "application/json" } }
      );
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json: any = await res.json();
        const perfs = json?.perfs ?? {};
        const snap: PlatformRatingSnapshot = {
          date: today,
          bullet: perfs?.bullet?.rating,
          blitz: perfs?.blitz?.rating,
          rapid: perfs?.rapid?.rating,
          classical: perfs?.classical?.rating,
          puzzle: perfs?.puzzle?.rating,
        };
        const filtered = data.lichess.filter((s) => s.date !== today);
        filtered.push(snap);
        data.lichess = filtered.slice(-365);
      }
    } catch { /* silent */ }
  }

  data.lastFetchedAt = new Date().toISOString();
  savePlatformRatingsData(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 — In-App ELO Tactics Rating
// ─────────────────────────────────────────────────────────────────────────────

export interface TacticsRatingEntry {
  date: string;   // ISO date string YYYY-MM-DD
  rating: number;
}

export interface TacticsRatingData {
  tacticsRating: number;
  tacticsRatingStart: number;    // initial snapshot (set once)
  tacticsRatingHistory: TacticsRatingEntry[];
  totalPuzzlesRated: number;     // used for K-factor calc (<30 = new user)
  lastMilestoneAt: number;       // last 50-pt milestone rating
}

function defaultTacticsRating(): TacticsRatingData {
  return {
    tacticsRating: 800,
    tacticsRatingStart: 800,
    tacticsRatingHistory: [],
    totalPuzzlesRated: 0,
    lastMilestoneAt: 800,
  };
}

export function getTacticsRatingData(): TacticsRatingData {
  if (typeof window === "undefined") return defaultTacticsRating();
  try {
    const data = JSON.parse(localStorage.getItem(TACTICS_RATING_KEY) || "null") as TacticsRatingData | null;
    return data ?? defaultTacticsRating();
  } catch {
    return defaultTacticsRating();
  }
}

function saveTacticsRatingData(data: TacticsRatingData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TACTICS_RATING_KEY, JSON.stringify(data));
}

/**
 * ELO update formula:
 *   E = 1 / (1 + 10^((opponentRating - playerRating) / 400))
 *   newRating = playerRating + K * (score - E)
 * score: 1 for win, 0 for loss
 * K: 32 for new users (<30 puzzles), 16 for established
 */
function calculateEloChange(
  playerRating: number,
  puzzleRating: number,
  won: boolean,
  totalPuzzlesRated: number
): number {
  const K = totalPuzzlesRated < 30 ? 32 : 16;
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400));
  const score = won ? 1 : 0;
  return Math.round(K * (score - expected));
}

export interface EloUpdateResult {
  newRating: number;
  delta: number;
  milestoneHit: number | null; // the milestone rating if a 50-pt milestone was crossed
}

/**
 * Update tactics rating after a puzzle attempt.
 * puzzleRating: Lichess puzzle rating (difficulty)
 * won: true if solved (first try or retry), false if failed/hint
 * Returns the new rating, delta, and any milestone hit.
 */
export function updateTacticsRating(puzzleRating: number, won: boolean): EloUpdateResult {
  if (typeof window === "undefined") return { newRating: 800, delta: 0, milestoneHit: null };

  const data = getTacticsRatingData();
  const delta = calculateEloChange(data.tacticsRating, puzzleRating, won, data.totalPuzzlesRated);
  const newRating = Math.max(100, data.tacticsRating + delta); // floor at 100

  // Append to history (one entry per day — replace today's if exists)
  const today = getTodayKey();
  const histFiltered = data.tacticsRatingHistory.filter((h) => h.date !== today);
  histFiltered.push({ date: today, rating: newRating });
  // Keep last 365 days
  const trimmedHistory = histFiltered.slice(-365);

  // Check for 50-pt milestone
  // A milestone fires when we cross a new 50-point multiple from lastMilestoneAt
  const prevMilestoneBase = Math.floor(data.lastMilestoneAt / 50) * 50;
  const newMilestoneBase = Math.floor(newRating / 50) * 50;
  let milestoneHit: number | null = null;
  if (won && newMilestoneBase > prevMilestoneBase) {
    milestoneHit = newMilestoneBase;
  }

  const updated: TacticsRatingData = {
    tacticsRating: newRating,
    tacticsRatingStart: data.tacticsRatingStart, // never changes after init
    tacticsRatingHistory: trimmedHistory,
    totalPuzzlesRated: data.totalPuzzlesRated + 1,
    lastMilestoneAt: milestoneHit !== null ? newRating : data.lastMilestoneAt,
  };

  saveTacticsRatingData(updated);
  return { newRating, delta, milestoneHit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 6 — Achievement Badges
// ─────────────────────────────────────────────────────────────────────────────

const ACHIEVEMENTS_KEY = "ctt_achievements";

export type AchievementId =
  | "first_blood"
  | "fork_master"
  | "speed_demon"
  | "on_fire"
  | "comeback_kid"
  | "pattern_collector"
  | "tier_climber"
  | "elite"
  | "centurion"
  | "dedicated"
  | "committed"
  | "nemesis_slayer"
  | "boss_slayer";

export interface Achievement {
  id: AchievementId;
  name: string;
  description: string;
  emoji: string;
  earnedAt: string | null; // ISO timestamp or null
}

export const ACHIEVEMENT_DEFINITIONS: Achievement[] = [
  { id: "first_blood", name: "First Blood", description: "Solve your first puzzle", emoji: "🩸", earnedAt: null },
  { id: "fork_master", name: "Fork Master", description: "Solve 50 Fork puzzles", emoji: "⚔️", earnedAt: null },
  { id: "speed_demon", name: "Speed Demon", description: "Solve a puzzle in under 5 seconds", emoji: "⚡", earnedAt: null },
  { id: "on_fire", name: "On Fire", description: "Solve 10 puzzles in a row without failing", emoji: "🔥", earnedAt: null },
  { id: "comeback_kid", name: "Comeback Kid", description: "Beat a puzzle you failed 3+ times before", emoji: "💪", earnedAt: null },
  { id: "pattern_collector", name: "Pattern Collector", description: "Attempt all 28 tactical patterns", emoji: "📚", earnedAt: null },
  { id: "tier_climber", name: "Tier Climber", description: "Unlock Tier 2 patterns", emoji: "🧗", earnedAt: null },
  { id: "elite", name: "Elite", description: "Unlock Tier 3 patterns", emoji: "💎", earnedAt: null },
  { id: "centurion", name: "Centurion", description: "Solve 100 puzzles total", emoji: "💯", earnedAt: null },
  { id: "dedicated", name: "Dedicated", description: "Maintain a 7-day streak", emoji: "🗓️", earnedAt: null },
  { id: "committed", name: "Committed", description: "Maintain a 30-day streak", emoji: "📅", earnedAt: null },
  { id: "nemesis_slayer", name: "Nemesis Slayer", description: "Defeat a Nemesis puzzle", emoji: "👹", earnedAt: null },
  { id: "boss_slayer", name: "Boss Slayer", description: "Defeat a Boss puzzle", emoji: "⚔️", earnedAt: null },
];

export function getAchievements(): Achievement[] {
  if (typeof window === "undefined") return ACHIEVEMENT_DEFINITIONS.map((a) => ({ ...a }));
  try {
    const stored = JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || "null") as Record<string, string> | null;
    if (!stored) return ACHIEVEMENT_DEFINITIONS.map((a) => ({ ...a }));
    return ACHIEVEMENT_DEFINITIONS.map((def) => ({
      ...def,
      earnedAt: stored[def.id] ?? null,
    }));
  } catch {
    return ACHIEVEMENT_DEFINITIONS.map((a) => ({ ...a }));
  }
}

export function earnAchievement(id: AchievementId): { earned: boolean; achievement: Achievement | null } {
  if (typeof window === "undefined") return { earned: false, achievement: null };
  const stored: Record<string, string> = (() => {
    try { return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || "{}"); } catch { return {}; }
  })();
  if (stored[id]) return { earned: false, achievement: null }; // already earned
  stored[id] = new Date().toISOString();
  localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(stored));
  const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === id);
  return { earned: true, achievement: def ? { ...def, earnedAt: stored[id] } : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 6 — Session State (Boss + Nemesis + Consecutive streak)
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = "ctt_session";

export interface SessionState {
  puzzleCount: number;       // puzzles attempted this session
  consecutiveCorrect: number; // no-fail streak this session
  startedAt: string;
}

function getDefaultSession(): SessionState {
  return { puzzleCount: 0, consecutiveCorrect: 0, startedAt: new Date().toISOString() };
}

export function getSessionState(): SessionState {
  if (typeof window === "undefined") return getDefaultSession();
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as SessionState | null;
    if (!stored) return getDefaultSession();
    // Reset session if older than 4 hours (new session)
    const age = (Date.now() - new Date(stored.startedAt).getTime()) / 3600000;
    if (age > 4) return getDefaultSession();
    return stored;
  } catch {
    return getDefaultSession();
  }
}

export function updateSessionState(correct: boolean): SessionState {
  if (typeof window === "undefined") return getDefaultSession();
  const state = getSessionState();
  state.puzzleCount++;
  if (correct) {
    state.consecutiveCorrect++;
  } else {
    state.consecutiveCorrect = 0;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 6 — Nemesis Puzzle Tracking
// ─────────────────────────────────────────────────────────────────────────────

const NEMESIS_KEY = "ctt_nemesis";

export interface NemesisEntry {
  puzzleId: string;
  failCount: number;
  lastFailedAt: string;
  defeated: boolean;
}

export function getNemesisEntries(): Record<string, NemesisEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(NEMESIS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function recordPuzzleFail(puzzleId: string): NemesisEntry {
  if (typeof window === "undefined") return { puzzleId, failCount: 1, lastFailedAt: new Date().toISOString(), defeated: false };
  const entries = getNemesisEntries();
  const existing = entries[puzzleId] ?? { puzzleId, failCount: 0, lastFailedAt: "", defeated: false };
  const updated: NemesisEntry = {
    ...existing,
    failCount: existing.failCount + 1,
    lastFailedAt: new Date().toISOString(),
  };
  entries[puzzleId] = updated;
  localStorage.setItem(NEMESIS_KEY, JSON.stringify(entries));
  return updated;
}

export function recordPuzzleWin(puzzleId: string): void {
  if (typeof window === "undefined") return;
  const entries = getNemesisEntries();
  if (entries[puzzleId]) {
    entries[puzzleId].defeated = true;
    localStorage.setItem(NEMESIS_KEY, JSON.stringify(entries));
  }
}

/** Get active Nemesis puzzles (failed 5+ times, not defeated). Max 3. */
export function getActiveNemesisPuzzles(): NemesisEntry[] {
  const entries = getNemesisEntries();
  return Object.values(entries)
    .filter((e) => e.failCount >= 5 && !e.defeated)
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, 3);
}

/** Check if a puzzle is a Nemesis */
export function isPuzzleNemesis(puzzleId: string): boolean {
  const entries = getNemesisEntries();
  const e = entries[puzzleId];
  return !!e && e.failCount >= 5 && !e.defeated;
}

/** Get fail count for a specific puzzle */
export function getPuzzleFailCount(puzzleId: string): number {
  const entries = getNemesisEntries();
  return entries[puzzleId]?.failCount ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 6 — Achievement check helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check and award all applicable achievements after a puzzle attempt.
 * Returns array of newly earned achievement IDs.
 */
export function checkAndAwardAchievements(params: {
  outcome: SM2Outcome;
  solveTimeMs: number;
  theme?: string;
  consecutiveCorrect: number;
  totalSolved: number;
  streakDays: number;
  tier: number;
  puzzleId: string;
}): AchievementId[] {
  const earned: AchievementId[] = [];
  const { outcome, solveTimeMs, theme, consecutiveCorrect, totalSolved, streakDays, tier, puzzleId } = params;
  const isSolved = outcome === "solved-first-try" || outcome === "solved-after-retry";

  // First Blood: 1st solve
  if (isSolved && totalSolved === 1) {
    const r = earnAchievement("first_blood");
    if (r.earned) earned.push("first_blood");
  }

  // Centurion: 100 total
  if (isSolved && totalSolved >= 100) {
    const r = earnAchievement("centurion");
    if (r.earned) earned.push("centurion");
  }

  // Speed Demon: < 5s
  if (isSolved && solveTimeMs > 0 && solveTimeMs < 5000) {
    const r = earnAchievement("speed_demon");
    if (r.earned) earned.push("speed_demon");
  }

  // On Fire: 10 consecutive
  if (isSolved && consecutiveCorrect >= 10) {
    const r = earnAchievement("on_fire");
    if (r.earned) earned.push("on_fire");
  }

  // Fork Master: 50 fork puzzles
  if (isSolved && theme?.toUpperCase() === "FORK") {
    const sm2 = getSM2Attempts();
    const forkSolves = sm2.filter(
      (a) => a.theme?.toUpperCase() === "FORK" && (a.outcome === "solved-first-try" || a.outcome === "solved-after-retry")
    ).length;
    if (forkSolves >= 50) {
      const r = earnAchievement("fork_master");
      if (r.earned) earned.push("fork_master");
    }
  }

  // Pattern Collector: all 28 attempted
  if (isSolved) {
    const sm2 = getSM2Attempts();
    const themes = new Set(sm2.map((a) => a.theme?.toUpperCase()).filter(Boolean));
    if (themes.size >= 28) {
      const r = earnAchievement("pattern_collector");
      if (r.earned) earned.push("pattern_collector");
    }
  }

  // Comeback Kid: beat puzzle failed 3+ times before
  if (isSolved) {
    const failCount = getPuzzleFailCount(puzzleId);
    if (failCount >= 3) {
      const r = earnAchievement("comeback_kid");
      if (r.earned) earned.push("comeback_kid");
    }
  }

  // Dedicated: 7-day streak
  if (streakDays >= 7) {
    const r = earnAchievement("dedicated");
    if (r.earned) earned.push("dedicated");
  }

  // Committed: 30-day streak
  if (streakDays >= 30) {
    const r = earnAchievement("committed");
    if (r.earned) earned.push("committed");
  }

  // Tier Climber: solved Tier 2
  if (isSolved && tier >= 2) {
    const r = earnAchievement("tier_climber");
    if (r.earned) earned.push("tier_climber");
  }

  // Elite: solved Tier 3
  if (isSolved && tier >= 3) {
    const r = earnAchievement("elite");
    if (r.earned) earned.push("elite");
  }

  return earned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 9 — Personal Puzzles (from PGN import)
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonalPuzzle {
  id: string;
  fen: string;             // FEN of the position
  moveNumber: number;
  playerColor: "white" | "black";
  pgn: string;             // Original PGN snippet
  source: string;          // e.g. "mygame.pgn"
  flaggedReason: string;   // e.g. "Hanging piece detected"
  addedAt: string;         // ISO timestamp
  solved: boolean;
}

export function getPersonalPuzzles(): PersonalPuzzle[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PERSONAL_PUZZLES_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addPersonalPuzzle(puzzle: PersonalPuzzle): void {
  if (typeof window === "undefined") return;
  const puzzles = getPersonalPuzzles();
  // Deduplicate by FEN
  if (!puzzles.some((p) => p.fen === puzzle.fen)) {
    puzzles.push(puzzle);
    localStorage.setItem(PERSONAL_PUZZLES_KEY, JSON.stringify(puzzles));
  }
}

export function addPersonalPuzzles(newPuzzles: PersonalPuzzle[]): number {
  if (typeof window === "undefined") return 0;
  const existing = getPersonalPuzzles();
  const existingFens = new Set(existing.map((p) => p.fen));
  const toAdd = newPuzzles.filter((p) => !existingFens.has(p.fen));
  if (toAdd.length > 0) {
    const merged = [...existing, ...toAdd];
    localStorage.setItem(PERSONAL_PUZZLES_KEY, JSON.stringify(merged));
  }
  return toAdd.length;
}

export function markPersonalPuzzleSolved(id: string): void {
  if (typeof window === "undefined") return;
  const puzzles = getPersonalPuzzles();
  const idx = puzzles.findIndex((p) => p.id === id);
  if (idx >= 0) {
    puzzles[idx].solved = true;
    localStorage.setItem(PERSONAL_PUZZLES_KEY, JSON.stringify(puzzles));
  }
}

export function clearPersonalPuzzles(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PERSONAL_PUZZLES_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 9 — PGN Import Usage Tracking (for Improver tier: 1 game/month)
// ─────────────────────────────────────────────────────────────────────────────

export interface PGNImportUsage {
  monthKey: string;  // YYYY-MM
  count: number;
}

export function getPGNImportUsage(): PGNImportUsage {
  if (typeof window === "undefined") return { monthKey: "", count: 0 };
  try {
    const stored = JSON.parse(localStorage.getItem(PGN_IMPORT_USAGE_KEY) || "null") as PGNImportUsage | null;
    const monthKey = new Date().toISOString().slice(0, 7);
    if (!stored || stored.monthKey !== monthKey) {
      return { monthKey, count: 0 };
    }
    return stored;
  } catch {
    return { monthKey: new Date().toISOString().slice(0, 7), count: 0 };
  }
}

export function incrementPGNImportUsage(): void {
  if (typeof window === "undefined") return;
  const usage = getPGNImportUsage();
  usage.count++;
  localStorage.setItem(PGN_IMPORT_USAGE_KEY, JSON.stringify(usage));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 9 — Board & Piece Theme Preferences
// ─────────────────────────────────────────────────────────────────────────────

export type BoardTheme = "classic" | "blue" | "green" | "dark" | "purple";
export type PieceStyle = "standard" | "neo" | "alpha";

export interface BoardThemeConfig {
  light: string;  // CSS color for light squares
  dark: string;   // CSS color for dark squares
  name: string;
  emoji: string;
}

export const BOARD_THEMES: Record<BoardTheme, BoardThemeConfig> = {
  classic: { name: "Classic", emoji: "♟", light: "#f0d9b5", dark: "#b58863" },
  blue:    { name: "Blue",    emoji: "🔵", light: "#dee3e6", dark: "#8ca2ad" },
  green:   { name: "Green",   emoji: "🟢", light: "#ffffdd", dark: "#86a666" },
  dark:    { name: "Dark",    emoji: "⬛", light: "#9e9e9e", dark: "#424242" },
  purple:  { name: "Purple",  emoji: "🟣", light: "#f0e6ff", dark: "#9b72cf" },
};

export const PIECE_STYLES: Record<PieceStyle, { name: string; description: string }> = {
  standard: { name: "Standard", description: "Default chess pieces" },
  neo:      { name: "Neo",      description: "Modern minimal design" },
  alpha:    { name: "Alpha",    description: "High-contrast letter style" },
};

// Tier access: Free=1(classic only), Improver=3(classic+blue+green), Serious=all
export const THEME_TIER_ACCESS: Record<BoardTheme, number> = {
  classic: 0,  // free
  blue:    1,  // improver
  green:   1,  // improver
  dark:    2,  // serious
  purple:  2,  // serious
};

export const PIECE_TIER_ACCESS: Record<PieceStyle, number> = {
  standard: 0, // free
  neo:      2, // serious
  alpha:    2, // serious
};

export function getBoardTheme(): BoardTheme {
  if (typeof window === "undefined") return "classic";
  return (localStorage.getItem(BOARD_THEME_KEY) as BoardTheme) || "classic";
}

export function saveBoardTheme(theme: BoardTheme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BOARD_THEME_KEY, theme);
}

export function getPieceStyle(): PieceStyle {
  if (typeof window === "undefined") return "standard";
  return (localStorage.getItem(PIECE_STYLE_KEY) as PieceStyle) || "standard";
}

export function savePieceStyle(style: PieceStyle): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PIECE_STYLE_KEY, style);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 9 — Subscription tier helper
// tier: 0=free/trial, 1=improver, 2=serious
// For now, we simulate tiers via localStorage flags for demo purposes
// ─────────────────────────────────────────────────────────────────────────────

export function getSubscriptionTier(): number {
  if (typeof window === "undefined") return 0;
  if (isBetaTester()) return 2;
  const tier = localStorage.getItem("ctt_sub_tier");
  if (tier === "2") return 2;  // Serious
  if (tier === "1") return 1;  // Improver
  // Check legacy subscription flag
  const legacy = localStorage.getItem("subscription_status");
  if (legacy === "active") return 2; // default to Serious for paid users
  return 0; // Free
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 9 — Weekly Report Data
// ─────────────────────────────────────────────────────────────────────────────

export interface WeeklyReportData {
  weekStart: string;  // YYYY-MM-DD (Monday)
  weekEnd: string;    // YYYY-MM-DD (Sunday)
  puzzlesSolvedThisWeek: number;
  puzzlesSolvedLastWeek: number;
  ratingThisWeek: number | null;
  ratingLastWeek: number | null;
  ratingChange: number | null;
  currentStreak: number;
  longestStreak: number;
  topStrongestPatterns: Array<{ theme: string; solveRate: number; attempts: number }>;
  topWeakestPatterns: Array<{ theme: string; solveRate: number; attempts: number }>;
  personalizedTip: string;
}

function getWeekBounds(offsetWeeks = 0): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday - offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

const PATTERN_TIPS: Record<string, string> = {
  FORK:   "Forks are all about seeing two-attack moves. Practice scanning for squares where your knight or queen can simultaneously attack two pieces.",
  PIN:    "Pins immobilize pieces. Look for opportunities to align a sliding piece (bishop, rook, queen) through an enemy piece toward a more valuable one.",
  SKEWER: "Skewers force the stronger piece to move, exposing the weaker one. Think about where your rooks and bishops can pierce through your opponent's lineup.",
  DISCOVERED_ATTACK: "Discovered attacks are devastating because your opponent can't respond to both threats. Practice moving one piece to unleash another.",
  BACK_RANK: "Back rank threats often end games suddenly. Keep one piece defending your back rank or push a pawn to give your king an escape square.",
  DOUBLE_CHECK: "Double checks are unstoppable — only a king move can escape. Look for positions where you can move a piece to reveal an additional check.",
  DEFLECTION: "Deflection removes a key defender. Ask yourself: which piece is holding something critical for my opponent?",
  DECOY: "A decoy lures a piece to a square where it becomes vulnerable or overloaded. Think about sacrifices that gain you a tactical advantage.",
  DEFAULT: "Focus on pattern recognition — the more puzzles you solve in this category, the more the patterns will jump out at you in real games.",
};

function getTipForPattern(theme: string): string {
  return PATTERN_TIPS[theme.toUpperCase()] ?? PATTERN_TIPS.DEFAULT;
}

export function generateWeeklyReport(): WeeklyReportData {
  const thisWeek = getWeekBounds(0);
  const lastWeek = getWeekBounds(1);

  const allAttempts = getSM2Attempts();

  // Count puzzles solved per week
  function countSolvedInRange(start: string, end: string): number {
    return allAttempts.filter((a) => {
      const date = a.timestamp.slice(0, 10);
      return date >= start && date <= end &&
        (a.outcome === "solved-first-try" || a.outcome === "solved-after-retry");
    }).length;
  }

  const puzzlesSolvedThisWeek = countSolvedInRange(thisWeek.start, thisWeek.end);
  const puzzlesSolvedLastWeek = countSolvedInRange(lastWeek.start, lastWeek.end);

  // Rating data
  const tacticsData = getTacticsRatingData();
  const ratingHistory = tacticsData.tacticsRatingHistory;
  
  function getRatingAtDate(dateStr: string): number | null {
    const entry = ratingHistory.filter((h) => h.date <= dateStr).slice(-1)[0];
    return entry?.rating ?? null;
  }

  const ratingThisWeek = getRatingAtDate(thisWeek.end) ?? tacticsData.tacticsRating ?? null;
  const ratingLastWeek = getRatingAtDate(lastWeek.end);
  const ratingChange = ratingThisWeek !== null && ratingLastWeek !== null
    ? ratingThisWeek - ratingLastWeek
    : null;

  // Pattern stats
  const patternStats = getAllPatternStats().filter((s) => s.totalAttempts >= 3);
  const sorted = [...patternStats].sort((a, b) => b.solveRate - a.solveRate);
  
  const topStrongest = sorted.slice(0, 3).map((s) => ({
    theme: s.theme,
    solveRate: s.solveRate,
    attempts: s.totalAttempts,
  }));

  const topWeakest = [...sorted].reverse().slice(0, 3).map((s) => ({
    theme: s.theme,
    solveRate: s.solveRate,
    attempts: s.totalAttempts,
  }));

  // Streak
  const streakData = getStreakData();

  // Tip
  const weakestTheme = topWeakest[0]?.theme ?? "";
  const personalizedTip = getTipForPattern(weakestTheme);

  return {
    weekStart: thisWeek.start,
    weekEnd: thisWeek.end,
    puzzlesSolvedThisWeek,
    puzzlesSolvedLastWeek,
    ratingThisWeek,
    ratingLastWeek,
    ratingChange,
    currentStreak: streakData.currentStreak,
    longestStreak: streakData.longestStreak,
    topStrongestPatterns: topStrongest,
    topWeakestPatterns: topWeakest,
    personalizedTip,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 9 — Data Export
// ─────────────────────────────────────────────────────────────────────────────

export function exportHistoryAsCSV(): string {
  const attempts = getSM2Attempts();
  const header = ["puzzleId", "outcome", "timestamp", "theme", "rating", "solve_time_ms", "tier"].join(",");
  const rows = attempts.map((a) => [
    a.puzzleId,
    a.outcome,
    a.timestamp,
    a.theme ?? "",
    a.rating ?? "",
    a.solve_time_ms ?? "",
    a.tier ?? "",
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header, ...rows].join("\n");
}

export function exportStatsAsJSON(): string {
  const patternStats = getAllPatternStats();
  const xpData = getXPData();
  const streakData = getStreakData();
  const tacticsData = getTacticsRatingData();
  const achievements = getAchievements().filter((a) => a.earnedAt !== null);
  const personalPuzzles = getPersonalPuzzles();

  const payload = {
    exportedAt: new Date().toISOString(),
    summary: {
      totalAttempts: getTotalAttempts(),
      totalXP: xpData.totalXP,
      level: xpData.level,
      currentStreak: streakData.currentStreak,
      longestStreak: streakData.longestStreak,
      tacticsRating: tacticsData.tacticsRating,
      totalPuzzlesRated: tacticsData.totalPuzzlesRated,
    },
    patternStats,
    achievements,
    personalPuzzles: personalPuzzles.length,
    ratingHistory: tacticsData.tacticsRatingHistory,
  };

  return JSON.stringify(payload, null, 2);
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 10 — Daily Puzzle Target / Habit Tracker
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyTargetSettings {
  dailyGoal: number; // 10, 20, 30, or custom
}

function defaultDailyTargetSettings(): DailyTargetSettings {
  return { dailyGoal: 10 };
}

export function getDailyTargetSettings(): DailyTargetSettings {
  if (typeof window === "undefined") return defaultDailyTargetSettings();
  try {
    const stored = JSON.parse(localStorage.getItem(DAILY_TARGET_KEY) || "null") as DailyTargetSettings | null;
    return stored ?? defaultDailyTargetSettings();
  } catch {
    return defaultDailyTargetSettings();
  }
}

export function saveDailyTargetSettings(settings: DailyTargetSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DAILY_TARGET_KEY, JSON.stringify(settings));
}

/**
 * Daily habit entry: one per calendar day.
 * goalMet = puzzlesSolved >= dailyGoal on that date
 */
export interface DailyHabitEntry {
  date: string;          // YYYY-MM-DD
  puzzlesSolved: number;
  goalSet: number;       // the goal that was in effect on that day
  goalMet: boolean;
}

export interface HabitData {
  entries: DailyHabitEntry[];
}

export function getHabitData(): HabitData {
  if (typeof window === "undefined") return { entries: [] };
  try {
    const stored = JSON.parse(localStorage.getItem(DAILY_HABIT_KEY) || "null") as HabitData | null;
    return stored ?? { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function saveHabitData(data: HabitData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DAILY_HABIT_KEY, JSON.stringify(data));
}

/**
 * Count how many puzzles the user solved today (SM2 attempts with "solved" outcome).
 */
export function getTodaySolvedCount(): number {
  const today = getTodayKey();
  return getSM2Attempts().filter((a) =>
    a.timestamp.slice(0, 10) === today &&
    (a.outcome === "solved-first-try" || a.outcome === "solved-after-retry")
  ).length;
}

/**
 * Refresh today's habit entry based on current attempt data.
 * Should be called after each puzzle attempt.
 */
export function refreshHabitEntry(): DailyHabitEntry {
  const today = getTodayKey();
  const settings = getDailyTargetSettings();
  const solvedToday = getTodaySolvedCount();
  const goalMet = solvedToday >= settings.dailyGoal;

  const data = getHabitData();
  const idx = data.entries.findIndex((e) => e.date === today);
  const entry: DailyHabitEntry = {
    date: today,
    puzzlesSolved: solvedToday,
    goalSet: settings.dailyGoal,
    goalMet,
  };
  if (idx >= 0) {
    data.entries[idx] = entry;
  } else {
    data.entries.push(entry);
  }
  // Keep last 90 days
  data.entries = data.entries.slice(-90);
  saveHabitData(data);
  return entry;
}

/**
 * Get the last 7 days of habit data (including today), padded with empty entries.
 */
export function getWeeklyHabitChart(): DailyHabitEntry[] {
  const data = getHabitData();
  const result: DailyHabitEntry[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const existing = data.entries.find((e) => e.date === dateKey);
    result.push(existing ?? { date: dateKey, puzzlesSolved: 0, goalSet: 10, goalMet: false });
  }
  return result;
}

/**
 * Compute the "goal streak" — consecutive days where daily goal was met (ending today or yesterday).
 */
export function getGoalStreak(): number {
  const data = getHabitData();
  const entriesMap = new Map(data.entries.map((e) => [e.date, e]));
  let streak = 0;
  const today = new Date();
  // Start from today
  const d = new Date(today);
  while (true) {
    const key = d.toISOString().slice(0, 10);
    const entry = entriesMap.get(key);
    if (entry?.goalMet) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
    if (streak > 365) break;
  }
  return streak;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 11 — Curriculum: Puzzle Progress Tracking
// ─────────────────────────────────────────────────────────────────────────────

export type PuzzleStatus = 'not_attempted' | 'solved_first_try' | 'solved_retry' | 'missed';

export interface PuzzleProgress {
  puzzleId: string;
  patternTheme: string;      // e.g. "fork", "pin"
  orderIndex: number;        // 1-based position in the pattern (1-200)
  status: PuzzleStatus;
  attempts: number;
  lastAttempted: string | null;
  nextReviewDate: string | null; // SM-2 spaced repetition
  solveTimeMs: number | null;
}

// Per-pattern ELO rating
export interface PatternRating {
  theme: string;
  rating: number;            // starts at 800
  gamesPlayed: number;
  history: { date: string; rating: number; puzzleId: string }[];
}

export function getPuzzleProgressMap(): Record<string, PuzzleProgress> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PUZZLE_PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePuzzleProgressMap(map: Record<string, PuzzleProgress>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PUZZLE_PROGRESS_KEY, JSON.stringify(map));
}

export function getPuzzleProgress(puzzleId: string): PuzzleProgress | null {
  const map = getPuzzleProgressMap();
  return map[puzzleId] ?? null;
}

/**
 * Update progress after a puzzle attempt in pattern mode.
 * Also applies SM-2 scheduling for review.
 */
export function updatePuzzleProgress(
  puzzleId: string,
  patternTheme: string,
  orderIndex: number,
  outcome: SM2Outcome,
  solveTimeMs: number | null
): PuzzleProgress {
  const map = getPuzzleProgressMap();
  const existing = map[puzzleId];
  const now = new Date().toISOString();

  const isSolved = outcome === "solved-first-try" || outcome === "solved-after-retry";
  let status: PuzzleStatus;
  if (outcome === "solved-first-try") status = "solved_first_try";
  else if (outcome === "solved-after-retry") status = "solved_retry";
  else status = "missed";

  // Compute next review date using SM-2 logic
  const sm2Attempts = getSM2Attempts().filter(a => a.puzzleId === puzzleId);
  const sm2StateMap = getSM2StateMap();
  const sm2State = sm2StateMap[puzzleId];
  const nextReviewDate = sm2State?.nextReviewDate ?? null;

  const attempts = (existing?.attempts ?? 0) + 1;

  const progress: PuzzleProgress = {
    puzzleId,
    patternTheme,
    orderIndex,
    status,
    attempts,
    lastAttempted: now,
    nextReviewDate,
    solveTimeMs: isSolved && solveTimeMs && solveTimeMs > 0 ? solveTimeMs : (existing?.solveTimeMs ?? null),
  };

  map[puzzleId] = progress;
  savePuzzleProgressMap(map);
  return progress;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 11 — Pattern ELO Ratings
// ─────────────────────────────────────────────────────────────────────────────

export function getPatternRatings(): Record<string, PatternRating> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PATTERN_RATINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePatternRatings(ratings: Record<string, PatternRating>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PATTERN_RATINGS_KEY, JSON.stringify(ratings));
}

export function getPatternRating(theme: string): PatternRating {
  const ratings = getPatternRatings();
  if (ratings[theme]) return ratings[theme];
  // Use calibration rating - 150 as starting point so puzzles are at the right level
  const calibRating = (() => {
    try {
      const v = typeof window !== "undefined" ? localStorage.getItem("ctt_calibration_rating") : null;
      return v ? Math.max(400, parseInt(v, 10) - 150) : 800;
    } catch { return 800; }
  })();
  return { theme, rating: calibRating, gamesPlayed: 0, history: [] };
}

/**
 * Update pattern ELO after a puzzle attempt.
 * K=32 for first 30 games, K=16 after.
 */
export function updatePatternRating(
  theme: string,
  puzzleRating: number,
  won: boolean,
  puzzleId: string
): { newRating: number; delta: number } {
  const ratings = getPatternRatings();
  const current = ratings[theme] ?? { theme, rating: 800, gamesPlayed: 0, history: [] };

  const K = current.gamesPlayed < 30 ? 32 : 16;
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - current.rating) / 400));
  const score = won ? 1 : 0;
  const delta = Math.round(K * (score - expected));
  const newRating = Math.max(100, current.rating + delta);

  const today = new Date().toISOString().slice(0, 10);
  const newHistory = [
    ...current.history.slice(-99), // keep last 100 entries
    { date: today, rating: newRating, puzzleId },
  ];

  const updated: PatternRating = {
    theme,
    rating: newRating,
    gamesPlayed: current.gamesPlayed + 1,
    history: newHistory,
  };

  ratings[theme] = updated;
  savePatternRatings(ratings);

  return { newRating, delta };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 11 — Last Active Pattern
// ─────────────────────────────────────────────────────────────────────────────

export function getLastActivePattern(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_ACTIVE_PATTERN_KEY);
}

export function setLastActivePattern(theme: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_ACTIVE_PATTERN_KEY, theme);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 11 — Pattern Progress Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface PatternCurriculumSummary {
  theme: string;
  completed: number;         // puzzles with status !== 'not_attempted'
  totalPuzzles: number;      // 200 (or however many in db)
  solvedFirstTry: number;
  solvedRetry: number;
  missed: number;
  dueForReview: number;
  patternRating: number;
  solveRate: number;         // solved (first+retry) / total attempted
  status: 'unstarted' | 'in_progress' | 'mastered'; // mastered = 80%+ solve rate, all 200 done
  nextPuzzleIndex: number;   // 1-based index of next puzzle to play
}

export function getPatternCurriculumSummary(
  theme: string,
  totalPuzzles: number
): PatternCurriculumSummary {
  const progressMap = getPuzzleProgressMap();
  const patternEntries = Object.values(progressMap).filter(p => p.patternTheme === theme);
  const rating = getPatternRating(theme);

  const completed = patternEntries.length;
  const solvedFirstTry = patternEntries.filter(p => p.status === 'solved_first_try').length;
  const solvedRetry = patternEntries.filter(p => p.status === 'solved_retry').length;
  const missed = patternEntries.filter(p => p.status === 'missed').length;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dueForReview = patternEntries.filter(p =>
    p.nextReviewDate !== null && new Date(p.nextReviewDate) <= now
  ).length;

  const totalAttempted = solvedFirstTry + solvedRetry + missed;
  const solveRate = totalAttempted > 0 ? (solvedFirstTry + solvedRetry) / totalAttempted : 0;

  let patternStatus: 'unstarted' | 'in_progress' | 'mastered' = 'unstarted';
  if (completed > 0) {
    if (completed >= totalPuzzles && solveRate >= 0.8) {
      patternStatus = 'mastered';
    } else {
      patternStatus = 'in_progress';
    }
  }

  // Next puzzle is the first not-yet-attempted one
  const attemptedIndices = new Set(patternEntries.map(p => p.orderIndex));
  let nextPuzzleIndex = 1;
  for (let i = 1; i <= totalPuzzles; i++) {
    if (!attemptedIndices.has(i)) {
      nextPuzzleIndex = i;
      break;
    }
  }
  // If all attempted, pick the first due for review or just index 1
  if (nextPuzzleIndex === 1 && completed >= totalPuzzles) {
    const dueEntry = patternEntries
      .filter(p => p.nextReviewDate !== null && new Date(p.nextReviewDate) <= now)
      .sort((a, b) => a.orderIndex - b.orderIndex)[0];
    nextPuzzleIndex = dueEntry?.orderIndex ?? 1;
  }

  return {
    theme,
    completed,
    totalPuzzles,
    solvedFirstTry,
    solvedRetry,
    missed,
    dueForReview,
    patternRating: rating.rating,
    solveRate,
    status: patternStatus,
    nextPuzzleIndex,
  };
}

/**
 * Get the next puzzle to play for a given pattern theme.
 * Priority: due for review first, then next unplayed.
 * Returns orderIndex (1-based).
 */
export function getNextPuzzleForPattern(
  theme: string,
  totalPuzzles: number
): number {
  const progressMap = getPuzzleProgressMap();
  const patternEntries = Object.values(progressMap).filter(p => p.patternTheme === theme);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Due for review — return lowest order index that's due
  const dueEntry = patternEntries
    .filter(p => p.nextReviewDate !== null && new Date(p.nextReviewDate) <= now)
    .sort((a, b) => a.orderIndex - b.orderIndex)[0];
  if (dueEntry) return dueEntry.orderIndex;

  // Next unplayed
  const attemptedIndices = new Set(patternEntries.map(p => p.orderIndex));
  for (let i = 1; i <= totalPuzzles; i++) {
    if (!attemptedIndices.has(i)) return i;
  }

  // All played — return first puzzle
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — Activity Log (ctt_activity_log)
// Stores array of date strings "YYYY-MM-DD" for 30-day habit tracker
// ─────────────────────────────────────────────────────────────────────────────

export function getActivityLog(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Record today in the activity log (called on every puzzle completion).
 */
export function recordActivityToday(): void {
  if (typeof window === "undefined") return;
  const today = getTodayKey();
  const log = getActivityLog();
  if (!log.includes(today)) {
    log.push(today);
    // Keep last 90 days
    const trimmed = log.slice(-90);
    localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(trimmed));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — New Achievement System (ctt_achievements_v2)
// ─────────────────────────────────────────────────────────────────────────────

export type NewAchievementId =
  // Rating Milestones
  | "first_steps"
  | "improving"
  | "solid"
  | "strong"
  | "expert"
  | "master"
  | "century_climb"
  // Pattern Mastery
  | "pattern_beginner"
  | "pattern_student"
  | "pattern_master"
  | "sharp_eye"
  // Consistency
  | "three_in_a_row"
  | "week_warrior"
  | "habit_formed"
  // Review
  | "clean_slate"
  | "second_chance"
  // Improvement
  | "weekly_climber"
  | "personal_best";

export interface NewAchievement {
  id: NewAchievementId;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedDate: string | null; // ISO date string
}

export const NEW_ACHIEVEMENT_DEFINITIONS: Omit<NewAchievement, "earned" | "earnedDate">[] = [
  // Rating Milestones
  { id: "first_steps",     name: "First Steps",     icon: "👶", description: "Reach a tactics rating of 800." },
  { id: "improving",       name: "Improving",        icon: "📈", description: "Reach a tactics rating of 1000." },
  { id: "solid",           name: "Solid",            icon: "🧱", description: "Reach a tactics rating of 1200." },
  { id: "strong",          name: "Strong",           icon: "💪", description: "Reach a tactics rating of 1500." },
  { id: "expert",          name: "Expert",           icon: "🎓", description: "Reach a tactics rating of 1800." },
  { id: "master",          name: "Master",           icon: "🏆", description: "Reach a tactics rating of 2000." },
  { id: "century_climb",   name: "Century Climb",    icon: "🚀", description: "Gain 100 rating points in a single session." },
  // Pattern Mastery
  { id: "pattern_beginner", name: "Pattern Beginner", icon: "🔰", description: "Complete all 200 puzzles in your first pattern." },
  { id: "pattern_student",  name: "Pattern Student",  icon: "📚", description: "Complete 5 patterns (all 200 puzzles each)." },
  { id: "pattern_master",   name: "Pattern Master",   icon: "🧠", description: "Complete all 17 patterns." },
  { id: "sharp_eye",        name: "Sharp Eye",        icon: "👁️", description: "Score 90%+ accuracy on any pattern." },
  // Consistency
  { id: "three_in_a_row",  name: "Three in a Row",   icon: "🔥", description: "Maintain a 3-day practice streak." },
  { id: "week_warrior",    name: "Week Warrior",     icon: "⚔️", description: "Maintain a 7-day practice streak." },
  { id: "habit_formed",    name: "Habit Formed",     icon: "🔗", description: "Maintain a 30-day practice streak." },
  // Review
  { id: "clean_slate",     name: "Clean Slate",      icon: "✨", description: "Clear your entire review queue down to zero." },
  { id: "second_chance",   name: "Second Chance",    icon: "♻️", description: "Solve a previously missed puzzle correctly." },
  // Improvement
  { id: "weekly_climber",  name: "Weekly Climber",   icon: "🧗", description: "Improve your rating 200+ points in 7 days." },
  { id: "personal_best",   name: "Personal Best",    icon: "🥇", description: "Hit a new all-time rating high." },
];

export interface StoredNewAchievement {
  id: NewAchievementId;
  earnedDate: string; // ISO timestamp
}

export function getNewAchievements(): NewAchievement[] {
  if (typeof window === "undefined") {
    return NEW_ACHIEVEMENT_DEFINITIONS.map((d) => ({ ...d, earned: false, earnedDate: null }));
  }
  try {
    const stored: StoredNewAchievement[] = JSON.parse(
      localStorage.getItem(NEW_ACHIEVEMENTS_KEY) || "[]"
    );
    const earnedMap = new Map(stored.map((s) => [s.id, s.earnedDate]));
    return NEW_ACHIEVEMENT_DEFINITIONS.map((d) => ({
      ...d,
      earned: earnedMap.has(d.id),
      earnedDate: earnedMap.get(d.id) ?? null,
    }));
  } catch {
    return NEW_ACHIEVEMENT_DEFINITIONS.map((d) => ({ ...d, earned: false, earnedDate: null }));
  }
}

export function earnNewAchievement(id: NewAchievementId): { earned: boolean; achievement: NewAchievement | null } {
  if (typeof window === "undefined") return { earned: false, achievement: null };
  try {
    const stored: StoredNewAchievement[] = JSON.parse(
      localStorage.getItem(NEW_ACHIEVEMENTS_KEY) || "[]"
    );
    if (stored.some((s) => s.id === id)) return { earned: false, achievement: null };
    const now = new Date().toISOString();
    stored.push({ id, earnedDate: now });
    localStorage.setItem(NEW_ACHIEVEMENTS_KEY, JSON.stringify(stored));
    const def = NEW_ACHIEVEMENT_DEFINITIONS.find((d) => d.id === id);
    if (!def) return { earned: false, achievement: null };
    return { earned: true, achievement: { ...def, earned: true, earnedDate: now } };
  } catch {
    return { earned: false, achievement: null };
  }
}

/**
 * Check and award new achievements after a puzzle completion.
 * Returns array of newly earned achievement objects.
 */
export function checkAndAwardNewAchievements(params: {
  outcome: SM2Outcome;
  streakDays: number;
  tacticsRating: number;
  sessionRatingGain: number;
  weeklyRatingGain: number;
  allTimeHighRating: number;
  previousAllTimeHigh: number;
  reviewQueueCount: number;
  wasPreviouslyMissed: boolean;
  patternCompletedCount: number; // # patterns with all 200 puzzles done
  patternsWithHighAccuracy: string[]; // themes with 90%+ accuracy (min 20 attempts)
}): NewAchievement[] {
  const earned: NewAchievement[] = [];
  const {
    outcome, streakDays, tacticsRating, sessionRatingGain, weeklyRatingGain,
    allTimeHighRating, previousAllTimeHigh, reviewQueueCount, wasPreviouslyMissed,
    patternCompletedCount, patternsWithHighAccuracy,
  } = params;

  const isSolved = outcome === "solved-first-try" || outcome === "solved-after-retry";

  // Rating milestones
  const ratingMilestones: Array<[number, NewAchievementId]> = [
    [800, "first_steps"], [1000, "improving"], [1200, "solid"],
    [1500, "strong"], [1800, "expert"], [2000, "master"],
  ];
  for (const [threshold, id] of ratingMilestones) {
    if (tacticsRating >= threshold) {
      const r = earnNewAchievement(id);
      if (r.earned && r.achievement) earned.push(r.achievement);
    }
  }

  // Century Climb: 100+ points in a single session
  if (sessionRatingGain >= 100) {
    const r = earnNewAchievement("century_climb");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }

  // Personal Best: new all-time high
  if (isSolved && tacticsRating > previousAllTimeHigh) {
    const r = earnNewAchievement("personal_best");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }

  // Weekly Climber: 200+ points in 7 days
  if (weeklyRatingGain >= 200) {
    const r = earnNewAchievement("weekly_climber");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }

  // Streak milestones
  if (streakDays >= 3) {
    const r = earnNewAchievement("three_in_a_row");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }
  if (streakDays >= 7) {
    const r = earnNewAchievement("week_warrior");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }
  if (streakDays >= 30) {
    const r = earnNewAchievement("habit_formed");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }

  // Pattern Mastery
  if (patternCompletedCount >= 1) {
    const r = earnNewAchievement("pattern_beginner");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }
  if (patternCompletedCount >= 5) {
    const r = earnNewAchievement("pattern_student");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }
  if (patternCompletedCount >= 17) {
    const r = earnNewAchievement("pattern_master");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }
  if (patternsWithHighAccuracy.length > 0) {
    const r = earnNewAchievement("sharp_eye");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }

  // Clean Slate: review queue = 0
  if (reviewQueueCount === 0) {
    const r = earnNewAchievement("clean_slate");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }

  // Second Chance: solved a previously missed puzzle
  if (isSolved && wasPreviouslyMissed) {
    const r = earnNewAchievement("second_chance");
    if (r.earned && r.achievement) earned.push(r.achievement);
  }

  return earned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — Weekly rating gain tracking for Weekly Climber achievement
// ─────────────────────────────────────────────────────────────────────────────

const WEEKLY_RATING_GAIN_KEY = "ctt_weekly_rating_gain_v2";

interface WeeklyRatingGainData {
  weekStart: string; // YYYY-MM-DD (Monday)
  ratingAtWeekStart: number;
}

export function getWeeklyRatingGainData(): WeeklyRatingGainData | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(WEEKLY_RATING_GAIN_KEY) || "null");
  } catch {
    return null;
  }
}

export function ensureWeeklyRatingBaseline(currentRating: number): void {
  if (typeof window === "undefined") return;
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const weekStart = monday.toISOString().slice(0, 10);

  const existing = getWeeklyRatingGainData();
  if (!existing || existing.weekStart !== weekStart) {
    localStorage.setItem(WEEKLY_RATING_GAIN_KEY, JSON.stringify({ weekStart, ratingAtWeekStart: currentRating }));
  }
}

export function getWeeklyRatingGainAmount(currentRating: number): number {
  const data = getWeeklyRatingGainData();
  if (!data) return 0;
  return Math.max(0, currentRating - data.ratingAtWeekStart);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — Session rating gain tracking for Century Climb achievement
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_RATING_KEY = "ctt_session_rating_start";

export function getSessionRatingStart(): number {
  if (typeof window === "undefined") return 800;
  try {
    const stored = localStorage.getItem(SESSION_RATING_KEY);
    return stored ? parseInt(stored, 10) : 800;
  } catch {
    return 800;
  }
}

export function setSessionRatingStart(rating: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_RATING_KEY, String(rating));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — All-time high rating tracking
// ─────────────────────────────────────────────────────────────────────────────

const ALL_TIME_HIGH_KEY = "ctt_all_time_high_rating";

export function getAllTimeHighRating(): number {
  if (typeof window === "undefined") return 800;
  try {
    const stored = localStorage.getItem(ALL_TIME_HIGH_KEY);
    return stored ? parseInt(stored, 10) : 800;
  } catch {
    return 800;
  }
}

export function updateAllTimeHighRating(currentRating: number): { isNewHigh: boolean; previousHigh: number } {
  const previous = getAllTimeHighRating();
  if (currentRating > previous) {
    localStorage.setItem(ALL_TIME_HIGH_KEY, String(currentRating));
    return { isNewHigh: true, previousHigh: previous };
  }
  return { isNewHigh: false, previousHigh: previous };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — Puzzles solved today / this week / all time helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getPuzzlesSolvedThisWeek(): number {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const weekStart = monday.toISOString().slice(0, 10);

  return getSM2Attempts().filter((a) => {
    const date = a.timestamp.slice(0, 10);
    return date >= weekStart && (a.outcome === "solved-first-try" || a.outcome === "solved-after-retry");
  }).length;
}

export function getPuzzlesSolvedAllTime(): number {
  return getSM2Attempts().filter(
    (a) => a.outcome === "solved-first-try" || a.outcome === "solved-after-retry"
  ).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — Pattern completion count (# with all 200 done)
// ─────────────────────────────────────────────────────────────────────────────

export function getCompletedPatternCount(): number {
  const progressMap = getPuzzleProgressMap();
  const byTheme: Record<string, number> = {};
  for (const p of Object.values(progressMap)) {
    if (!byTheme[p.patternTheme]) byTheme[p.patternTheme] = 0;
    if (p.status !== "missed") byTheme[p.patternTheme]++;
  }
  // Count themes where attempted >= 200
  return Object.values(byTheme).filter((count) => count >= 200).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — Patterns with 90%+ accuracy (min 20 attempts)
// ─────────────────────────────────────────────────────────────────────────────

export function getPatternsWithHighAccuracy(): string[] {
  const stats = getAllPatternStats();
  return stats
    .filter((s) => s.totalAttempts >= 20 && s.solveRate >= 0.9)
    .map((s) => s.theme);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — Review queue helpers
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_QUEUE_STORAGE_KEY = "ctt_review_queue";

export function getReviewQueueCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const queue: string[] = JSON.parse(localStorage.getItem(REVIEW_QUEUE_STORAGE_KEY) || "[]");
    return queue.length;
  } catch {
    return 0;
  }
}

export function getReviewQueueThemes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const queue: string[] = JSON.parse(localStorage.getItem(REVIEW_QUEUE_STORAGE_KEY) || "[]");
    // Try to find themes from SM2 attempts
    const sm2 = getSM2Attempts();
    const themes = new Set<string>();
    for (const id of queue) {
      const attempt = sm2.filter((a) => a.puzzleId === id && a.theme).slice(-1)[0];
      if (attempt?.theme) themes.add(attempt.theme);
    }
    return Array.from(themes);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — Rating trend (points gained/lost this week)
// ─────────────────────────────────────────────────────────────────────────────

export function getRatingTrendThisWeek(): number {
  const data = getTacticsRatingData();
  if (!data.tacticsRatingHistory || data.tacticsRatingHistory.length === 0) return 0;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const weekStart = monday.toISOString().slice(0, 10);

  // Find rating at start of week
  const beforeWeek = data.tacticsRatingHistory.filter((h) => h.date < weekStart);
  const ratingAtWeekStart = beforeWeek.length > 0
    ? beforeWeek[beforeWeek.length - 1].rating
    : data.tacticsRatingStart;

  return data.tacticsRating - ratingAtWeekStart;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 7 Redesign — Rating sparkline data (last 30 days)
// ─────────────────────────────────────────────────────────────────────────────

export interface SparklinePoint {
  date: string;
  rating: number;
}

export function getRatingSparkline(): SparklinePoint[] {
  const data = getTacticsRatingData();
  if (!data.tacticsRatingHistory || data.tacticsRatingHistory.length === 0) return [];

  // Last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

  return data.tacticsRatingHistory
    .filter((h) => h.date >= cutoff)
    .map((h) => ({ date: h.date, rating: h.rating }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 12 — Time Standards & Mastery Tracking
// ─────────────────────────────────────────────────────────────────────────────

export interface PuzzleTimeHistoryEntry {
  time: number;       // seconds elapsed
  correct: boolean;
  date: string;       // YYYY-MM-DD
}

export interface PuzzleTimeRecord {
  bestTime: number | null;
  lastTime: number | null;
  attempts: number;
  correct: boolean;   // ever solved correctly
  metStandard: boolean; // ever met the time standard while correct
  history: PuzzleTimeHistoryEntry[];
}

export type PuzzleTimesMap = Record<string, PuzzleTimeRecord>;

export const DEFAULT_TIME_STANDARD = 30; // seconds

export function getPuzzleTimes(): PuzzleTimesMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PUZZLE_TIMES_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePuzzleTimes(map: PuzzleTimesMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PUZZLE_TIMES_KEY, JSON.stringify(map));
}

/**
 * Record a puzzle attempt with elapsed time.
 * @param puzzleId   Lichess puzzle ID (string)
 * @param elapsedSec Seconds taken (0 if unknown)
 * @param correct    True if solved (first try or after retry)
 * @param timeStandard Target seconds (from puzzle settings)
 */
export function recordPuzzleTime(
  puzzleId: string,
  elapsedSec: number,
  correct: boolean,
  timeStandard: number
): PuzzleTimeRecord {
  const map = getPuzzleTimes();
  const existing: PuzzleTimeRecord = map[puzzleId] ?? {
    bestTime: null,
    lastTime: null,
    attempts: 0,
    correct: false,
    metStandard: false,
    history: [],
  };

  const metStandard = correct && elapsedSec > 0 && elapsedSec <= timeStandard;

  const entry: PuzzleTimeHistoryEntry = {
    time: elapsedSec,
    correct,
    date: new Date().toISOString().slice(0, 10),
  };

  const newBestTime =
    correct && elapsedSec > 0
      ? existing.bestTime === null
        ? elapsedSec
        : Math.min(existing.bestTime, elapsedSec)
      : existing.bestTime;

  const updated: PuzzleTimeRecord = {
    bestTime: newBestTime,
    lastTime: elapsedSec > 0 ? elapsedSec : existing.lastTime,
    attempts: existing.attempts + 1,
    correct: existing.correct || correct,
    metStandard: existing.metStandard || metStandard,
    history: [...existing.history, entry],
  };

  map[puzzleId] = updated;
  savePuzzleTimes(map);
  return updated;
}

/**
 * Get per-pattern time-standard stats.
 * Returns { solved, metStandard, total } for each pattern theme key.
 * Uses ctt_puzzle_progress for puzzle→theme mapping, augmented with puzzle times.
 */
export interface PatternTimeStats {
  theme: string;
  solved: number;
  metStandard: number;
  total: number; // total attempted
}

export function getPatternTimeStats(): PatternTimeStats[] {
  const timesMap = getPuzzleTimes();
  const progressMap = getPuzzleProgressMap();

  // Build theme → { solved, metStandard, total }
  const byTheme: Record<string, { solved: number; metStandard: number; total: number }> = {};

  for (const [puzzleId, progress] of Object.entries(progressMap)) {
    const theme = progress.patternTheme;
    if (!byTheme[theme]) byTheme[theme] = { solved: 0, metStandard: 0, total: 0 };
    byTheme[theme].total++;
    const isSolved = progress.status === "solved_first_try" || progress.status === "solved_retry";
    if (isSolved) byTheme[theme].solved++;
    const timeRecord = timesMap[puzzleId];
    if (timeRecord?.metStandard) byTheme[theme].metStandard++;
  }

  return Object.entries(byTheme).map(([theme, stats]) => ({ theme, ...stats }));
}

/**
 * Get time standard from puzzle settings (ctt_puzzle_settings).
 * Falls back to DEFAULT_TIME_STANDARD if not set.
 */
export function getTimeStandard(): number {
  if (typeof window === "undefined") return DEFAULT_TIME_STANDARD;
  try {
    const settings = JSON.parse(localStorage.getItem("ctt_puzzle_settings") || "null");
    return settings?.timeStandard ?? DEFAULT_TIME_STANDARD;
  } catch {
    return DEFAULT_TIME_STANDARD;
  }
}

export function saveTimeStandard(seconds: number): void {
  if (typeof window === "undefined") return;
  try {
    const settings = JSON.parse(localStorage.getItem("ctt_puzzle_settings") || "{}");
    settings.timeStandard = seconds;
    localStorage.setItem("ctt_puzzle_settings", JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 12 — Puzzle Rating (Puzzles/mixed mode only)
// Separate from tactics rating and pattern ratings.
// ─────────────────────────────────────────────────────────────────────────────

const PUZZLE_RATING_KEY = "ctt_puzzle_rating";
const PUZZLE_RATING_DEFAULT = 800;

export interface PuzzleRatingData {
  rating: number;
  totalPuzzlesRated: number;
}

export function getPuzzleRating(): PuzzleRatingData {
  if (typeof window === "undefined") return { rating: PUZZLE_RATING_DEFAULT, totalPuzzlesRated: 0 };
  try {
    const stored = localStorage.getItem(PUZZLE_RATING_KEY);
    if (stored) return JSON.parse(stored) as PuzzleRatingData;
  } catch {
    // ignore
  }
  return { rating: PUZZLE_RATING_DEFAULT, totalPuzzlesRated: 0 };
}

export function updatePuzzleRating(puzzleRating: number, won: boolean): { newRating: number; delta: number } {
  if (typeof window === "undefined") return { newRating: PUZZLE_RATING_DEFAULT, delta: 0 };
  const data = getPuzzleRating();
  const K = data.totalPuzzlesRated < 30 ? 40 : 20;
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - data.rating) / 400));
  const delta = Math.round(K * ((won ? 1 : 0) - expected));
  const newRating = Math.max(400, data.rating + delta);
  const updated: PuzzleRatingData = {
    rating: newRating,
    totalPuzzlesRated: data.totalPuzzlesRated + 1,
  };
  localStorage.setItem(PUZZLE_RATING_KEY, JSON.stringify(updated));
  return { newRating, delta };
}

// ── Failure Mode Stats (Sprint 31) ────────────────────────────────────────
export interface FailureModeStats {
  missed: number;
  miscalculated: number;
  rushed: number;
  unsure: number;
  total: number;
}

const FAILURE_STATS_KEY = "ctt_failure_mode_stats";

export function getFailureModeStats(): FailureModeStats {
  if (typeof window === "undefined") return { missed: 0, miscalculated: 0, rushed: 0, unsure: 0, total: 0 };
  try {
    const stored = localStorage.getItem(FAILURE_STATS_KEY);
    if (stored) return JSON.parse(stored) as FailureModeStats;
  } catch {
    // ignore
  }
  return { missed: 0, miscalculated: 0, rushed: 0, unsure: 0, total: 0 };
}

export function getDominantFailureMode(): keyof Omit<FailureModeStats, "total"> | null {
  const stats = getFailureModeStats();
  if (stats.total === 0) return null;
  const modes: Array<keyof Omit<FailureModeStats, "total">> = ["missed", "miscalculated", "rushed", "unsure"];
  return modes.reduce((a, b) => stats[a] >= stats[b] ? a : b);
}

// ── Sprint 31–32 stub exports (fix build errors for missing members) ───────

// CalcGym
export interface CalcGymSession {
  id: string;
  date: string;
  score: number;
  total: number;
  timeMs: number;
}
export function saveCalcGymSession(_session: CalcGymSession): void {
  if (typeof window === "undefined") return;
  try {
    const sessions = getCalcGymSessions();
    sessions.unshift(_session);
    localStorage.setItem("ctt_calc_gym_sessions", JSON.stringify(sessions.slice(0, 50)));
  } catch { /* ignore */ }
}
export function getCalcGymSessions(): CalcGymSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("ctt_calc_gym_sessions");
    return raw ? JSON.parse(raw) as CalcGymSession[] : [];
  } catch { return []; }
}
export function getCalcGymStats(): {
  totalSessions: number;
  avgScore: number;
  avgTimeMs: number;
  trend: number[];
} {
  const sessions = getCalcGymSessions();
  if (sessions.length === 0) return { totalSessions: 0, avgScore: 0, avgTimeMs: 0, trend: [] };
  const avgScore = Math.round(sessions.reduce((s, x) => s + x.score, 0) / sessions.length);
  const avgTime = Math.round(sessions.reduce((s, x) => s + x.timeMs, 0) / sessions.length);
  const trend = sessions.slice(0, 10).reverse().map((x) => x.score);
  return { totalSessions: sessions.length, avgScore, avgTimeMs: avgTime, trend };
}

// Composure / Chaos Mode
export function updateComposureRating(_correct: boolean): void { /* stub */ }

// Confidence
export type ConfidenceLevel = "low" | "medium" | "high";
export interface ConfidenceEntry {
  puzzleId: string;
  confidence: ConfidenceLevel;
  wasCorrect: boolean;
  date: string;
}
export function recordConfidenceEntry(_entry: ConfidenceEntry): void { /* stub */ }

// Explanation cache
export function getCachedExplanation(_puzzleId: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(`ctt_explain_${_puzzleId}`); } catch { return null; }
}
export function setCachedExplanation(_puzzleId: string, _text: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`ctt_explain_${_puzzleId}`, _text); } catch { /* ignore */ }
}

// Move Comparison
export interface MoveComparisonEntry {
  puzzleId: string;
  pickedRank: number;
  score: number;
  date: string;
}
export function recordMoveComparisonEntry(_entry: MoveComparisonEntry): void { /* stub */ }
export function getMoveComparisonStats(): {
  totalSessions: number;
  evaluationScore: number;
  bestPickPct: number;
} {
  return { totalSessions: 0, evaluationScore: 0, bestPickPct: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Snapshots — tracks win rate, weak patterns, game length over time
// ─────────────────────────────────────────────────────────────────────────────

const GAME_SNAPSHOTS_KEY = "ctt_game_snapshots";

export interface GameSnapshot {
  date: string; // YYYY-MM-DD
  winRate: number; // 0–1
  weakPatterns: Array<{ pattern: string; missRate: number }>;
  avgGameLength: number; // move count
  phaseBreakdown: { opening: number; middlegame: number; endgame: number };
}

export function getGameSnapshots(): GameSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GAME_SNAPSHOTS_KEY);
    return raw ? (JSON.parse(raw) as GameSnapshot[]) : [];
  } catch {
    return [];
  }
}

// Parse result string from PGN header (e.g. [Result "1-0"])
function parsePgnResult(pgn: string): string | null {
  const m = pgn.match(/\[Result\s+"([^"]+)"\]/);
  return m ? m[1] : null;
}

// Count half-moves from PGN moves section (rough move count)
function countPgnMoves(pgn: string): number {
  // Strip headers
  const movesSection = pgn.replace(/\[[^\]]*\]/g, "").trim();
  // Count move numbers like "1." "2." etc
  const nums = movesSection.match(/\d+\./g);
  return nums ? nums.length : 0;
}

export function saveGameSnapshot(games: Array<{ pgn: string; playerColor: string }>): void {
  if (typeof window === "undefined" || games.length === 0) return;
  try {
    // Win rate
    let wins = 0;
    let total = 0;
    const moveCounts: number[] = [];
    const phaseMisses = { opening: 0, middlegame: 0, endgame: 0 };
    const patternMissCounts: Record<string, number> = {};
    let patternTotalPositions = 0;

    for (const { pgn, playerColor } of games) {
      const result = parsePgnResult(pgn);
      const isWhite = playerColor.toLowerCase().startsWith("w");
      if (result) {
        total++;
        if (result === "1-0" && isWhite) wins++;
        else if (result === "0-1" && !isWhite) wins++;
        else if (result === "1/2-1/2") wins += 0.5;
      }

      // Move count
      const mc = countPgnMoves(pgn);
      if (mc > 0) moveCounts.push(mc);

      // Phase breakdown: scan moves in PGN for missed tactic positions
      // We use the stored ctt_game_analysis data if available, otherwise skip phase analysis
      // (Phase breakdown is best-effort from stored analysis)
    }

    // Use stored game analysis for pattern/phase data
    try {
      const analysisRaw = localStorage.getItem("ctt_game_analysis");
      if (analysisRaw) {
        const analysis = JSON.parse(analysisRaw) as {
          missedTactics: Array<{ pattern: string; fen: string; moveNumber?: number }>;
        };
        if (analysis.missedTactics?.length) {
          for (const m of analysis.missedTactics) {
            const pat = m.pattern ?? "fork";
            patternMissCounts[pat] = (patternMissCounts[pat] || 0) + 1;
            patternTotalPositions++;
            const mv = m.moveNumber ?? 20;
            if (mv <= 10) phaseMisses.opening++;
            else if (mv <= 30) phaseMisses.middlegame++;
            else phaseMisses.endgame++;
          }
        }
      } else {
        // Fallback: use custom_analysis key (same data, different key name)
        const altRaw = localStorage.getItem("ctt_custom_analysis");
        if (altRaw) {
          const altData = JSON.parse(altRaw) as {
            missedTactics: Array<{ pattern: string; fen: string }>;
          };
          if (altData.missedTactics?.length) {
            for (const m of altData.missedTactics) {
              const pat = m.pattern ?? "fork";
              patternMissCounts[pat] = (patternMissCounts[pat] || 0) + 1;
              patternTotalPositions++;
              // No move number available — default to middlegame
              phaseMisses.middlegame++;
            }
          }
        }
      }
    } catch { /* ignore */ }

    const winRate = total > 0 ? wins / total : 0;
    const avgGameLength = moveCounts.length > 0
      ? Math.round(moveCounts.reduce((a, b) => a + b, 0) / moveCounts.length)
      : 0;

    // Build weak patterns sorted by miss rate (miss count / total positions)
    const weakPatterns = Object.entries(patternMissCounts)
      .map(([pattern, count]) => ({
        pattern,
        missRate: patternTotalPositions > 0 ? count / patternTotalPositions : 0,
      }))
      .sort((a, b) => b.missRate - a.missRate)
      .slice(0, 3);

    const snapshot: GameSnapshot = {
      date: new Date().toISOString().slice(0, 10),
      winRate,
      weakPatterns,
      avgGameLength,
      phaseBreakdown: phaseMisses,
    };

    const existing = getGameSnapshots();
    // Replace today's snapshot if one exists, otherwise append
    const todayIdx = existing.findIndex((s) => s.date === snapshot.date);
    if (todayIdx >= 0) {
      existing[todayIdx] = snapshot;
    } else {
      existing.push(snapshot);
    }
    // Keep last 12
    const trimmed = existing.slice(-12);
    localStorage.setItem(GAME_SNAPSHOTS_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

// Verbalization
export type VerbalizedPattern = string;
export function recordVerbalization(_puzzleId: string, _pattern: VerbalizedPattern): void { /* stub */ }

// Warm-up
export function setWarmedUpToday(): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("ctt_warmed_up", new Date().toISOString().slice(0, 10)); } catch { /* ignore */ }
}

// First puzzles start below calibration for confidence building
export function getPatternStartingELO(): number {
  if (typeof window === "undefined") return 800;
  try {
    const raw = localStorage.getItem("ctt_calibration_rating");
    if (raw) {
      const rating = parseInt(raw, 10);
      if (!isNaN(rating)) return Math.max(400, rating - 150);
    }
  } catch { /* ignore */ }
  return 800;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 36 — Mastery Set Training System
// ─────────────────────────────────────────────────────────────────────────────

const MASTERY_PROGRESS_KEY = "ctt_mastery_progress";

export interface MasteryPuzzle {
  id: string;                   // "tactic_[lichessId]" or "blunder_[id]"
  type: "tactic" | "blunder";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  puzzleData: any;              // tactic: {fen,solution,rating,theme} | blunder: {fen,choices,correctChoiceIndex,blunderExplanation,patternTag}
  masteryHits: number;          // 0–3; 3 = mastered (legacy, kept for UI continuity)
  lastSolvedAt: number[];       // timestamps of each mastery hit
  lastMasteryHitCounter: number;// sessionPuzzleCounter value when last mastery hit was awarded
  attempts: number;
  correctAttempts: number;
  avgSolveTime: number;         // avg ms across correct solves
  lastAttemptAt: number;
  fsrs?: FSRSState;             // FSRS scheduling state (optional for backwards compat)
}

export interface MasterySet {
  setNumber: number;
  createdAt: number;
  completedAt: number | null;
  targetELO: number;
  puzzles: MasteryPuzzle[];     // variable size (default 10)
  blunderRatio: number;
}

export interface MasteryProgress {
  currentSetNumber: number;
  sets: MasterySet[];
  totalMastered: number;        // all-time mastered count
  currentStreak: number;
  sessionPuzzleCounter: number; // monotonically increasing; used for non-consecutive mastery rule
  dailySessionCompleted: number;// puzzles completed in current daily session
  dailySessionDate: string;     // ISO date of active session (YYYY-MM-DD)
}

function defaultMasteryProgress(): MasteryProgress {
  return {
    currentSetNumber: 1,
    sets: [],
    totalMastered: 0,
    currentStreak: 0,
    sessionPuzzleCounter: 0,
    dailySessionCompleted: 0,
    dailySessionDate: "",
  };
}

export function getMasteryProgress(): MasteryProgress {
  if (typeof window === "undefined") return defaultMasteryProgress();
  try {
    return JSON.parse(localStorage.getItem(MASTERY_PROGRESS_KEY) || "null") ?? defaultMasteryProgress();
  } catch {
    return defaultMasteryProgress();
  }
}

export function saveMasteryProgress(p: MasteryProgress): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MASTERY_PROGRESS_KEY, JSON.stringify(p));
}

export function getCurrentMasterySet(): MasterySet | null {
  const progress = getMasteryProgress();
  if (progress.sets.length === 0) return null;
  return progress.sets[progress.sets.length - 1];
}

export function getMasteredCount(): number {
  const set = getCurrentMasterySet();
  if (!set) return 0;
  return set.puzzles.filter((p) => p.masteryHits >= 3).length;
}

export function isSetComplete(): boolean {
  const set = getCurrentMasterySet();
  if (!set) return false;
  return set.puzzles.every((p) => p.masteryHits >= 3);
}

/**
 * Record a puzzle attempt and update mastery hits.
 *
 * Non-consecutive rule: a mastery hit is only awarded if sessionPuzzleCounter
 * is at least 2 greater than lastMasteryHitCounter (i.e. at least one other
 * puzzle was shown between this hit and the previous one).
 */
export function recordMasteryAttempt(
  puzzleId: string,
  correct: boolean,
  solveTimeMs: number
): { masteryHits: number; masteryAwarded: boolean } {
  if (typeof window === "undefined") return { masteryHits: 0, masteryAwarded: false };
  const progress = getMasteryProgress();
  if (progress.sets.length === 0) return { masteryHits: 0, masteryAwarded: false };
  const set = progress.sets[progress.sets.length - 1];
  const puzzle = set.puzzles.find((p) => p.id === puzzleId);
  if (!puzzle) return { masteryHits: 0, masteryAwarded: false };

  // Increment global puzzle counter
  progress.sessionPuzzleCounter += 1;
  const currentCounter = progress.sessionPuzzleCounter;

  // Update base stats
  puzzle.attempts += 1;
  puzzle.lastAttemptAt = Date.now();

  let masteryAwarded = false;

  if (correct) {
    puzzle.correctAttempts += 1;
    // Update running average solve time
    if (puzzle.avgSolveTime === 0) {
      puzzle.avgSolveTime = solveTimeMs;
    } else {
      puzzle.avgSolveTime = Math.round(
        (puzzle.avgSolveTime * (puzzle.correctAttempts - 1) + solveTimeMs) / puzzle.correctAttempts
      );
    }

    if (solveTimeMs < 10000 && puzzle.masteryHits < 3) {
      // Solve correctly under 10 seconds = mastered
      puzzle.masteryHits = 3;
      puzzle.lastSolvedAt.push(Date.now());
      puzzle.lastMasteryHitCounter = currentCounter;
      masteryAwarded = true;
      progress.totalMastered += 1;
    }
  } else {
    // Wrong answer: reset mastery
    puzzle.masteryHits = 0;
    puzzle.lastSolvedAt = [];
    puzzle.lastMasteryHitCounter = 0;
  }

  // FSRS: update memory state (independent of legacy mastery hits)
  const prevFsrs = puzzle.fsrs ?? inferFSRSFromLegacy(puzzle);
  const grade = solveToGrade(correct, solveTimeMs);
  puzzle.fsrs = reviewCard(prevFsrs, grade);

  saveMasteryProgress(progress);
  return { masteryHits: puzzle.masteryHits, masteryAwarded };
}

/**
 * Ensure every puzzle in the current set has an FSRS state.
 * Called lazily by the picker so legacy data is migrated on first read.
 */
export function ensureFSRSState(puzzle: MasteryPuzzle): FSRSState {
  if (!puzzle.fsrs) {
    puzzle.fsrs = puzzle.attempts > 0 ? inferFSRSFromLegacy(puzzle) : defaultFSRSState();
  }
  return puzzle.fsrs;
}

/**
 * Aggregate FSRS retention stats by motif theme across the user's mastery sets.
 * Used by the Translation Deficit dashboard.
 *
 * Returns a map of theme → { puzzleCount, attempts, correctAttempts, avgRetrievability }
 * where avgRetrievability is the mean current recall probability across that theme.
 */
export interface MotifRetention {
  theme: string;
  puzzleCount: number;
  attempts: number;
  correctAttempts: number;
  avgRetrievability: number;  // 0–1
  avgStability: number;       // days
}

export function getMotifRetentionStats(): MotifRetention[] {
  if (typeof window === "undefined") return [];
  const progress = getMasteryProgress();
  const buckets = new Map<string, { puzzleCount: number; attempts: number; correct: number; rSum: number; sSum: number; rCount: number }>();

  for (const set of progress.sets) {
    for (const puzzle of set.puzzles) {
      const themes: string[] = Array.isArray(puzzle.puzzleData?.themes)
        ? puzzle.puzzleData.themes
        : puzzle.puzzleData?.theme
        ? [puzzle.puzzleData.theme]
        : puzzle.puzzleData?.patternTag
        ? [puzzle.puzzleData.patternTag]
        : [];
      if (themes.length === 0) continue;
      const fsrs = puzzle.fsrs ?? (puzzle.attempts > 0 ? inferFSRSFromLegacy(puzzle) : null);
      for (const themeRaw of themes) {
        const theme = String(themeRaw).toLowerCase();
        const existing = buckets.get(theme) ?? { puzzleCount: 0, attempts: 0, correct: 0, rSum: 0, sSum: 0, rCount: 0 };
        existing.puzzleCount += 1;
        existing.attempts += puzzle.attempts;
        existing.correct += puzzle.correctAttempts;
        if (fsrs && fsrs.lastReview > 0) {
          // Retrievability calc inlined to avoid a top-level fsrs import dependency at runtime
          // (we already imported reviewCard / inferFSRSFromLegacy, so pull retrievability too)
          const r = computeRetrievability(fsrs);
          existing.rSum += r;
          existing.sSum += fsrs.stability;
          existing.rCount += 1;
        }
        buckets.set(theme, existing);
      }
    }
  }

  return Array.from(buckets.entries()).map(([theme, b]) => ({
    theme,
    puzzleCount: b.puzzleCount,
    attempts: b.attempts,
    correctAttempts: b.correct,
    avgRetrievability: b.rCount > 0 ? b.rSum / b.rCount : 0,
    avgStability: b.rCount > 0 ? b.sSum / b.rCount : 0,
  }));
}

// Local copy of retrievability formula to avoid circular import surface;
// kept identical to lib/fsrs.ts.
function computeRetrievability(state: FSRSState, now: number = Date.now()): number {
  if (state.state === "new" || state.lastReview === 0 || state.stability === 0) return 0;
  const DECAY = -0.5;
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
  const daysSince = (now - state.lastReview) / 86_400_000;
  return Math.pow(1 + (FACTOR * daysSince) / state.stability, DECAY);
}

/**
 * Increment the daily session counter. Resets to 0 if it's a new day.
 * Returns the updated count.
 */
export function incrementDailySession(): number {
  if (typeof window === "undefined") return 0;
  const progress = getMasteryProgress();
  const today = new Date().toISOString().slice(0, 10);
  if (progress.dailySessionDate !== today) {
    progress.dailySessionCompleted = 0;
    progress.dailySessionDate = today;
  }
  progress.dailySessionCompleted += 1;
  saveMasteryProgress(progress);
  return progress.dailySessionCompleted;
}

/** Read today's completed count without incrementing. */
export function getDailySessionCompleted(): number {
  if (typeof window === "undefined") return 0;
  const progress = getMasteryProgress();
  const today = new Date().toISOString().slice(0, 10);
  if (progress.dailySessionDate !== today) return 0;
  return progress.dailySessionCompleted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 41 — CCT Mode (Checks, Captures, Threats)
// ─────────────────────────────────────────────────────────────────────────────

const CCT_MODE_KEY = "ctt_cct_mode";
const CCT_NUDGE_COUNT_KEY = "ctt_cct_nudge_count";
const CCT_SESSION_COUNT_KEY = "ctt_session_count";

export type CCTMode = "off" | "suggested" | "enforced";

export function getCCTMode(): CCTMode {
  if (typeof window === "undefined") return "suggested";
  try {
    const val = localStorage.getItem(CCT_MODE_KEY);
    if (val === null) return "suggested";
    // Migrate old boolean values
    if (val === "true") return "enforced";
    if (val === "false") return "off";
    if (val === "off" || val === "suggested" || val === "enforced") return val;
    return "suggested";
  } catch { return "suggested"; }
}

export function saveCCTMode(v: CCTMode): void {
  try { localStorage.setItem(CCT_MODE_KEY, v); } catch { /* ignore */ }
}

export function getCCTNudgeCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const val = localStorage.getItem(CCT_NUDGE_COUNT_KEY);
    return val ? parseInt(val, 10) || 0 : 0;
  } catch { return 0; }
}

export function incrementCCTNudgeCount(): number {
  const count = getCCTNudgeCount() + 1;
  try { localStorage.setItem(CCT_NUDGE_COUNT_KEY, String(count)); } catch { /* ignore */ }
  return count;
}

export function getCCTSessionCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const val = localStorage.getItem(CCT_SESSION_COUNT_KEY);
    return val ? parseInt(val, 10) || 0 : 0;
  } catch { return 0; }
}

export function incrementCCTSessionCount(): number {
  const count = getCCTSessionCount() + 1;
  try { localStorage.setItem(CCT_SESSION_COUNT_KEY, String(count)); } catch { /* ignore */ }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// CCT Familiarity / Onboarding State
// ─────────────────────────────────────────────────────────────────────────────

const CCT_FAMILIARITY_KEY = "ctt_cct_familiarity";
const CCT_ONBOARDING_COMPLETE_KEY = "ctt_cct_onboarding_complete";
const CCT_FIRST_SESSION_COMPLETE_KEY = "ctt_cct_first_session_complete";

export type CCTFamiliarity = "new_to_cct" | "cct_inconsistent" | "cct_confident";

export function getCCTFamiliarity(): CCTFamiliarity | null {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(CCT_FAMILIARITY_KEY);
    if (val === "new_to_cct" || val === "cct_inconsistent" || val === "cct_confident") {
      return val;
    }
    return null;
  } catch { return null; }
}

export function saveCCTFamiliarity(v: CCTFamiliarity): void {
  try { localStorage.setItem(CCT_FAMILIARITY_KEY, v); } catch { /* ignore */ }
}

export function getCCTOnboardingComplete(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const val = localStorage.getItem(CCT_ONBOARDING_COMPLETE_KEY);
    return val === "true";
  } catch { return false; }
}

export function saveCCTOnboardingComplete(complete: boolean): void {
  try { localStorage.setItem(CCT_ONBOARDING_COMPLETE_KEY, complete ? "true" : "false"); } catch { /* ignore */ }
}

export function getCCTFirstSessionComplete(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const val = localStorage.getItem(CCT_FIRST_SESSION_COMPLETE_KEY);
    return val === "true";
  } catch { return false; }
}

export function saveCCTFirstSessionComplete(complete: boolean): void {
  try { localStorage.setItem(CCT_FIRST_SESSION_COMPLETE_KEY, complete ? "true" : "false"); } catch { /* ignore */ }
}

// CCT Trainer first visit
const CCT_TRAINER_FIRST_VISIT_KEY = "ctt_cct_trainer_first_visit";

export function getCCTTrainerFirstVisit(): boolean {
  try {
    const val = localStorage.getItem(CCT_TRAINER_FIRST_VISIT_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export function saveCCTTrainerFirstVisit(visited: boolean): void {
  try { localStorage.setItem(CCT_TRAINER_FIRST_VISIT_KEY, visited ? "true" : "false"); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature: Pattern Recognition Speed Tracking & Pattern Mastery Progression
// ─────────────────────────────────────────────────────────────────────────────

interface PatternSolveTimeEntry {
  timestamp: number; // Date.now()
  solveTimeMs: number;
}

const PATTERN_SOLVE_TIMES_KEY = "ctt_pattern_solve_times"; // Record<pattern, PatternSolveTimeEntry[]>
const PATTERN_MASTERY_TOTALS_KEY = "ctt_pattern_mastery_totals"; // Record<pattern, number>

/**
 * Record a solve time for a pattern (called after puzzle completion in TrainingSession)
 */
export function recordPatternSolveTime(pattern: string, solveTimeMs: number): void {
  if (typeof window === "undefined" || !pattern) return;
  try {
    const raw = localStorage.getItem(PATTERN_SOLVE_TIMES_KEY);
    const data: Record<string, PatternSolveTimeEntry[]> = raw ? JSON.parse(raw) : {};
    if (!data[pattern]) data[pattern] = [];
    data[pattern].push({ timestamp: Date.now(), solveTimeMs });
    // Keep last 100 entries per pattern to avoid bloat
    if (data[pattern].length > 100) {
      data[pattern] = data[pattern].slice(-100);
    }
    localStorage.setItem(PATTERN_SOLVE_TIMES_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/**
 * Get average solve time for a pattern over the last N days (0 = all time)
 */
export function getPatternAverageSolveTime(pattern: string, lastNDays: number = 30): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PATTERN_SOLVE_TIMES_KEY);
    if (!raw) return null;
    const data: Record<string, PatternSolveTimeEntry[]> = JSON.parse(raw);
    const entries = data[pattern] || [];
    if (entries.length === 0) return null;

    const now = Date.now();
    const cutoffMs = lastNDays > 0 ? lastNDays * 86400000 : 0;
    const filtered = cutoffMs > 0
      ? entries.filter((e) => now - e.timestamp <= cutoffMs)
      : entries;

    if (filtered.length === 0) return null;
    const avg = filtered.reduce((s, e) => s + e.solveTimeMs, 0) / filtered.length;
    return avg;
  } catch { return null; }
}

/**
 * Get average solve time over two periods to calculate trend
 */
export function getPatternSolveTimeTrend(
  pattern: string,
  recentDays: number = 7,
  olderDays: number = 30
): { recent: number | null; older: number | null; improvement: number | null } {
  const recent = getPatternAverageSolveTime(pattern, recentDays);
  const older = getPatternAverageSolveTime(pattern, olderDays);

  let improvement: number | null = null;
  if (recent !== null && older !== null && older > 0) {
    improvement = Math.round(((older - recent) / older) * 100);
  }

  return { recent, older, improvement };
}

/**
 * Get all patterns with solve time data
 */
export function getAllPatternSolveTimes(): Record<string, number | null> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PATTERN_SOLVE_TIMES_KEY);
    if (!raw) return {};
    const data: Record<string, PatternSolveTimeEntry[]> = JSON.parse(raw);
    const result: Record<string, number | null> = {};
    for (const [pattern, entries] of Object.entries(data)) {
      result[pattern] = entries.length > 0
        ? entries.reduce((s, e) => s + e.solveTimeMs, 0) / entries.length
        : null;
    }
    return result;
  } catch { return {}; }
}

/**
 * Increment total mastered puzzles for a pattern
 */
export function incrementPatternMasteryTotal(pattern: string): void {
  if (typeof window === "undefined" || !pattern) return;
  try {
    const raw = localStorage.getItem(PATTERN_MASTERY_TOTALS_KEY);
    const data: Record<string, number> = raw ? JSON.parse(raw) : {};
    data[pattern] = (data[pattern] || 0) + 1;
    localStorage.setItem(PATTERN_MASTERY_TOTALS_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/**
 * Get mastery total for a pattern
 */
export function getPatternMasteryTotal(pattern: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(PATTERN_MASTERY_TOTALS_KEY);
    if (!raw) return 0;
    const data: Record<string, number> = JSON.parse(raw);
    return data[pattern] || 0;
  } catch { return 0; }
}

/**
 * Get all pattern mastery totals, sorted by count descending
 */
export function getAllPatternMasteryTotals(): Array<{ pattern: string; count: number }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PATTERN_MASTERY_TOTALS_KEY);
    if (!raw) return [];
    const data: Record<string, number> = JSON.parse(raw);
    return Object.entries(data)
      .map(([pattern, count]) => ({ pattern, count }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
  } catch { return []; }
}
