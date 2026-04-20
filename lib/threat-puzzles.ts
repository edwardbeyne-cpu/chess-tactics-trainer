import { safeSetItem } from "@/lib/safe-storage";
import { Chess } from "chess.js";
import type { LichessCachedPuzzle } from "@/data/lichess-puzzles";
import { getTacticsRatingData } from "@/lib/storage";
import { THREAT_DETECTION_GAMES_KEY } from "@/lib/game-analysis";
import type { GameThreatPuzzle } from "@/lib/game-analysis";

export const THREAT_DETECTION_PROGRESS_KEY = "ctt_threat_detection_progress";
const CORE_THEMES = ["fork", "pin", "skewer"];

export const THREAT_LABELS: Record<string, string> = {
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
};

export interface ThreatPuzzle {
  id: string;
  sourcePuzzleId: string;
  threatType: string;
  attackerMove: string;       // moves[0] — the blunder the defender played in the puzzle
  tacticMove: string;         // moves[1] — the tactic the opponent plays if you blunder
  fen: string;                // position BEFORE the blunder — this is what the user sees
  defenderFen: string;        // position AFTER the blunder (for reference/analysis)
  rating: number;
  themes: string[];
  orientation: "white" | "black";  // defender's perspective
  acceptableDefenseMoves: string[];
}

export interface ThreatDetectionSessionSummary {
  completedAt: string;
  identifiedCorrect: number;
  defendedCorrect: number;
  total: number;
  avgSolveTimeMs?: number;
}

export interface ThreatDetectionProgress {
  sessionsPlayed: number;
  totalThreatsSeen: number;
  threatIdCorrect: number;
  defenseCorrect: number;
  byPattern: Record<string, { seen: number; identified: number; defended: number }>;
  lastSession?: ThreatDetectionSessionSummary;
  sessionHistory?: ThreatDetectionSessionSummary[];
}

const EMPTY_PROGRESS: ThreatDetectionProgress = {
  sessionsPlayed: 0,
  totalThreatsSeen: 0,
  threatIdCorrect: 0,
  defenseCorrect: 0,
  byPattern: {},
  sessionHistory: [],
};

export function loadThreatDetectionProgress(): ThreatDetectionProgress {
  if (typeof window === "undefined") return { ...EMPTY_PROGRESS };
  try {
    const parsed = JSON.parse(localStorage.getItem(THREAT_DETECTION_PROGRESS_KEY) || "null");
    if (!parsed) return { ...EMPTY_PROGRESS };
    return { ...EMPTY_PROGRESS, ...parsed, sessionHistory: parsed.sessionHistory || [] };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

export function saveThreatDetectionProgress(progress: ThreatDetectionProgress) {
  if (typeof window === "undefined") return;
  safeSetItem(THREAT_DETECTION_PROGRESS_KEY, JSON.stringify(progress));
}

function normalizeTheme(themes: string[]): string {
  const direct = CORE_THEMES.find((theme) => themes.includes(theme));
  if (direct) return direct;
  return themes.find((t) => !["short", "long", "middlegame", "endgame", "opening", "master", "mate", "mateIn1", "mateIn2", "mateIn3", "advantage", "crushing", "equality", "sacrifice"].includes(t)) || themes[0] || "fork";
}

/**
 * NEW APPROACH: Pre-blunder defensive puzzles.
 *
 * Lichess puzzle structure:
 *   FEN → moves[0] (the blunder/setup) → moves[1] (the tactic) → ...
 *
 * We show the FEN directly — the position BEFORE the blunder.
 * In the FEN, it's the defender's turn (they're about to blunder with moves[0]).
 * The user must find a move that PREVENTS the upcoming tactic (moves[1]).
 *
 * Validation: after the user's move, check if the opponent can still play the tactic.
 * If the tactic is gone → correct. If it still works → incorrect.
 */
function buildThreatPuzzle(raw: LichessCachedPuzzle): ThreatPuzzle | null {
  if (!raw.moves || raw.moves.length < 2) return null;
  const blunderMove = raw.moves[0]; // the move that allows the tactic
  const tacticMove = raw.moves[1];  // the tactic itself (fork/pin/skewer)
  if (!blunderMove || !tacticMove) return null;

  const chess = new Chess(raw.fen);
  const defenderSide = chess.turn(); // side to move in FEN = the one about to blunder

  // Play the blunder to get the post-blunder position (for reference)
  try {
    chess.move({ from: blunderMove.slice(0, 2), to: blunderMove.slice(2, 4), promotion: blunderMove[4] });
  } catch {
    return null;
  }
  const defenderFen = chess.fen();

  // Verify the tactic actually works after the blunder
  try {
    const tacticTest = new Chess(defenderFen);
    tacticTest.move({ from: tacticMove.slice(0, 2), to: tacticMove.slice(2, 4), promotion: tacticMove[4] });
  } catch {
    return null; // tactic doesn't actually work — skip
  }

  const orientation = defenderSide === "w" ? "white" : "black";
  return {
    id: `threat-${raw.id}`,
    sourcePuzzleId: raw.id,
    threatType: normalizeTheme(raw.themes),
    attackerMove: blunderMove,
    tacticMove,
    fen: raw.fen,          // pre-blunder position — what the user sees
    defenderFen,           // post-blunder position — for analysis
    rating: raw.rating,
    themes: raw.themes,
    orientation,
    acceptableDefenseMoves: [], // no fixed answer — validated dynamically
  };
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadGameThreatPuzzles(): GameThreatPuzzle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(THREAT_DETECTION_GAMES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GameThreatPuzzle[];
  } catch {
    return [];
  }
}

function gamePuzzleToThreatPuzzle(g: GameThreatPuzzle): ThreatPuzzle {
  return {
    id: g.id,
    sourcePuzzleId: g.id,
    threatType: g.threatType,
    attackerMove: g.attackerMove,
    tacticMove: g.attackerMove, // for game puzzles, the attackerMove IS the tactic
    fen: g.fen,
    defenderFen: g.defenderFen,
    rating: g.rating ?? 1200,
    themes: [g.threatType],
    orientation: g.orientation,
    acceptableDefenseMoves: g.acceptableDefenseMoves,
  };
}

export function hasGameThreatPuzzles(): boolean {
  return loadGameThreatPuzzles().length > 0;
}

export async function buildThreatDetectionSession(count = 10): Promise<ThreatPuzzle[]> {
  // Use the same calibrated tactics rating as the rest of the app
  const rating = getTacticsRatingData().tacticsRating || 800;

  // Use Lichess puzzles with the pre-blunder approach:
  // Show the position BEFORE the blunder, user must find a move that prevents the tactic.
  const { cachedPuzzlesByTheme } = await import("@/data/lichess-puzzles");

  // Try progressively wider rating windows until we have enough puzzles
  for (const ratingWindow of [250, 400, 600, 99999]) {
    const pool: ThreatPuzzle[] = [];
    for (const theme of CORE_THEMES) {
      const candidates = cachedPuzzlesByTheme[theme] || [];
      for (const raw of candidates) {
        if (Math.abs(raw.rating - rating) > ratingWindow) continue;
        const threat = buildThreatPuzzle(raw);
        if (threat) pool.push(threat);
        if (pool.length >= count * 4) break;
      }
    }
    if (pool.length >= count) return shuffle(pool).slice(0, count);
  }

  return [];
}

// ── Stockfish-powered defense evaluation ──────────────────────────────────

let sfWorker: Worker | null = null;

function initStockfish(): Promise<Worker> {
  return new Promise((resolve, reject) => {
    if (sfWorker) { resolve(sfWorker); return; }
    try {
      const w = new Worker("/stockfish/stockfish-18-lite-single.js");
      let ready = false;
      w.onmessage = (e) => {
        const msg = String(e.data);
        if (msg.includes("readyok") && !ready) {
          ready = true;
          resolve(w);
        }
      };
      w.postMessage("uci");
      w.postMessage("setoption name Threads value 1");
      w.postMessage("setoption name Hash value 16");
      w.postMessage("isready");
      sfWorker = w;
      setTimeout(() => { if (!ready) reject(new Error("Stockfish timeout")); }, 8000);
    } catch (err) {
      reject(err);
    }
  });
}

function analyzePosition(worker: Worker, fen: string, depth = 12): Promise<number | null> {
  return new Promise((resolve) => {
    let bestScore: number | null = null;
    let settled = false;
    const finish = (score: number | null) => {
      if (settled) return;
      settled = true;
      worker.removeEventListener("message", handler);
      resolve(score);
    };
    const handler = (e: MessageEvent) => {
      const msg = String(e.data);
      if (msg.startsWith("info") && msg.includes(" score ")) {
        const mateMatch = msg.match(/score mate (-?\d+)/);
        const cpMatch = msg.match(/score cp (-?\d+)/);
        if (mateMatch) {
          const m = parseInt(mateMatch[1]);
          bestScore = m > 0 ? 100000 - m : -100000 + Math.abs(m);
        } else if (cpMatch) {
          bestScore = parseInt(cpMatch[1]);
        }
      }
      if (msg.startsWith("bestmove")) {
        finish(bestScore);
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage("ucinewgame");
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage(`go depth ${depth}`);
    // Safety timeout — resolve with whatever we have after 5s
    setTimeout(() => finish(bestScore), 5000);
  });
}

export async function evaluateThreatDefenseMove(
  puzzle: ThreatPuzzle,
  moveUci: string
): Promise<{ correct: boolean; explanation: string }> {
  const threatLabel = THREAT_LABELS[puzzle.threatType] || puzzle.threatType;

  // If acceptableDefenseMoves are set (game-derived puzzles), check exact match + Stockfish
  if (puzzle.acceptableDefenseMoves.length > 0 && puzzle.acceptableDefenseMoves.includes(moveUci)) {
    return {
      correct: true,
      explanation: `Correct — this move prevents the ${threatLabel}.`,
    };
  }

  // --- Pre-blunder approach (Lichess puzzles) ---
  // 1. Play the user's move from the pre-blunder FEN
  // 2. Check if the opponent can still execute the tactic
  // 3. Also use Stockfish to ensure the move isn't a blunder itself

  // Step 1: user played the SAME move as the blunder → always wrong
  if (moveUci === puzzle.attackerMove) {
    return {
      correct: false,
      explanation: `That's the move that allows the ${threatLabel}! Your opponent plays ${puzzle.tacticMove} next.`,
    };
  }

  // Step 2: play user's move, then check if the tactic still works
  let afterUserFen: string;
  try {
    const chess = new Chess(puzzle.fen);
    chess.move({ from: moveUci.slice(0, 2), to: moveUci.slice(2, 4), promotion: moveUci.length === 5 ? moveUci[4] : undefined });
    afterUserFen = chess.fen();
  } catch {
    return { correct: false, explanation: "Invalid move." };
  }

  // Check if the tactic move is still legal AND still effective after user's different move
  let tacticStillWorks = false;
  try {
    const tacticTest = new Chess(afterUserFen);
    tacticTest.move({ from: puzzle.tacticMove.slice(0, 2), to: puzzle.tacticMove.slice(2, 4), promotion: puzzle.tacticMove.length === 5 ? puzzle.tacticMove[4] : undefined });
    tacticStillWorks = true;
  } catch {
    tacticStillWorks = false; // tactic move is no longer legal → user prevented it!
  }

  if (!tacticStillWorks) {
    // The tactic is gone! The user prevented it.
    return {
      correct: true,
      explanation: `Nice! Your move prevents the ${threatLabel}. The opponent can no longer play ${puzzle.tacticMove}.`,
    };
  }

  // Tactic move is still legal — but does it still win material / create the same threat?
  // Use Stockfish to compare: position after user's move vs position after the known blunder
  const stockfishResult = await Promise.race([
    (async () => {
      try {
        const worker = await initStockfish();

        // Eval after user's move (from attacker's perspective)
        const userEval = await analyzePosition(worker, afterUserFen, 12);

        // Eval after the known blunder (from attacker's perspective)
        const blunderEval = await analyzePosition(worker, puzzle.defenderFen, 12);

        if (userEval !== null && blunderEval !== null) {
          // If user's move gives attacker LESS advantage than the blunder → it's an improvement
          if (blunderEval - userEval >= 100) {
            return "better"; // user's move is significantly better than the blunder
          }
        }
        return "same"; // tactic still works about as well
      } catch {
        return "unknown";
      }
    })(),
    new Promise<"unknown">((resolve) => setTimeout(() => resolve("unknown"), 12000)),
  ]);

  if (stockfishResult === "better") {
    return {
      correct: true,
      explanation: `Good defense! The ${threatLabel} move is still on the board but it's much less effective after your move.`,
    };
  }

  return {
    correct: false,
    explanation: `Your opponent can still play the ${threatLabel}. Try a move that takes away the tactical shot.`,
  };
}

export function recordThreatDetectionSession(
  result: ThreatDetectionSessionSummary,
  puzzles: ThreatPuzzle[],
  identifiedCorrectFlags: boolean[],
  defenseCorrectFlags: boolean[]
) {
  const progress = loadThreatDetectionProgress();
  const history = [...(progress.sessionHistory || []), result].slice(-20);

  const next: ThreatDetectionProgress = {
    ...progress,
    sessionsPlayed: progress.sessionsPlayed + 1,
    totalThreatsSeen: progress.totalThreatsSeen + result.total,
    threatIdCorrect: progress.threatIdCorrect + result.identifiedCorrect,
    defenseCorrect: progress.defenseCorrect + result.defendedCorrect,
    byPattern: { ...progress.byPattern },
    lastSession: result,
    sessionHistory: history,
  };

  puzzles.forEach((puzzle, idx) => {
    const bucket = next.byPattern[puzzle.threatType] || { seen: 0, identified: 0, defended: 0 };
    bucket.seen += 1;
    if (identifiedCorrectFlags[idx]) bucket.identified += 1;
    if (defenseCorrectFlags[idx]) bucket.defended += 1;
    next.byPattern[puzzle.threatType] = bucket;
  });

  saveThreatDetectionProgress(next);
}
