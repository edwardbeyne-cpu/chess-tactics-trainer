/**
 * Woodpecker training sets.
 *
 * Two kinds of fixed sets, cycled through repeatedly until every puzzle is
 * mastered (the Woodpecker Method):
 *
 *   speed        200 puzzles just above the current level. Mastered = a clean
 *                correct solve in under 10 seconds. Tracker distinguishes
 *                never-tried / missed / solved slow (>30s) / solved fast (<30s)
 *                / mastered (<10s).
 *   calculation  50 much harder, longer puzzles. Mastered = any clean correct
 *                solve, no time limit. Meant to be slow, deliberate work.
 *
 * Sets are sequential: finishing one archives it and the next one anchors to
 * a higher rating, so each 200 is harder than the last. Puzzles never repeat
 * across sets.
 */

import { Chess } from "chess.js";
import { getTacticsRatingData } from "@/lib/storage";

export type SetKind = "speed" | "calculation";

export type PuzzleStatus = "new" | "missed" | "slow" | "fast" | "mastered";

export interface WoodpeckerPuzzle {
  id: string;
  fen: string;          // player to move
  solution: string[];   // UCI, odd length, solution[0] is the player's move
  rating: number;
  theme: string;
  source: "lichess" | "own-game";
  attempts: number;
  solves: number;       // clean correct solves (no hint, not a retry)
  bestTimeMs: number | null;
  lastAttemptAt: number;
}

export interface WoodpeckerSet {
  id: string;
  kind: SetKind;
  setNumber: number;
  targetRating: number;
  ratingFloor: number;
  ratingCeiling: number;
  puzzles: WoodpeckerPuzzle[];
  cursor: number;       // next index to serve in sequential mode
  createdAt: number;
  completedAt: number | null;
}

interface WoodpeckerStore {
  version: 1;
  sets: WoodpeckerSet[];
  solvedByDay: Record<string, number>;
}

export const SPEED_SET_SIZE = 200;
export const CALC_SET_SIZE = 50;
export const MASTERY_MS = 10_000;
export const FAST_MS = 30_000;

const STORE_KEY = "ctt_woodpecker";

// ── Storage ─────────────────────────────────────────────────────────────────

function emptyStore(): WoodpeckerStore {
  return { version: 1, sets: [], solvedByDay: {} };
}

export function loadStore(): WoodpeckerStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as WoodpeckerStore;
    if (parsed?.version !== 1 || !Array.isArray(parsed.sets)) return emptyStore();
    return reconcile({ ...emptyStore(), ...parsed });
  } catch {
    return emptyStore();
  }
}

/** Self-heal derived state: a set with every puzzle mastered is complete. */
function reconcile(store: WoodpeckerStore): WoodpeckerStore {
  let changed = false;
  for (const set of store.sets) {
    if (!set.completedAt && set.puzzles.length > 0 && set.puzzles.every((p) => isMastered(p, set.kind))) {
      set.completedAt = Date.now();
      changed = true;
    }
  }
  if (changed) saveStore(store);
  return store;
}

export function saveStore(store: WoodpeckerStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch { /* quota */ }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function solvedToday(store: WoodpeckerStore): number {
  return store.solvedByDay[todayKey()] ?? 0;
}

// ── Status ──────────────────────────────────────────────────────────────────

export function puzzleStatus(p: WoodpeckerPuzzle, kind: SetKind): PuzzleStatus {
  if (p.attempts === 0) return "new";
  if (p.bestTimeMs === null) return "missed";
  if (kind === "calculation") return "mastered";
  if (p.bestTimeMs < MASTERY_MS) return "mastered";
  if (p.bestTimeMs < FAST_MS) return "fast";
  return "slow";
}

export function isMastered(p: WoodpeckerPuzzle, kind: SetKind): boolean {
  return puzzleStatus(p, kind) === "mastered";
}

export interface SetSummary {
  total: number;
  mastered: number;
  fast: number;
  slow: number;
  missed: number;
  fresh: number;
}

export function summarize(set: WoodpeckerSet): SetSummary {
  const s: SetSummary = { total: set.puzzles.length, mastered: 0, fast: 0, slow: 0, missed: 0, fresh: 0 };
  for (const p of set.puzzles) {
    const st = puzzleStatus(p, set.kind);
    if (st === "mastered") s.mastered++;
    else if (st === "fast") s.fast++;
    else if (st === "slow") s.slow++;
    else if (st === "missed") s.missed++;
    else s.fresh++;
  }
  return s;
}

// ── Sequencing ──────────────────────────────────────────────────────────────

/**
 * Next unmastered puzzle at or after the cursor, wrapping around. Returns -1
 * when every puzzle is mastered.
 */
export function nextIndex(set: WoodpeckerSet, from = set.cursor): number {
  const n = set.puzzles.length;
  if (n === 0) return -1;
  for (let step = 0; step < n; step++) {
    const i = (from + step) % n;
    if (!isMastered(set.puzzles[i], set.kind)) return i;
  }
  return -1;
}

export function activeSet(store: WoodpeckerStore, kind: SetKind): WoodpeckerSet | null {
  const live = store.sets.filter((s) => s.kind === kind && !s.completedAt);
  return live.length ? live[live.length - 1] : null;
}

export function setsOfKind(store: WoodpeckerStore, kind: SetKind): WoodpeckerSet[] {
  return store.sets.filter((s) => s.kind === kind).sort((a, b) => a.setNumber - b.setNumber);
}

// ── Recording ───────────────────────────────────────────────────────────────

export interface AttemptInput {
  setId: string;
  index: number;
  correct: boolean;
  usedHint: boolean;
  isRetry: boolean;
  solveTimeMs: number;
}

export interface AttemptOutcome {
  status: PuzzleStatus;
  previousStatus: PuzzleStatus;
  newlyMastered: boolean;
  setComplete: boolean;
  firstAttempt: boolean;
}

export function recordAttempt(store: WoodpeckerStore, a: AttemptInput): AttemptOutcome | null {
  const set = store.sets.find((s) => s.id === a.setId);
  if (!set) return null;
  const p = set.puzzles[a.index];
  if (!p) return null;

  const previousStatus = puzzleStatus(p, set.kind);
  const firstAttempt = p.attempts === 0;
  const wasMastered = previousStatus === "mastered";

  p.attempts += 1;
  p.lastAttemptAt = Date.now();

  if (!a.correct) {
    // A miss means you don't own it yet — reset the best time so it comes
    // back around in the cycle, even if it was mastered before.
    p.bestTimeMs = null;
  } else if (!a.usedHint && !a.isRetry) {
    p.solves += 1;
    if (p.bestTimeMs === null || a.solveTimeMs < p.bestTimeMs) {
      p.bestTimeMs = a.solveTimeMs;
    }
    const day = todayKey();
    store.solvedByDay[day] = (store.solvedByDay[day] ?? 0) + 1;
  }
  // hint-solve / retry-solve: attempt counted, nothing else changes

  set.cursor = (a.index + 1) % set.puzzles.length;

  const status = puzzleStatus(p, set.kind);
  const newlyMastered = status === "mastered" && !wasMastered;
  const setComplete = set.puzzles.every((q) => isMastered(q, set.kind));
  if (setComplete && !set.completedAt) set.completedAt = Date.now();

  saveStore(store);
  return { status, previousStatus, newlyMastered, setComplete, firstAttempt };
}

/** Move the sequential cursor past `index` without recording an attempt. */
export function skipPuzzle(store: WoodpeckerStore, setId: string, index: number): void {
  const set = store.sets.find((s) => s.id === setId);
  if (!set || set.puzzles.length === 0) return;
  set.cursor = (index + 1) % set.puzzles.length;
  saveStore(store);
}

// ── Generation ──────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Lichess convention: fen is BEFORE the opponent's setup move (moves[0]).
function applyFirstMove(fen: string, moves: string[]): { fen: string; solution: string[] } | null {
  if (!moves || moves.length < 2) return null;
  try {
    const chess = new Chess(fen);
    const opp = moves[0];
    chess.move({ from: opp.slice(0, 2), to: opp.slice(2, 4), promotion: opp[4] || undefined });
    const solution = moves.slice(1);
    // Solutions must end on the player's move (odd length)
    if (solution.length % 2 === 0) solution.pop();
    if (solution.length === 0) return null;
    return { fen: chess.fen(), solution };
  } catch {
    return null;
  }
}

function usedIdsAcrossAllSets(store: WoodpeckerStore): Set<string> {
  const ids = new Set<string>();
  for (const s of store.sets) for (const p of s.puzzles) ids.add(p.id);
  return ids;
}

function weaknessThemes(): string[] {
  // Labels from the engine motif classifier → cache theme keys
  const map: Record<string, string> = {
    "Fork": "fork", "Pin": "pin", "Skewer": "skewer",
    "Discovered Attacks": "discoveredAttack", "Discovered Checks": "discoveredCheck",
    "Back Rank Mates": "backRankMate", "Smothered Mates": "smotheredMate",
    "Checkmates": "backRankMate", "Winning Captures": "fork", "Checks": "fork",
  };
  try {
    const raw = localStorage.getItem("ctt_game_analysis");
    if (!raw) return [];
    const ga = JSON.parse(raw) as { weaknesses?: Array<{ pattern: string }> };
    return Array.from(new Set((ga.weaknesses ?? []).map((w) => map[w.pattern]).filter(Boolean)));
  } catch {
    return [];
  }
}

function makePuzzle(
  id: string, fen: string, solution: string[], rating: number, theme: string, source: WoodpeckerPuzzle["source"]
): WoodpeckerPuzzle {
  return { id, fen, solution, rating, theme, source, attempts: 0, solves: 0, bestTimeMs: null, lastAttemptAt: 0 };
}

interface CachedPuzzle { id: string; fen: string; moves: string[]; rating: number; themes: string[] }

async function loadCache(): Promise<Record<string, CachedPuzzle[]>> {
  const { cachedPuzzlesByTheme } = await import("@/data/lichess-puzzles");
  return cachedPuzzlesByTheme as Record<string, CachedPuzzle[]>;
}

/**
 * Pull `count` puzzles from the cache inside [floor, ceiling], weighting the
 * user's weak themes, never repeating an id in `used`. Widens the band if the
 * pool runs short. Returns them sorted ascending by rating.
 */
function pickFromCache(
  cache: Record<string, CachedPuzzle[]>,
  count: number,
  floor: number,
  ceiling: number,
  used: Set<string>,
  opts: { weakThemes: string[]; weakShare: number; minMoves: number }
): WoodpeckerPuzzle[] {
  const out: WoodpeckerPuzzle[] = [];
  const seen = new Set<string>(used);
  const themes = Object.keys(cache);

  const eligible = (theme: string, lo: number, hi: number, minMoves: number) =>
    (cache[theme] ?? []).filter(
      (p) => p.rating >= lo && p.rating <= hi && !seen.has(p.id) && p.moves.length >= minMoves
    );

  const take = (fromThemes: string[], n: number, lo: number, hi: number, minMoves: number) => {
    if (n <= 0 || fromThemes.length === 0) return;
    // Round-robin across themes so no single theme dominates
    const pools = fromThemes.map((t) => shuffle(eligible(t, lo, hi, minMoves)));
    let added = 0;
    let idle = 0;
    while (added < n && idle < pools.length) {
      let progressed = false;
      for (const pool of pools) {
        if (added >= n) break;
        const raw = pool.pop();
        if (!raw) continue;
        if (seen.has(raw.id)) continue;
        const applied = applyFirstMove(raw.fen, raw.moves);
        if (!applied) continue;
        seen.add(raw.id);
        const theme = raw.themes.find((t) => themes.includes(t)) ?? fromThemes[0];
        out.push(makePuzzle(raw.id, applied.fen, applied.solution, raw.rating, theme, "lichess"));
        added++;
        progressed = true;
      }
      idle = progressed ? 0 : idle + 1;
    }
  };

  const weak = opts.weakThemes.filter((t) => themes.includes(t));
  const spread = themes.filter((t) => !weak.includes(t));

  // Pass 1: strict band, strict length
  const weakTarget = weak.length ? Math.round(count * opts.weakShare) : 0;
  take(weak, weakTarget, floor, ceiling, opts.minMoves);
  take(spread.length ? spread : themes, count - out.length, floor, ceiling, opts.minMoves);

  // Pass 2: widen band ±100 if short
  if (out.length < count) take(themes, count - out.length, floor - 100, ceiling + 100, opts.minMoves);
  // Pass 3: relax move-length requirement
  if (out.length < count && opts.minMoves > 2) take(themes, count - out.length, floor - 100, ceiling + 100, 2);
  // Pass 4: anything not yet used, widest band
  if (out.length < count) take(themes, count - out.length, floor - 300, ceiling + 300, 2);

  return out.sort((a, b) => a.rating - b.rating);
}

function ownGamePuzzles(used: Set<string>, max: number): WoodpeckerPuzzle[] {
  try {
    const raw = localStorage.getItem("ctt_custom_puzzles_generated");
    if (!raw) return [];
    const gen = JSON.parse(raw) as Array<{ id: string; fen: string; moves: string[]; rating?: number; pattern?: string }>;
    const out: WoodpeckerPuzzle[] = [];
    for (const g of gen ?? []) {
      if (out.length >= max) break;
      if (!g?.id || !g.fen || !Array.isArray(g.moves) || g.moves.length === 0) continue;
      const id = `own_${g.id}`;
      if (used.has(id)) continue;
      const solution = g.moves.length % 2 === 0 ? g.moves.slice(0, -1) : g.moves;
      if (solution.length === 0) continue;
      out.push(makePuzzle(id, g.fen, solution, g.rating ?? 1500, (g.pattern ?? "own game").toLowerCase(), "own-game"));
    }
    return out;
  } catch {
    return [];
  }
}

function anchorRating(store: WoodpeckerStore, kind: SetKind): number {
  const live = getTacticsRatingData().tacticsRating || 1200;
  const prior = setsOfKind(store, kind);
  const last = prior[prior.length - 1];
  // Each set is at least 100 above the last, and never below the live rating.
  return last ? Math.max(live, last.targetRating + 100) : live;
}

export async function generateSet(store: WoodpeckerStore, kind: SetKind): Promise<WoodpeckerSet> {
  const cache = await loadCache();
  const used = usedIdsAcrossAllSets(store);
  const setNumber = setsOfKind(store, kind).length + 1;
  const target = Math.round(anchorRating(store, kind));

  let puzzles: WoodpeckerPuzzle[];
  let floor: number;
  let ceiling: number;

  if (kind === "speed") {
    // Just above the current level.
    floor = target;
    ceiling = target + 200;
    const own = ownGamePuzzles(used, 20);
    for (const p of own) used.add(p.id);
    const fromCache = pickFromCache(cache, SPEED_SET_SIZE - own.length, floor, ceiling, used, {
      weakThemes: weaknessThemes(),
      weakShare: 0.5,
      minMoves: 2,
    });
    // Own-game positions first (they're the reason this app exists), then the
    // cache puzzles in ascending difficulty.
    puzzles = [...own, ...fromCache];
  } else {
    // Much harder, and longer: prefer lines with 3+ player moves.
    floor = target + 400;
    ceiling = target + 700;
    puzzles = pickFromCache(cache, CALC_SET_SIZE, floor, ceiling, used, {
      weakThemes: [],
      weakShare: 0,
      minMoves: 6,
    });
  }

  const set: WoodpeckerSet = {
    id: `${kind}_${setNumber}_${Date.now().toString(36)}`,
    kind,
    setNumber,
    targetRating: target,
    ratingFloor: floor,
    ratingCeiling: ceiling,
    puzzles,
    cursor: 0,
    createdAt: Date.now(),
    completedAt: null,
  };
  store.sets.push(set);
  saveStore(store);
  return set;
}

/**
 * First-run only: build the initial set of each kind. When a set is finished
 * we deliberately do NOT auto-roll — the user starts the next one from the
 * completion screen so the milestone is visible.
 */
export async function ensureActiveSets(store: WoodpeckerStore): Promise<WoodpeckerStore> {
  if (setsOfKind(store, "speed").length === 0) await generateSet(store, "speed");
  if (setsOfKind(store, "calculation").length === 0) await generateSet(store, "calculation");
  return store;
}

/** The set to show by default: the live one, else the most recent. */
export function defaultSet(store: WoodpeckerStore, kind: SetKind): WoodpeckerSet | null {
  const live = activeSet(store, kind);
  if (live) return live;
  const all = setsOfKind(store, kind);
  return all.length ? all[all.length - 1] : null;
}
