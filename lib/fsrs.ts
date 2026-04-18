/**
 * FSRS (Free Spaced Repetition Scheduler) — simplified implementation.
 *
 * Each puzzle has a memory state {stability, difficulty, dueDate, lastReview, state}.
 * - stability (days): time for retrievability to decay from 100% → 90%
 * - difficulty (1–10): inherent difficulty of the card for this user
 * - retrievability: probability of correct recall at time t since lastReview
 *
 * On each attempt the user (implicitly) provides a grade 1–4:
 *   1 = Forgot (wrong)
 *   2 = Hard   (correct but slow / not under mastery threshold)
 *   3 = Good   (correct under mastery threshold)
 *   4 = Easy   (correct very fast)
 *
 * Selection uses retrievability + a 70/20/10 mix:
 *   70% due puzzles (R approaching desired retention 0.9)
 *   20% new puzzles (never attempted)
 *   10% edge-of-ability (highest difficulty unsolved)
 */

export interface FSRSState {
  stability: number;        // days
  difficulty: number;       // 1–10
  lastReview: number;       // ms epoch; 0 = never
  dueDate: number;          // ms epoch; 0 = due immediately (new card)
  state: "new" | "learning" | "review" | "relearning";
  reps: number;             // total attempts since last failure
  lapses: number;           // total failures
}

export type FSRSGrade = 1 | 2 | 3 | 4;

// FSRS-inspired constants (simplified). Tuned for chess tactics, not flashcards:
// chess solves are quicker than card reviews and we want shorter intervals.
const W = {
  initialStabilityByGrade: [0, 0.4, 1.2, 3.0, 7.0], // index by grade 1-4
  initialDifficulty: 5.5,
  difficultyDelta: 0.6,        // how much grade pushes difficulty
  difficultyMean: 5.0,         // mean reverts toward this
  difficultyMeanReversion: 0.05,
  stabilityFactorBase: 1.6,    // base growth multiplier on success
  stabilityFactorEasy: 1.4,    // bonus multiplier when grade=4
  stabilityFactorHard: 0.75,   // penalty multiplier when grade=2
  stabilityRetrievabilityBoost: 2.5, // higher retrievability at review = more stability gain
  lapseStability: 0.4,         // stability after a lapse (days)
  fuzz: 0.05,                  // ±5% interval randomization
} as const;

const DESIRED_RETENTION = 0.9;
const DECAY = -0.5;            // forgetting curve exponent
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 19/81

const MS_PER_DAY = 86_400_000;

export function defaultFSRSState(): FSRSState {
  return {
    stability: 0,
    difficulty: W.initialDifficulty,
    lastReview: 0,
    dueDate: 0,
    state: "new",
    reps: 0,
    lapses: 0,
  };
}

/** Probability of correct recall right now for a card. */
export function retrievability(state: FSRSState, now: number = Date.now()): number {
  if (state.state === "new" || state.lastReview === 0 || state.stability === 0) return 0;
  const daysSince = (now - state.lastReview) / MS_PER_DAY;
  return Math.pow(1 + (FACTOR * daysSince) / state.stability, DECAY);
}

/** Days until the card reaches DESIRED_RETENTION given new stability. */
function intervalDaysFor(stability: number): number {
  if (stability <= 0) return 0;
  const days = (stability / FACTOR) * (Math.pow(DESIRED_RETENTION, 1 / DECAY) - 1);
  // Apply fuzz to prevent review bunching
  const fuzz = 1 + (Math.random() * 2 - 1) * W.fuzz;
  return Math.max(1 / 1440, days * fuzz); // floor 1 minute
}

/** Update difficulty toward grade; mean-reverts toward 5.0 to prevent runaway values. */
function nextDifficulty(prev: number, grade: FSRSGrade): number {
  // grade 3 = no change, 4 reduces difficulty, 1-2 increases it
  const delta = -W.difficultyDelta * (grade - 3);
  const updated = prev + delta;
  // mean reversion
  const reverted = updated + W.difficultyMeanReversion * (W.difficultyMean - updated);
  return Math.max(1, Math.min(10, reverted));
}

/** Update stability after a successful review. */
function nextStability(prev: FSRSState, grade: FSRSGrade, now: number): number {
  if (prev.state === "new" || prev.stability === 0) {
    return W.initialStabilityByGrade[grade];
  }
  const r = retrievability(prev, now);
  // Higher difficulty → smaller gain. Higher retrievability gap → bigger gain.
  const difficultyFactor = (11 - prev.difficulty) / 10;
  const retrievabilityFactor = Math.exp(W.stabilityRetrievabilityBoost * (1 - r));
  let gradeFactor = 1.0;
  if (grade === 4) gradeFactor = W.stabilityFactorEasy;
  else if (grade === 2) gradeFactor = W.stabilityFactorHard;
  const multiplier = 1 + W.stabilityFactorBase * difficultyFactor * retrievabilityFactor * gradeFactor;
  return prev.stability * multiplier;
}

/**
 * Apply a grade to a card. Returns the new state.
 * Pure function — does not mutate input.
 */
export function reviewCard(prev: FSRSState, grade: FSRSGrade, now: number = Date.now()): FSRSState {
  const next: FSRSState = { ...prev };
  next.lastReview = now;
  next.difficulty = nextDifficulty(prev.difficulty, grade);

  if (grade === 1) {
    // Lapse
    next.stability = W.lapseStability;
    next.state = "relearning";
    next.lapses = prev.lapses + 1;
    next.reps = 0;
  } else {
    next.stability = nextStability(prev, grade, now);
    next.state = prev.state === "new" ? "learning" : "review";
    next.reps = prev.reps + 1;
  }

  const intervalDays = intervalDaysFor(next.stability);
  next.dueDate = now + intervalDays * MS_PER_DAY;
  return next;
}

/**
 * Translate a chess solve outcome into an FSRS grade.
 * - wrong → 1 (Forgot / lapse)
 * - correct, very fast (<5s) → 4 (Easy)
 * - correct, mastery-fast (<10s) → 3 (Good)
 * - correct, slow → 2 (Hard)
 */
export function solveToGrade(correct: boolean, solveTimeMs: number): FSRSGrade {
  if (!correct) return 1;
  if (solveTimeMs < 5000) return 4;
  if (solveTimeMs < 10000) return 3;
  return 2;
}

/** Migrate legacy MasteryPuzzle (no FSRS field) → reasonable initial FSRS state. */
export function inferFSRSFromLegacy(legacy: {
  masteryHits: number;
  attempts: number;
  correctAttempts: number;
  avgSolveTime: number;
  lastAttemptAt: number;
}): FSRSState {
  if (legacy.attempts === 0) return defaultFSRSState();
  const accuracy = legacy.correctAttempts / Math.max(1, legacy.attempts);
  // Heuristic: accuracy and mastery hits → initial difficulty/stability
  const difficulty = Math.max(1, Math.min(10, 8 - accuracy * 5));
  // Mastered puzzles get longer stability
  const stability =
    legacy.masteryHits >= 3 ? 14 :
    legacy.masteryHits === 2 ? 5 :
    legacy.masteryHits === 1 ? 1.5 :
    accuracy > 0.5 ? 0.5 : 0;
  const state: FSRSState["state"] =
    legacy.masteryHits >= 3 ? "review" :
    legacy.attempts > 0 ? "learning" :
    "new";
  const lastReview = legacy.lastAttemptAt || 0;
  const dueDate = lastReview > 0 ? lastReview + intervalDaysFor(stability) * MS_PER_DAY : 0;
  return {
    stability,
    difficulty,
    lastReview,
    dueDate,
    state,
    reps: legacy.correctAttempts,
    lapses: Math.max(0, legacy.attempts - legacy.correctAttempts),
  };
}

/** Selection bucket for the smart feed mix. */
export type FeedBucket = "due" | "new" | "edge";

/**
 * Pick the next puzzle from a candidate pool using FSRS + 70/20/10 mix.
 *
 * Returns the index in the input array, or -1 if no candidates.
 */
export function pickFromFeed<T>(
  pool: { item: T; fsrs: FSRSState; difficulty?: number; mastered?: boolean }[],
  opts: { now?: number; bucketWeights?: { due: number; new: number; edge: number } } = {}
): { index: number; bucket: FeedBucket } | null {
  const now = opts.now ?? Date.now();
  const weights = opts.bucketWeights ?? { due: 0.7, new: 0.2, edge: 0.1 };

  const live = pool.map((p, i) => ({ ...p, _i: i })).filter((p) => !p.mastered);
  if (live.length === 0) return null;

  // Bucket assignment
  const dueBucket = live.filter((p) => p.fsrs.state !== "new" && p.fsrs.dueDate <= now);
  const newBucket = live.filter((p) => p.fsrs.state === "new");
  // Edge = highest difficulty among non-new, non-due
  const restBucket = live.filter((p) => p.fsrs.state !== "new" && p.fsrs.dueDate > now);
  const edgeBucket = restBucket
    .slice()
    .sort((a, b) => (b.difficulty ?? b.fsrs.difficulty) - (a.difficulty ?? a.fsrs.difficulty))
    .slice(0, Math.max(1, Math.ceil(restBucket.length * 0.2)));

  // Weighted random bucket choice, but fall back if a bucket is empty
  const buckets = (
    [
      { name: "due" as FeedBucket, weight: weights.due, pool: dueBucket },
      { name: "new" as FeedBucket, weight: weights.new, pool: newBucket },
      { name: "edge" as FeedBucket, weight: weights.edge, pool: edgeBucket },
    ] satisfies { name: FeedBucket; weight: number; pool: typeof live }[]
  ).filter((b) => b.pool.length > 0);

  if (buckets.length === 0) {
    // Nothing due, no new, no edge — pick the soonest-due card
    const soonest = live.slice().sort((a, b) => a.fsrs.dueDate - b.fsrs.dueDate)[0];
    return { index: soonest._i, bucket: "due" };
  }

  const totalWeight = buckets.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * totalWeight;
  let chosen = buckets[0];
  for (const b of buckets) {
    if (r < b.weight) { chosen = b; break; }
    r -= b.weight;
  }

  // Within bucket: pick most overdue (due bucket) or random (new/edge)
  if (chosen.name === "due") {
    const sorted = chosen.pool.slice().sort((a, b) => a.fsrs.dueDate - b.fsrs.dueDate);
    return { index: sorted[0]._i, bucket: chosen.name };
  }
  const pick = chosen.pool[Math.floor(Math.random() * chosen.pool.length)];
  return { index: pick._i, bucket: chosen.name };
}
