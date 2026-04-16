import { Chess } from "chess.js";
import { cachedPuzzlesByTheme, type LichessCachedPuzzle } from "@/data/lichess-puzzles";
import { getTacticsRatingData } from "@/lib/storage";

export const THREAT_DETECTION_PROGRESS_KEY = "ctt_threat_detection_progress";
const CORE_THEMES = ["fork", "pin", "discoveredAttack", "backRankMate"];

export interface ThreatPuzzle {
  id: string;
  sourcePuzzleId: string;
  threatType: string;
  attackerMove: string;
  fen: string;
  defenderFen: string;
  rating: number;
  themes: string[];
  orientation: "white" | "black";
  acceptableDefenseMoves: string[];
}

export interface ThreatDetectionSessionSummary {
  completedAt: string;
  identifiedCorrect: number;
  defendedCorrect: number;
  total: number;
}

export interface ThreatDetectionProgress {
  sessionsPlayed: number;
  totalThreatsSeen: number;
  threatIdCorrect: number;
  defenseCorrect: number;
  byPattern: Record<string, { seen: number; identified: number; defended: number }>;
  lastSession?: ThreatDetectionSessionSummary;
}

export function loadThreatDetectionProgress(): ThreatDetectionProgress {
  if (typeof window === "undefined") {
    return { sessionsPlayed: 0, totalThreatsSeen: 0, threatIdCorrect: 0, defenseCorrect: 0, byPattern: {} };
  }
  try {
    return JSON.parse(localStorage.getItem(THREAT_DETECTION_PROGRESS_KEY) || "null") || { sessionsPlayed: 0, totalThreatsSeen: 0, threatIdCorrect: 0, defenseCorrect: 0, byPattern: {} };
  } catch {
    return { sessionsPlayed: 0, totalThreatsSeen: 0, threatIdCorrect: 0, defenseCorrect: 0, byPattern: {} };
  }
}

export function saveThreatDetectionProgress(progress: ThreatDetectionProgress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THREAT_DETECTION_PROGRESS_KEY, JSON.stringify(progress));
}

function toggleFenTurn(fen: string): string {
  const parts = fen.split(" ");
  if (parts.length < 2) return fen;
  parts[1] = parts[1] === "w" ? "b" : "w";
  return parts.join(" ");
}

function normalizeTheme(themes: string[]): string {
  const direct = CORE_THEMES.find((theme) => themes.includes(theme));
  if (direct) return direct;
  return themes.find((t) => !["short", "long", "middlegame", "endgame", "opening", "master", "mate", "advantage", "crushing", "equality", "sacrifice"].includes(t)) || themes[0] || "fork";
}

function buildThreatPuzzle(raw: LichessCachedPuzzle): ThreatPuzzle | null {
  const attackerMove = raw.moves[0];
  if (!attackerMove) return null;

  const defenderFen = toggleFenTurn(raw.fen);
  const defenderChess = new Chess(defenderFen);
  const legal = defenderChess.moves({ verbose: true });
  if (!legal.length) return null;

  const acceptableDefenseMoves = legal
    .map((move) => `${move.from}${move.to}${move.promotion || ""}`)
    .filter((uci) => {
      const defenseBoard = new Chess(defenderFen);
      try {
        defenseBoard.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      } catch {
        return false;
      }
      const attackerBoard = new Chess(defenseBoard.fen());
      const attackerLegal = attackerBoard.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion || ""}`);
      return !attackerLegal.includes(attackerMove);
    });

  if (!acceptableDefenseMoves.length) return null;

  const defenderTurn = defenderFen.split(" ")[1] === "w" ? "white" : "black";
  return {
    id: `threat-${raw.id}`,
    sourcePuzzleId: raw.id,
    threatType: normalizeTheme(raw.themes),
    attackerMove,
    fen: raw.fen,
    defenderFen,
    rating: raw.rating,
    themes: raw.themes,
    orientation: defenderTurn,
    acceptableDefenseMoves,
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

export function buildThreatDetectionSession(count = 10): ThreatPuzzle[] {
  const rating = getTacticsRatingData().tacticsRating || 800;
  const pool: ThreatPuzzle[] = [];

  for (const theme of CORE_THEMES) {
    const candidates = cachedPuzzlesByTheme[theme] || [];
    for (const raw of candidates) {
      if (Math.abs(raw.rating - rating) > 250) continue;
      const threat = buildThreatPuzzle(raw);
      if (threat) pool.push(threat);
      if (pool.length >= count * 4) break;
    }
  }

  return shuffle(pool).slice(0, count);
}

export function evaluateThreatDefenseMove(puzzle: ThreatPuzzle, moveUci: string): { correct: boolean; explanation: string } {
  const correct = puzzle.acceptableDefenseMoves.includes(moveUci);
  if (correct) {
    return {
      correct: true,
      explanation: `Correct — this move prevents the ${puzzle.threatType} by taking away your opponent's tactical shot ${puzzle.attackerMove}.`,
    };
  }
  return {
    correct: false,
    explanation: `That doesn't stop the threat. Your opponent can still play ${puzzle.attackerMove} and the ${puzzle.threatType} still lands.`,
  };
}

export function recordThreatDetectionSession(result: ThreatDetectionSessionSummary, puzzles: ThreatPuzzle[], identifiedCorrectFlags: boolean[], defenseCorrectFlags: boolean[]) {
  const progress = loadThreatDetectionProgress();
  const next = { ...progress, sessionsPlayed: progress.sessionsPlayed + 1, totalThreatsSeen: progress.totalThreatsSeen + result.total, threatIdCorrect: progress.threatIdCorrect + result.identifiedCorrect, defenseCorrect: progress.defenseCorrect + result.defendedCorrect, byPattern: { ...progress.byPattern }, lastSession: result };

  puzzles.forEach((puzzle, idx) => {
    const bucket = next.byPattern[puzzle.threatType] || { seen: 0, identified: 0, defended: 0 };
    bucket.seen += 1;
    if (identifiedCorrectFlags[idx]) bucket.identified += 1;
    if (defenseCorrectFlags[idx]) bucket.defended += 1;
    next.byPattern[puzzle.threatType] = bucket;
  });

  saveThreatDetectionProgress(next);
}
