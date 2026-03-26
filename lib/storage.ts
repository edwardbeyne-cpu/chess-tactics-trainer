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

    result.push({
      theme,
      totalAttempts,
      solvedFirstTry,
      solveRate,
      lastPracticed,
      dueCount,
      avgSolveTimeMs,
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
}

export function getUserSettings(): UserSettings {
  if (typeof window === "undefined") return { chesscomUsername: "", lichessUsername: "" };
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") as UserSettings | null;
    return data ?? { chesscomUsername: "", lichessUsername: "" };
  } catch {
    return { chesscomUsername: "", lichessUsername: "" };
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
  if (!settings.chesscomUsername && !settings.lichessUsername) return;

  const snapshot: RatingSnapshot = { date: getTodayKey() };

  if (settings.chesscomUsername) {
    try {
      const res = await fetch(
        `https://api.chess.com/pub/player/${settings.chesscomUsername}/stats`,
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
      // Ignore fetch errors
    }
  }

  if (settings.lichessUsername) {
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
