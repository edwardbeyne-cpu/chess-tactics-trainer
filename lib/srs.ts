// SM-2 Spaced Repetition Algorithm

export type OutcomeType = "solved-first-try" | "solved-after-retry" | "hint" | "failed";

export interface PuzzleAttempt {
  puzzleId: string;
  outcome: OutcomeType;
  timestamp: string;
  theme?: string; // pattern theme name (e.g. "FORK", "PIN") for per-pattern stats
}

export interface SRSResult {
  interval: number;
  repetitions: number;
  easeFactor: number;
  nextReviewDate: string; // ISO date string
}

export interface PuzzleStats {
  totalAttempts: number;
  solvedFirstTry: number;
  solveRate: number; // 0-1
  interval: number;
  repetitions: number;
  easeFactor: number;
  nextReviewDate: string | null;
  lastAttemptDate: string | null;
}

function outcomeToQuality(outcome: OutcomeType): number {
  switch (outcome) {
    case "solved-first-try":
      return 5;
    case "solved-after-retry":
      return 3;
    case "hint":
      return 1;
    case "failed":
      return 0;
  }
}

/**
 * SM-2 algorithm: compute the next review state given an attempt and the current state.
 * If currentState is omitted, defaults to initial values (interval=0, repetitions=0, easeFactor=2.5).
 */
export function calculateNextReview(
  attempt: PuzzleAttempt,
  currentState?: { interval: number; repetitions: number; easeFactor: number }
): SRSResult {
  const quality = outcomeToQuality(attempt.outcome);
  let { interval, repetitions, easeFactor } = currentState ?? {
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
  };

  if (quality >= 3) {
    // Passed
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    easeFactor =
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    easeFactor = Math.max(1.3, easeFactor);
    repetitions += 1;
  } else {
    // Failed
    interval = 1;
    repetitions = 0;
    // easeFactor unchanged
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

/**
 * Given an array of all attempts, return puzzle IDs that are due for review today.
 * Computes SM-2 state by replaying each puzzle's attempt history in order.
 */
export function getDuePuzzles(attempts: PuzzleAttempt[]): string[] {
  // Replay attempts in order to compute final SM-2 state per puzzle
  const stateMap = new Map<
    string,
    { interval: number; repetitions: number; easeFactor: number; nextReviewDate: string }
  >();

  for (const attempt of attempts) {
    const current = stateMap.get(attempt.puzzleId);
    const result = calculateNextReview(attempt, current);
    stateMap.set(attempt.puzzleId, result);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from(stateMap.entries())
    .filter(([, state]) => new Date(state.nextReviewDate) <= today)
    .map(([id]) => id);
}

/**
 * Compute full stats for a specific puzzle given all attempts.
 */
export function getPuzzleStats(
  puzzleId: string,
  attempts: PuzzleAttempt[]
): PuzzleStats {
  const puzzleAttempts = attempts.filter((a) => a.puzzleId === puzzleId);

  if (puzzleAttempts.length === 0) {
    return {
      totalAttempts: 0,
      solvedFirstTry: 0,
      solveRate: 0,
      interval: 0,
      repetitions: 0,
      easeFactor: 2.5,
      nextReviewDate: null,
      lastAttemptDate: null,
    };
  }

  let state: SRSResult = {
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextReviewDate: "",
  };

  for (const attempt of puzzleAttempts) {
    state = calculateNextReview(attempt, state);
  }

  const solvedFirstTry = puzzleAttempts.filter(
    (a) => a.outcome === "solved-first-try"
  ).length;

  return {
    totalAttempts: puzzleAttempts.length,
    solvedFirstTry,
    solveRate: solvedFirstTry / puzzleAttempts.length,
    interval: state.interval,
    repetitions: state.repetitions,
    easeFactor: state.easeFactor,
    nextReviewDate: state.nextReviewDate || null,
    lastAttemptDate: puzzleAttempts[puzzleAttempts.length - 1].timestamp,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 4 — Pattern Mastery Ranks
// ─────────────────────────────────────────────────────────────────────────────

export type PatternRank = "Unranked" | "Bronze" | "Silver" | "Gold" | "Master";

export interface PatternRankInfo {
  rank: PatternRank;
  emoji: string;
  color: string;
  attemptsNeeded: number;
  solveRateNeeded: number;
  avgTimeNeeded: number | null; // ms, null = no requirement
}

export const RANK_DEFINITIONS: PatternRankInfo[] = [
  { rank: "Unranked", emoji: "⬜", color: "#64748b", attemptsNeeded: 0, solveRateNeeded: 0, avgTimeNeeded: null },
  { rank: "Bronze", emoji: "🥉", color: "#cd7f32", attemptsNeeded: 10, solveRateNeeded: 0.4, avgTimeNeeded: null },
  { rank: "Silver", emoji: "🥈", color: "#c0c0c0", attemptsNeeded: 25, solveRateNeeded: 0.6, avgTimeNeeded: 60000 },
  { rank: "Gold", emoji: "🥇", color: "#ffd700", attemptsNeeded: 50, solveRateNeeded: 0.75, avgTimeNeeded: 30000 },
  { rank: "Master", emoji: "💎", color: "#a855f7", attemptsNeeded: 100, solveRateNeeded: 0.9, avgTimeNeeded: 15000 },
];

export function calculatePatternRank(
  totalAttempts: number,
  solveRate: number,
  avgSolveTimeMs: number | null
): PatternRank {
  // Check from highest rank down
  for (let i = RANK_DEFINITIONS.length - 1; i >= 0; i--) {
    const def = RANK_DEFINITIONS[i];
    if (def.rank === "Unranked") return "Unranked";
    if (totalAttempts < def.attemptsNeeded) continue;
    if (solveRate < def.solveRateNeeded) continue;
    if (def.avgTimeNeeded !== null && (avgSolveTimeMs === null || avgSolveTimeMs > def.avgTimeNeeded)) continue;
    return def.rank;
  }
  return "Unranked";
}

export function getNextRankProgress(
  totalAttempts: number,
  solveRate: number,
  avgSolveTimeMs: number | null
): { nextRank: PatternRank; puzzlesNeeded: number; message: string } | null {
  const currentRank = calculatePatternRank(totalAttempts, solveRate, avgSolveTimeMs);
  const currentIndex = RANK_DEFINITIONS.findIndex((r) => r.rank === currentRank);
  const nextDef = RANK_DEFINITIONS[currentIndex + 1];
  if (!nextDef) return null;

  const attemptsNeeded = Math.max(0, nextDef.attemptsNeeded - totalAttempts);
  if (attemptsNeeded > 0) {
    return {
      nextRank: nextDef.rank,
      puzzlesNeeded: attemptsNeeded,
      message: `${attemptsNeeded} more puzzle${attemptsNeeded !== 1 ? "s" : ""} to ${nextDef.rank}`,
    };
  }

  // Enough attempts, check solve rate
  if (solveRate < nextDef.solveRateNeeded) {
    const needed = Math.ceil(nextDef.solveRateNeeded * 100);
    return {
      nextRank: nextDef.rank,
      puzzlesNeeded: 0,
      message: `Need ${needed}% solve rate for ${nextDef.rank}`,
    };
  }

  // Check speed
  if (nextDef.avgTimeNeeded !== null && (avgSolveTimeMs === null || avgSolveTimeMs > nextDef.avgTimeNeeded)) {
    const needed = nextDef.avgTimeNeeded / 1000;
    return {
      nextRank: nextDef.rank,
      puzzlesNeeded: 0,
      message: `Need avg <${needed}s for ${nextDef.rank}`,
    };
  }

  return null;
}

/**
 * Compute per-pattern stats from all SM-2 attempts.
 * Returns a map: patternTheme (uppercase) → stats
 */
export function getPatternSolveRates(
  attempts: PuzzleAttempt[]
): Map<string, { solveRate: number; totalAttempts: number; lastPracticed: string | null; duePuzzleIds: string[] }> {
  const themeAttempts = new Map<string, PuzzleAttempt[]>();

  for (const attempt of attempts) {
    if (!attempt.theme) continue;
    const theme = attempt.theme.toUpperCase();
    if (!themeAttempts.has(theme)) themeAttempts.set(theme, []);
    themeAttempts.get(theme)!.push(attempt);
  }

  const result = new Map<
    string,
    { solveRate: number; totalAttempts: number; lastPracticed: string | null; duePuzzleIds: string[] }
  >();

  for (const [theme, themeAtt] of themeAttempts.entries()) {
    const solvedFirstTry = themeAtt.filter(
      (a) => a.outcome === "solved-first-try"
    ).length;
    const solveRate = themeAtt.length > 0 ? solvedFirstTry / themeAtt.length : 0;
    const sorted = [...themeAtt].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
    const lastPracticed = sorted[0]?.timestamp ?? null;
    const duePuzzleIds = getDuePuzzles(themeAtt);

    result.set(theme, {
      solveRate,
      totalAttempts: themeAtt.length,
      lastPracticed,
      duePuzzleIds,
    });
  }

  return result;
}
