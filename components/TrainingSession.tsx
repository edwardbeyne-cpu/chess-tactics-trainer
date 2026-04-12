"use client";

/**
 * Sprint 36 - Mastery Set Training System
 * 100-puzzle sets; each puzzle needs 3 correct solves under 10s (non-consecutive) to master.
 * Mix of tactic puzzles (~80%) and blunder-resistance positions (~20%).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import ChessBoard from "@/components/ChessBoard";
import StockfishAnalysis from "@/components/StockfishAnalysis";
import { loadPuzzleSettings, savePuzzleSettings, type PuzzleSettings } from "@/components/PuzzleSettingsModal";
import { cachedPuzzlesByTheme, type LichessCachedPuzzle } from "@/data/lichess-puzzles";
import {
  getAllPatternStats,
  getMasteryProgress,
  saveMasteryProgress,
  getCurrentMasterySet,
  getMasteredCount,
  isSetComplete,
  recordMasteryAttempt,
  incrementDailySession,
  getDailySessionCompleted,
  recordActivityToday,
  getStreakData,
  getDailyTargetSettings,
  getCCTMode,
  saveCCTMode,
  getCCTNudgeCount,
  incrementCCTNudgeCount,
  getCCTSessionCount,
  incrementCCTSessionCount,
  type CCTMode,
  type MasteryPuzzle,
  type MasterySet,
  type MasteryProgress,
} from "@/lib/storage";

// ── Constants ──────────────────────────────────────────────────────────────

const MASTERY_TIME_LIMIT_MS = 10000; // 10 seconds

// ── Helpers ────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function applyFirstMove(fen: string, moves: string[]): { fen: string; solution: string[] } {
  if (!moves || moves.length < 2) return { fen, solution: moves };
  try {
    const chess = new Chess(fen);
    const opp = moves[0];
    chess.move({ from: opp.slice(0, 2), to: opp.slice(2, 4), promotion: opp[4] || undefined });
    return { fen: chess.fen(), solution: moves.slice(1) };
  } catch {
    return { fen, solution: moves };
  }
}

function uciToSan(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return move?.san ?? null;
  } catch {
    return null;
  }
}

function applyUci(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return chess.fen();
  } catch {
    return null;
  }
}

function getRandomLegalMove(fen: string, excludeUcis: string[]): string | null {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    const candidates = moves.filter((m) => {
      const uci = `${m.from}${m.to}${m.promotion ?? ""}`;
      return !excludeUcis.includes(uci) && !excludeUcis.includes(`${m.from}${m.to}`);
    });
    if (candidates.length === 0) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return `${pick.from}${pick.to}${pick.promotion ?? ""}`;
  } catch {
    return null;
  }
}

// ── Blunder Position Builder ────────────────────────────────────────────────

interface BlunderData {
  fen: string;
  choices: string[];
  choiceSquares?: string[];  // destination squares for visual board selection
  correctChoiceIndex: number;
  blunderExplanation: string;
  patternTag: string;
}

const BLUNDER_EXPLANATIONS: Record<string, string[]> = {
  fork: ["Taking that piece walks into a knight fork - you'd lose material", "Capturing there allows a fork on the next move"],
  pin: ["That move abandons the pinned piece - the opponent takes for free", "Moving that way walks into an absolute pin"],
  skewer: ["That move allows a skewer - your king runs, opponent takes the piece behind", "Retreating there sets up a skewer"],
  backRankMate: ["That greedy capture removes the back rank defender - checkmate follows", "Moving that piece exposes a back rank mate"],
  deflection: ["That move deflects your defender - leaving a key square unprotected"],
  overloading: ["That move overloads your piece - it can't defend two targets at once"],
  default: [
    "That greedy capture walks into a tactic - always check your opponent's responses",
    "Taking the material is tempting but creates a losing position",
    "The greedy capture ignores your opponent's tactical threat",
  ],
};

function getBlunderExplanation(themes: string[]): string {
  for (const t of themes) {
    const arr = BLUNDER_EXPLANATIONS[t];
    if (arr?.length) return arr[Math.floor(Math.random() * arr.length)];
  }
  const d = BLUNDER_EXPLANATIONS.default;
  return d[Math.floor(Math.random() * d.length)];
}

function buildBlunderData(raw: LichessCachedPuzzle): BlunderData | null {
  if (raw.moves.length < 2) return null;
  const afterOppFen = applyUci(raw.fen, raw.moves[0]);
  if (!afterOppFen) return null;

  const safeMove = raw.moves[1];
  const safeSan = uciToSan(afterOppFen, safeMove);
  if (!safeSan) return null;

  // Find a greedy blunder (capture != safe move)
  let blunderMove: string | null = null;
  try {
    const chess = new Chess(afterOppFen);
    const allMoves = chess.moves({ verbose: true });
    const captures = allMoves.filter((m) => {
      const uci = `${m.from}${m.to}`;
      return m.captured && uci !== safeMove.slice(0, 4);
    });
    if (captures.length > 0) {
      const pick = captures[Math.floor(Math.random() * captures.length)];
      blunderMove = `${pick.from}${pick.to}${pick.promotion ?? ""}`;
    }
  } catch { /* skip */ }
  if (!blunderMove) return null;

  const blunderSan = uciToSan(afterOppFen, blunderMove);
  if (!blunderSan) return null;

  const neutralMove = getRandomLegalMove(afterOppFen, [safeMove, blunderMove]);
  if (!neutralMove) return null;
  const neutralSan = uciToSan(afterOppFen, neutralMove);
  if (!neutralSan) return null;

  const rawChoices = shuffleArray([
    { san: safeSan, isSafe: true, toSquare: safeMove.slice(2, 4) },
    { san: blunderSan, isSafe: false, toSquare: blunderMove.slice(2, 4) },
    { san: neutralSan, isSafe: false, toSquare: neutralMove.slice(2, 4) },
  ]);

  const NOISE_TAGS = new Set(["short", "long", "middlegame", "endgame", "opening", "master",
    "masterVsMaster", "advantage", "crushing", "equality", "mate", "mateIn1", "mateIn2",
    "mateIn3", "mateIn4", "mateIn5", "sacrifice"]);

  return {
    fen: afterOppFen,
    choices: rawChoices.map((c) => c.san),
    choiceSquares: rawChoices.map((c) => c.toSquare),
    correctChoiceIndex: rawChoices.findIndex((c) => c.isSafe),
    blunderExplanation: getBlunderExplanation(raw.themes),
    patternTag: raw.themes.find((t) => !NOISE_TAGS.has(t)) ?? "tactics",
  };
}

// ── Set Generation ─────────────────────────────────────────────────────────

function computeBlunderRatio(): number {
  try {
    // Check calibration rating - high-rated players get fewer blunders
    const calibRaw = localStorage.getItem("ctt_calibration_rating");
    if (calibRaw) {
      const calib = parseInt(calibRaw, 10);
      if (!isNaN(calib) && calib >= 2000) return 0.1;
    }
    // Check custom blunder rate from Chess.com analysis
    const customRaw = localStorage.getItem("ctt_custom_analysis");
    if (customRaw) {
      const custom = JSON.parse(customRaw) as { blunderRate?: number };
      if (typeof custom.blunderRate === "number" && custom.blunderRate > 30) return 0.3;
    }
  } catch { /* ignore */ }
  return 0.2;
}

export function generateMasterySet(setNumber: number, carriedPuzzles: MasteryPuzzle[] = []): MasterySet {
  const calibRaw = localStorage.getItem("ctt_calibration_rating");
  const calibrationRating = calibRaw ? Math.max(400, parseInt(calibRaw, 10) || 800) : 800;
  const targetELO = calibrationRating + (setNumber - 1) * 50;
  // Blunder puzzles removed from training set - standalone feature only
  const blunderCount = 0;
  const SET_SIZE = Math.min(30, Math.max(5, getDailyTargetSettings().dailyGoal));
  const newTacticCount = Math.max(0, SET_SIZE - carriedPuzzles.length);

  const usedIds = new Set<string>();
  // Mark carried puzzle IDs as used so new puzzles don't duplicate them
  for (const p of carriedPuzzles) {
    usedIds.add(p.id.replace(/^(tactic|blunder)_/, ""));
  }
  const puzzles: MasteryPuzzle[] = [];

  // ── Tactic puzzles ──────────────────────────────────────────────────────
  const allThemes = Object.keys(cachedPuzzlesByTheme);

  // Map game analysis pattern labels to puzzle theme keys
  const gameAnalysisToTheme: Record<string, string> = {
    "Fork": "fork",
    "Pin": "pin",
    "Skewer": "skewer",
    "Winning Captures": "fork",       // closest tactical theme
    "Discovered Attacks": "discoveredAttack",
    "Back Rank Mates": "backRankMate",
    "Checks": "fork",                 // fallback
  };

  // Primary: use Chess.com game analysis weaknesses if available
  // This is the real-game data - what patterns the player actually misses
  let weakestThemes: string[] = [];
  try {
    const gameAnalysisRaw = localStorage.getItem("ctt_game_analysis") || localStorage.getItem("ctt_custom_analysis");
    if (gameAnalysisRaw) {
      const gameData = JSON.parse(gameAnalysisRaw) as {
        weaknesses?: Array<{ pattern: string; share: number }>;
      };
      if (gameData.weaknesses?.length) {
        weakestThemes = gameData.weaknesses
          .slice(0, 3)
          .map((w) => gameAnalysisToTheme[w.pattern] ?? w.pattern.toLowerCase())
          .filter((t) => allThemes.includes(t));
      }
    }
  } catch { /* ignore */ }

  // Fallback: use in-app training solve rates if no game analysis
  if (weakestThemes.length === 0) {
    const patternStats = getAllPatternStats();
    weakestThemes = patternStats
      .filter((s) => s.totalAttempts >= 3)
      .sort((a, b) => a.solveRate - b.solveRate)
      .slice(0, 3)
      .map((s) => s.theme.toLowerCase());
  }

  // If we have Chess.com game data, weight harder toward weaknesses (70%)
  // Otherwise use balanced 50/50 split for in-app training data
  const hasGameAnalysis = (() => {
    try { return !!localStorage.getItem("ctt_game_analysis"); } catch { return false; }
  })();
  const weakRatio = hasGameAnalysis ? 0.7 : 0.5;
  const weakTacticTarget = Math.round(newTacticCount * weakRatio);
  const spreadTacticTarget = newTacticCount - weakTacticTarget;

  // Select from weak patterns
  if (weakestThemes.length > 0) {
    const perWeak = Math.ceil(weakTacticTarget / weakestThemes.length);
    for (const theme of weakestThemes) {
      const pool = cachedPuzzlesByTheme[theme] ?? [];
      const eligible = pool.filter((p) => Math.abs(p.rating - targetELO) <= 200 && !usedIds.has(p.id));
      const minElo = Math.max(800, targetELO - 400); const fallback = pool.filter((p) => !usedIds.has(p.id) && p.rating >= minElo); const source = shuffleArray(eligible.length > 0 ? eligible : (fallback.length > 0 ? fallback : pool.filter((p) => !usedIds.has(p.id))));
      for (let i = 0; i < Math.min(perWeak, source.length) && puzzles.filter(p => p.type === "tactic").length < weakTacticTarget; i++) {
        const raw = source[i];
        if (usedIds.has(raw.id)) continue;
        const { fen, solution } = applyFirstMove(raw.fen, raw.moves);
        puzzles.push({
          id: `tactic_${raw.id}`,
          type: "tactic",
          puzzleData: { fen, solution, rating: raw.rating, theme },
          masteryHits: 0,
          lastSolvedAt: [],
          lastMasteryHitCounter: 0,
          attempts: 0,
          correctAttempts: 0,
          avgSolveTime: 0,
          lastAttemptAt: 0,
        });
        usedIds.add(raw.id);
      }
    }
  }

  // Fill remaining tactic slots from other patterns (spread)
  const otherThemes = shuffleArray(allThemes.filter((t) => !weakestThemes.includes(t)));
  let otherIdx = 0;
  while (puzzles.filter((p) => p.type === "tactic").length < newTacticCount && otherIdx < otherThemes.length * 5) {
    const theme = otherThemes[otherIdx % otherThemes.length];
    otherIdx++;
    const pool = cachedPuzzlesByTheme[theme] ?? [];
    const eligible = pool.filter((p) => Math.abs(p.rating - targetELO) <= 200 && !usedIds.has(p.id));
    const minElo2 = Math.max(800, targetELO - 400); const fallback2 = pool.filter((p) => !usedIds.has(p.id) && p.rating >= minElo2); const source = eligible.length > 0 ? eligible : (fallback2.length > 0 ? fallback2 : pool.filter((p) => !usedIds.has(p.id)));
    if (source.length === 0) continue;
    const raw = source[Math.floor(Math.random() * source.length)];
    if (usedIds.has(raw.id)) continue;
    const { fen, solution } = applyFirstMove(raw.fen, raw.moves);
    puzzles.push({
      id: `tactic_${raw.id}`,
      type: "tactic",
      puzzleData: { fen, solution, rating: raw.rating, theme },
      masteryHits: 0,
      lastSolvedAt: [],
      lastMasteryHitCounter: 0,
      attempts: 0,
      correctAttempts: 0,
      avgSolveTime: 0,
      lastAttemptAt: 0,
    });
    usedIds.add(raw.id);
  }

  // ── Blunder positions ─────────────────────────────────────────────────
  const allThemesShuffled = shuffleArray(allThemes);
  let blunderAdded = 0;
  for (const theme of allThemesShuffled) {
    if (blunderAdded >= blunderCount) break;
    const pool = cachedPuzzlesByTheme[theme] ?? [];
    const eligible = shuffleArray(pool.filter((p) => p.moves.length >= 2 && !usedIds.has(p.id)));
    for (const raw of eligible) {
      if (blunderAdded >= blunderCount) break;
      if (usedIds.has(raw.id)) continue;
      const blunderData = buildBlunderData(raw);
      if (!blunderData) continue;
      puzzles.push({
        id: `blunder_${raw.id}`,
        type: "blunder",
        puzzleData: blunderData,
        masteryHits: 0,
        lastSolvedAt: [],
        lastMasteryHitCounter: 0,
        attempts: 0,
        correctAttempts: 0,
        avgSolveTime: 0,
        lastAttemptAt: 0,
      });
      usedIds.add(raw.id);
      blunderAdded++;
    }
  }

  const resetCarried = carriedPuzzles.map((p) => ({
    ...p, masteryHits: 0, lastSolvedAt: [], lastMasteryHitCounter: 0, attempts: 0, correctAttempts: 0,
  }));

  // Hard cap - never exceed SET_SIZE regardless of what loops produced
  const finalPuzzles = [...resetCarried, ...shuffleArray(puzzles)].slice(0, SET_SIZE);

  return {
    setNumber,
    createdAt: Date.now(),
    completedAt: null,
    targetELO,
    puzzles: finalPuzzles,
    blunderRatio: 0,
  };
}

// ── Puzzle Selection ────────────────────────────────────────────────────────

/**
 * Pick the next puzzle to show from the set.
 * - Skip mastered puzzles (masteryHits === 3)
 * - Prefer lowest masteryHits (0 → 1 → 2)
 * - Avoid puzzles already shown in the current session
 * Returns the index into set.puzzles, or -1 if all mastered.
 */
function pickNextPuzzleIdx(set: MasterySet, lastShownId: string | null, seenIds: Set<string> = new Set()): number {
  const candidates = set.puzzles
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.masteryHits < 3 && p.id !== lastShownId && !seenIds.has(p.id));

  if (candidates.length === 0) {
    // All (other) puzzles mastered - check if last puzzle is also mastered
    const allMastered = set.puzzles.every((p) => p.masteryHits >= 3);
    if (allMastered) return -1;
    // Only one unmastered puzzle left - show it even if it was just shown
    const last = set.puzzles.findIndex((p) => p.masteryHits < 3);
    return last;
  }

  // Group by masteryHits, pick from lowest group
  const minHits = Math.min(...candidates.map(({ p }) => p.masteryHits));
  const group = candidates.filter(({ p }) => p.masteryHits === minHits);
  return group[Math.floor(Math.random() * group.length)].i;
}

// ── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = "#4ade80" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ backgroundColor: "#0f0f1a", borderRadius: "999px", height: "8px", overflow: "hidden", border: "1px solid #1e2a3a", flex: 1 }}>
      <div style={{ height: "100%", backgroundColor: color, borderRadius: "999px", width: `${pct}%`, transition: "width 0.4s ease" }} />
    </div>
  );
}

// ── Mastery Dots ────────────────────────────────────────────────────────────

function MasteryDots({ hits, size = 14 }: { hits: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            backgroundColor: i < hits ? "#4ade80" : "transparent",
            border: `2px solid ${i < hits ? "#4ade80" : "#334155"}`,
            transition: "all 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

// ── CCT Info Modal ──────────────────────────────────────────────────────────
interface CCTInfoModalProps {
  open: boolean;
  onClose: () => void;
}

function CCTInfoModal({ open, onClose }: CCTInfoModalProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          zIndex: 999,
        }}
      />
      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "12px",
          padding: "1.5rem",
          maxWidth: "500px",
          width: "90vw",
          maxHeight: "80vh",
          overflowY: "auto",
          zIndex: 1000,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.8)",
        }}
      >
        {/* Close button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ color: "#4ade80", fontSize: "1.2rem", fontWeight: "bold", margin: 0 }}>
            Checks, Captures &amp; Threats
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#64748b",
              fontSize: "1.5rem",
              cursor: "pointer",
              padding: "0",
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", color: "#e2e8f0", lineHeight: 1.6 }}>
          {/* What is CCT */}
          <div>
            <div style={{ color: "#4ade80", fontSize: "0.9rem", fontWeight: "bold", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              What is CCT?
            </div>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#cbd5e1" }}>
              Before making a move, scan the board for <strong>Checks</strong>, <strong>Captures</strong>, and <strong>Threats</strong>. This builds the habit of seeing tactical opportunities before they pass.
            </p>
          </div>

          {/* The three modes */}
          <div>
            <div style={{ color: "#4ade80", fontSize: "0.9rem", fontWeight: "bold", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Three Modes
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {/* Off */}
              <div
                style={{
                  backgroundColor: "#0d1621",
                  border: "1px solid #1e3a5c",
                  borderRadius: "8px",
                  padding: "0.75rem",
                }}
              >
                <div style={{ color: "#e2e8f0", fontSize: "0.9rem", fontWeight: "700", marginBottom: "0.25rem" }}>
                  ⊘ Off
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
                  No CCT prompts. Solve freely without scanning.
                </p>
              </div>

              {/* Suggested */}
              <div
                style={{
                  backgroundColor: "#0d2218",
                  border: "1px solid #2d5f1f",
                  borderRadius: "8px",
                  padding: "0.75rem",
                }}
              >
                <div style={{ color: "#4ade80", fontSize: "0.9rem", fontWeight: "700", marginBottom: "0.25rem" }}>
                  💡 Suggested
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
                  CCT buttons appear as a reminder, but you can move anytime. Great for building the habit at your own pace.
                </p>
              </div>

              {/* Enforced */}
              <div
                style={{
                  backgroundColor: "#0d1a2a",
                  border: "1px solid #1e3a5c",
                  borderRadius: "8px",
                  padding: "0.75rem",
                }}
              >
                <div style={{ color: "#60a5fa", fontSize: "0.9rem", fontWeight: "700", marginBottom: "0.25rem" }}>
                  🔒 Enforced
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
                  You must check all three (Checks, Captures, Threats) before the board unlocks for your move. Most powerful for skill building.
                </p>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div
            style={{
              backgroundColor: "#0d1621",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.75rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
              💡 You can change your CCT mode anytime in <strong>Puzzle Settings</strong> below the board.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Tactic Board ────────────────────────────────────────────────────────────

interface TacticBoardProps {
  puzzleData: { fen: string; solution: string[]; rating: number; theme: string };
  onResult: (correct: boolean) => void;
  onAdvance: () => void;
  onRetry: () => void;
  onCctUnlocked?: () => void; // called when CCT completes so parent resets timer
  showAnalysis?: boolean;
  onAnalyzeClick?: () => void;
}

function TacticBoard({ puzzleData, onResult, onAdvance, onRetry, onCctUnlocked, showAnalysis = false, onAnalyzeClick }: TacticBoardProps) {
  const [fen, setFen] = useState(puzzleData.fen);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<"solve" | "solved" | "failed">("solve");
  const sideToMove = puzzleData.fen.includes(" b ") ? "Black" : "White";
  const [message, setMessage] = useState(`${sideToMove} to move - find the tactic`);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const resultCalledRef = useRef(false);
  const hasScoredRef = useRef(false);
  const retryModeRef = useRef(false);

  // Sidebar settings popup state
  const [sidebarSettingsOpen, setSidebarSettingsOpen] = useState(false);

  // CCT info modal state
  const [cctInfoOpen, setCctInfoOpen] = useState(false);

  // Puzzle settings (for timer)
  const [puzzleSettings, setPuzzleSettings] = useState<PuzzleSettings>(() => loadPuzzleSettings());

  // Timer state - mirrors Drill Tactics implementation
  const timerLimit = puzzleSettings.timeLimit > 0 ? puzzleSettings.timeLimit : 0;
  const [timeLeft, setTimeLeft] = useState(timerLimit);
  const [timerActive, setTimerActive] = useState(timerLimit > 0);
  const timerColor = timerLimit > 0
    ? (timeLeft / timerLimit <= 0.2 ? "#ef4444" : timeLeft / timerLimit <= 0.5 ? "#f59e0b" : "#4ade80")
    : "#4ade80";

  // CCT Mode - Checks, Captures, Threats
  const [cctMode] = useState<CCTMode>(() => getCCTMode());
  const [cctChecked, setCctChecked] = useState({ checks: false, captures: false, threats: false });
  const [cctUnlocked, setCctUnlocked] = useState(false);
  const [cctNudge, setCctNudge] = useState(false);
  const [amberBanner, setAmberBanner] = useState(false);
  const [cctContextCard, setCctContextCard] = useState<null | {
    tone: "used" | "ignored" | "missed";
    title: string;
    body: string;
  }>(null);
  // "off" and "suggested" - board always unlocked; "enforced" - locked until all 3 checked
  const cctComplete = cctMode === "off" || cctMode === "suggested" || cctUnlocked;
  const cctAllChecked = cctChecked.checks && cctChecked.captures && cctChecked.threats;
  const cctAnyClickedRef = useRef(false); // tracks if user clicked any CCT button before moving
  const amberShownRef = useRef(false); // only show amber nudge once per puzzle

  // First-wrong-move CCT slide-up tip (one-time, not shown in "off" mode)
  const [showCCTSlideUp, setShowCCTSlideUp] = useState(false);

  useEffect(() => {
    if (cctMode === "enforced" && cctAllChecked && !cctUnlocked) {
      setCctUnlocked(true);
      onCctUnlocked?.(); // Reset parent timer so 10s countdown starts from now
    }
    if (cctMode === "suggested" && cctAllChecked && !cctUnlocked) {
      setCctUnlocked(true); // visual state: show "✓ Scanned"
    }
  }, [cctAllChecked, cctMode, cctUnlocked, onCctUnlocked]);

  // Re-sync puzzleSettings when localStorage changes (e.g. SidebarPuzzleSettings saves)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "ctt_puzzle_settings") {
        setPuzzleSettings(loadPuzzleSettings());
      }
    }
    window.addEventListener("storage", onStorage);
    function onCustom() { setPuzzleSettings(loadPuzzleSettings()); }
    window.addEventListener("ctt_puzzle_settings_changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ctt_puzzle_settings_changed", onCustom);
    };
  }, []);

  // Reset timer when puzzle changes
  useEffect(() => {
    const t = puzzleSettings.timeLimit > 0 ? puzzleSettings.timeLimit : 0;
    setTimeLeft(t);
    setTimerActive(t > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleData.fen]);

  // Re-sync when settings change
  useEffect(() => {
    if (status === "solve") {
      const t = puzzleSettings.timeLimit > 0 ? puzzleSettings.timeLimit : 0;
      setTimeLeft(t);
      setTimerActive(t > 0 && !sidebarSettingsOpen);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleSettings.timeLimit]);

  // Pause timer when settings open
  useEffect(() => {
    if (sidebarSettingsOpen) {
      setTimerActive(false);
    } else if (timerLimit > 0 && status === "solve" && timeLeft > 0) {
      setTimerActive(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarSettingsOpen]);

  // Countdown tick
  useEffect(() => {
    if (!timerActive || timeLeft <= 0 || timerLimit === 0) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setTimerActive(false);
          setStatus("failed");
          setMessage("Time's up!");
          if (!resultCalledRef.current) {
            resultCalledRef.current = true;
            hasScoredRef.current = true;
            onResult(false); // treat as wrong - resets mastery
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive, timerLimit]);

  // Auto-advance 1.5s after time expires
  useEffect(() => {
    if (status === "failed" && timeLeft === 0 && timerLimit > 0) {
      const id = setTimeout(() => onAdvance(), 1500);
      return () => clearTimeout(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, timeLeft]);

  const [isDesktop, setIsDesktop] = useState(false);
  const [boardWidth, setBoardWidth] = useState(460);
  useEffect(() => {
    function getWidth() {
      if (typeof window === "undefined") return 440;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxFromHeight = Math.floor((vh - 220) * 0.88);
      if (vw < 700) {
        // Mobile: page padding ~16px each side = 32px total. Card padding now removed (0 horizontal).
        return Math.max(280, Math.min(vw - 36, maxFromHeight));
      }
      const containerW = Math.min(900, vw - 64);
      return Math.max(300, Math.min(500, containerW - 220 - 16, maxFromHeight));
    }
    setBoardWidth(getWidth());
    setIsDesktop(window.innerWidth >= 700);
    const handler = () => { setBoardWidth(getWidth()); setIsDesktop(window.innerWidth >= 700); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const orientation = puzzleData.fen.includes(" b ") ? "black" : "white";

  function handleMove(from: string, to: string): boolean {
    if (status !== "solve") return false;
    // CCT gate: block moves until all three checked (enforced mode only)
    if (!cctComplete) {
      setCctNudge(true);
      setTimeout(() => setCctNudge(false), 2000);
      return false;
    }
    // Suggested mode: nudge if user skipped CCT scan (first 10 sessions only)
    if (cctMode === "suggested" && !cctAnyClickedRef.current && !amberShownRef.current) {
      const nudgeCount = getCCTNudgeCount();
      if (nudgeCount < 10) {
        incrementCCTNudgeCount();
        amberShownRef.current = true;
        setAmberBanner(true);
        setTimeout(() => setAmberBanner(false), 3000);
      }
    }

    const expectedUci = puzzleData.solution[moveIndex];
    const expFrom = expectedUci.slice(0, 2);
    const expTo = expectedUci.slice(2, 4);
    const isCorrect = from === expFrom && to === expTo;

    if (!isCorrect) {
      setTimerActive(false);
      setStatus("failed");
      setMessage("✗ Wrong");
      if (cctMode !== "off") {
        if (!cctAnyClickedRef.current) {
          setCctContextCard({
            tone: "missed",
            title: "Most players miss this by moving too fast",
            body: "Before your next move, scan Checks → Captures → Threats first. That one habit catches more tactics than guessing ever will.",
          });
        } else {
          setCctContextCard({
            tone: "missed",
            title: "Good - now use the scan more deliberately",
            body: "You engaged with CCT. Next step: slow down and use Checks → Captures → Threats to confirm the tactic before moving.",
          });
        }
      }
      if (!hasScoredRef.current) {
        hasScoredRef.current = true;
        if (!resultCalledRef.current) {
          resultCalledRef.current = true;
          onResult(false);
        }
      }
      // Show CCT slide-up tip on first wrong move if tutorial not yet seen
      if (cctMode !== "off" && !cctContextCard) {
        try {
          if (!localStorage.getItem("ctt_cct_tutorial_seen")) {
            setShowCCTSlideUp(true);
          }
        } catch { /* ignore */ }
      }
      return false;
    }

    try {
      const chess = new Chess(fen);
      const promotion = expectedUci.length === 5 ? expectedUci[4] : undefined;
      chess.move({ from, to, promotion });
      const newFen = chess.fen();
      // Update board state immediately so the piece does not snap back first.
      setLastMove([from, to]);
      setFen(newFen);

      const nextIndex = moveIndex + 1;
      if (nextIndex >= puzzleData.solution.length) {
        setTimerActive(false);
        setStatus("solved");
        setMessage("Correct!");
        if (cctMode !== "off") {
          if (cctAnyClickedRef.current) {
            setCctContextCard({
              tone: "used",
              title: "That's CCT — you're building the habit",
              body: "You used Checks → Captures → Threats before moving. Keep doing that and the tactical patterns will get easier to spot.",
            });
          } else {
            setCctContextCard({
              tone: "ignored",
              title: "Nice solve — now make it repeatable",
              body: "Before your next move, try scanning Checks → Captures → Threats first. That's the habit that separates improvers from guessers.",
            });
          }
        }
        if (!resultCalledRef.current) {
          resultCalledRef.current = true;
          onResult(true);
        }
        return true;
      }

      // Apply opponent response
      const oppUci = puzzleData.solution[nextIndex];
      setTimeout(() => {
        try {
          const chess2 = new Chess(newFen);
          chess2.move({ from: oppUci.slice(0, 2), to: oppUci.slice(2, 4), promotion: oppUci[4] || undefined });
          setFen(chess2.fen());
          setLastMove([oppUci.slice(0, 2), oppUci.slice(2, 4)]);
          setMoveIndex(nextIndex + 1);
          setMessage("Keep going - find the next move!");
        } catch {
          setStatus("solved");
          setMessage("Correct!");
          if (!resultCalledRef.current) {
            resultCalledRef.current = true;
            onResult(true);
          }
        }
      }, 400);

      setMoveIndex(nextIndex);
      return true;
    } catch {
      return false;
    }
  }

  const msgColor = status === "solved" ? "#4ade80" : status === "failed" ? "#ef4444" : "#e2e8f0";
  const msgBorder = status === "solved" ? "#4ade80" : status === "failed" ? "#ef4444" : "#2e3a5c";

  return (
    <div style={{ display: "flex", flexDirection: isDesktop ? "row" : "column", alignItems: isDesktop ? "flex-start" : "center", justifyContent: "center", gap: "1rem", overflow: "hidden", width: "100%" }}>

      {/* LEFT COLUMN: CCT + info (desktop only) */}
      {isDesktop && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "220px", flexShrink: 0, paddingTop: "0.25rem" }}>
          {/* CCT Panel - fixed min-height so board never jumps */}
          {cctMode !== "off" && status === "solve" && (
            <div style={{
              backgroundColor: "#0d1621", border: `1px solid ${cctUnlocked ? "#4ade80" : "#2e3a5c"}`,
              borderRadius: "8px", padding: "0.75rem", transition: "border-color 0.2s",
              minHeight: "160px", display: "flex", flexDirection: "column", justifyContent: "flex-start",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ color: "#475569", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>⚡ Scan Before You Move</div>
                  <button
                    onClick={() => setCctInfoOpen(true)}
                    title="Learn about CCT"
                    style={{
                      background: "none",
                      border: "1px solid #3a4a6a",
                      borderRadius: "50%",
                      width: "18px",
                      height: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#64748b",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 1,
                      flexShrink: 0,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#60a5fa";
                      (e.currentTarget as HTMLButtonElement).style.color = "#60a5fa";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#3a4a6a";
                      (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
                    }}
                  >
                    ⓘ
                  </button>
                </div>
                {cctMode === "enforced" && !cctUnlocked && <div style={{ color: "#334155", fontSize: "0.65rem" }}>Board locked</div>}
              </div>
              {!cctUnlocked && !cctAllChecked && (
                <div style={{ color: "#64748b", fontSize: "0.72rem", marginBottom: "0.5rem", lineHeight: 1.45 }}>
                  Before you move, ask: <span style={{ color: "#94a3b8" }}>Can I give check?</span> <span style={{ color: "#94a3b8" }}>Can I capture something?</span> <span style={{ color: "#94a3b8" }}>Is anything under threat?</span>
                </div>
              )}
              {cctUnlocked || cctAllChecked ? (
                <div style={{ color: "#4ade80", fontSize: "0.82rem", fontWeight: 600, textAlign: "center", padding: "0.3rem 0" }}>
                  {cctMode === "enforced" ? "✓ Board unlocked" : "✓ Scanned"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {(["checks", "captures", "threats"] as const).map((key) => {
                    const checked = cctChecked[key];
                    const label = key.charAt(0).toUpperCase() + key.slice(1);
                    const icons = { checks: "♟", captures: "⚔", threats: "⚠" };
                    return (
                      <button key={key} onClick={() => {
                        if (!checked) {
                          cctAnyClickedRef.current = true;
                          setCctChecked((prev) => ({ ...prev, [key]: true }));
                        }
                      }}
                        style={{
                          padding: "0.45rem 0.6rem", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600,
                          cursor: checked ? "default" : "pointer",
                          backgroundColor: checked ? "rgba(74,222,128,0.12)" : "#13132b",
                          color: checked ? "#4ade80" : "#e2e8f0",
                          border: `1px solid ${checked ? "#4ade80" : "#3a4a6a"}`,
                          display: "flex", alignItems: "center", gap: "0.5rem",
                        }}>
                        <span>{checked ? "✓" : icons[key]}</span> {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* Analyze with Engine - sidebar button */}
          <button
            onClick={() => onAnalyzeClick?.()}
            style={{
              backgroundColor: "transparent", border: "1px solid #2e3a5c",
              borderRadius: "6px", padding: "0.45rem 0.6rem",
              color: showAnalysis ? "#60a5fa" : "#475569",
              fontSize: "0.78rem", cursor: "pointer", textAlign: "left",
              width: "100%",
            }}
          >
            🔍 {showAnalysis ? "Hide Analysis" : "Analyze with Engine"}
          </button>

          {/* Puzzle Settings - sidebar button + inline popup */}
          <SidebarPuzzleSettings />

          {/* Timer display */}
          {timerLimit > 0 && status === "solve" && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              backgroundColor: "#0f1621",
              border: `1px solid ${timerColor}`,
              borderRadius: "6px",
              padding: "0.4rem 0.6rem",
              transition: "border-color 0.3s",
            }}>
              <span style={{ fontSize: "0.75rem" }}>⏱</span>
              <span style={{ color: timerColor, fontSize: "1.1rem", fontWeight: "bold", fontFamily: "monospace", transition: "color 0.3s" }}>
                {timeLeft}s
              </span>
              {timeLeft <= 3 && timeLeft > 0 && (
                <span style={{ color: "#ef4444", fontSize: "0.7rem", fontWeight: 600 }}>hurry!</span>
              )}
            </div>
          )}
          {timerLimit > 0 && status !== "solve" && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "6px",
              padding: "0.4rem 0.6rem",
            }}>
              <span style={{ fontSize: "0.75rem" }}>⏱</span>
              <span style={{ color: "#475569", fontSize: "1.1rem", fontWeight: "bold", fontFamily: "monospace" }}>
                {timeLeft}s
              </span>
            </div>
          )}

          {/* Puzzle info */}
          <div style={{ color: "#475569", fontSize: "0.75rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <div>Rating: <span style={{ color: "#94a3b8" }}>{puzzleData.rating}</span></div>
            <div>{orientation === "white" ? "White to move" : "Black to move"}</div>
          </div>
        </div>
      )}

      {/* RIGHT COLUMN (or single column mobile): board + overlays */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      {/* Mobile only: message bar above board */}
      {!isDesktop && status === "solve" && (
        <div style={{
          fontSize: "0.9rem", fontWeight: 500, color: msgColor,
          padding: "0.5rem 1rem", backgroundColor: "#0d1621", borderRadius: "8px",
          border: `1px solid ${msgBorder}`, textAlign: "center",
          width: "100%", maxWidth: `${boardWidth}px`, boxSizing: "border-box",
        }}>
          {message}
        </div>
      )}

      {/* Board with overlay */}
      <div style={{ position: "relative", width: boardWidth, height: boardWidth, overflow: "hidden" }}>
        <ChessBoard
          fen={fen}
          onMove={handleMove}
          lastMove={lastMove}
          draggable={status === "solve"}
          boardWidth={boardWidth}
          orientation={orientation as "white" | "black"}
        />

        {/* Wrong Answer Overlay - centered on board */}
        {status === "failed" && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundColor: "rgba(10,15,26,0.93)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            borderRadius: "4px", padding: "1.5rem",
            gap: "0",
            zIndex: 50, // above Chessground pieces (z-index 2-11)
          }}>
            <div style={{ color: "#ef4444", fontSize: "1.5rem", fontWeight: "900", marginBottom: "0.25rem" }}>✗</div>
            <div style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "700", marginBottom: "0.15rem" }}>Missed this one</div>
            <div style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "1.25rem", textAlign: "center" }}>
              You&apos;ll see it again - spaced repetition brings it back.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", maxWidth: "220px" }}>
              <button
                onClick={() => {
                  resultCalledRef.current = false;
                  hasScoredRef.current = false;
                  setFen(puzzleData.fen);
                  setMoveIndex(0);
                  setStatus("solve");
                  setMessage(`${sideToMove} to move - find the tactic`);
                  setLastMove(undefined);
                  // Require CCT scan again on retry - missed puzzle = scan again
                  setCctChecked({ checks: false, captures: false, threats: false });
                  setCctUnlocked(false);
                  cctAnyClickedRef.current = false;
                  amberShownRef.current = false;
                  // Restart timer on retry
                  const t = puzzleSettings.timeLimit > 0 ? puzzleSettings.timeLimit : 0;
                  setTimeLeft(t);
                  setTimerActive(t > 0);
                  onRetry(); // set retryPendingRef to block any queued advance
                }}
                style={{ backgroundColor: "#0a1f12", border: "1px solid #4ade80", borderRadius: "8px", padding: "0.55rem 1rem", color: "#4ade80", fontSize: "0.85rem", fontWeight: "600", cursor: "pointer" }}
              >
                ↺ Retry Puzzle
              </button>
              <button
                onClick={() => {
                  const encodedFen = encodeURIComponent(puzzleData.fen);
                  window.open(`https://lichess.org/analysis?fen=${encodedFen}`, "_blank");
                  setTimeout(() => onAdvance(), 500);
                }}
                style={{ backgroundColor: "#0a1228", border: "1px solid #60a5fa", borderRadius: "8px", padding: "0.55rem 1rem", color: "#60a5fa", fontSize: "0.85rem", fontWeight: "600", cursor: "pointer" }}
              >
              🔍 Review with Engine
            </button>
            <button
              onClick={() => onAdvance()}
              style={{
                backgroundColor: "transparent", border: "1px solid #2e3a5c",
                borderRadius: "8px", padding: "0.5rem 1rem",
                color: "#94a3b8", fontSize: "0.85rem", cursor: "pointer",
                textAlign: "left",
              }}
            >
              → Next Puzzle
            </button>
          </div>
        </div>
      )}
      </div>

      {/* CCT Panel - mobile only (desktop uses left column), stacked below board */}
      {cctMode !== "off" && status === "solve" && !isDesktop && (
        <div style={{
          width: "100%", maxWidth: `${boardWidth}px`, boxSizing: "border-box",
          backgroundColor: "#0d1621", border: `1px solid ${cctUnlocked ? "#4ade80" : "#2e3a5c"}`,
          borderRadius: "8px", padding: boardWidth < 360 ? "0.5rem 0.75rem" : "0.75rem 1rem",
          transition: "border-color 0.2s",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
            <div style={{ color: "#475569", fontSize: boardWidth < 360 ? "0.65rem" : "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              ⚡ CCT - Scan before you move
            </div>
            {cctMode === "enforced" && !cctUnlocked && (
              <div style={{ color: "#334155", fontSize: boardWidth < 360 ? "0.62rem" : "0.7rem" }}>Board locked</div>
            )}
          </div>
          {!cctUnlocked && !cctAllChecked && (
            <div style={{ color: "#64748b", fontSize: boardWidth < 360 ? "0.68rem" : "0.75rem", marginBottom: "0.5rem", lineHeight: 1.45 }}>
              Scan for: <span style={{ color: "#94a3b8" }}>Checks</span>, <span style={{ color: "#94a3b8" }}>Captures</span>, <span style={{ color: "#94a3b8" }}>Threats</span>. Confirm each below.
            </div>
          )}
          {cctUnlocked || cctAllChecked ? (
            <div style={{ color: "#4ade80", fontSize: boardWidth < 360 ? "0.78rem" : "0.85rem", fontWeight: 600, textAlign: "center", padding: "0.3rem 0", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <span>✓</span> {cctMode === "enforced" ? "Board unlocked - make your move" : "Scanned"}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: boardWidth < 360 ? "0.4rem" : "0.6rem", marginBottom: "0.35rem" }}>
                {(["checks", "captures", "threats"] as const).map((key) => {
                  const checked = cctChecked[key];
                  const label = key.charAt(0).toUpperCase() + key.slice(1);
                  const descriptions: Record<string, string> = {
                    checks: "Can opponent check me?",
                    captures: "What can be captured?",
                    threats: "What are they threatening?",
                  };
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        if (!checked) {
                          cctAnyClickedRef.current = true;
                          setCctChecked((prev) => ({ ...prev, [key]: true }));
                        }
                      }}
                      title={descriptions[key]}
                      style={{
                        flex: 1,
                        padding: boardWidth < 360 ? "0.35rem 0.25rem" : "0.5rem 0.4rem",
                        borderRadius: "6px",
                        fontSize: boardWidth < 360 ? "0.7rem" : "0.8rem",
                        fontWeight: 600,
                        cursor: checked ? "default" : "pointer",
                        backgroundColor: checked ? "rgba(74,222,128,0.12)" : "#13132b",
                        color: checked ? "#4ade80" : "#e2e8f0",
                        border: `1px solid ${checked ? "#4ade80" : "#3a4a6a"}`,
                        transition: "all 0.15s",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "0.1rem",
                      }}
                    >
                      <span style={{ fontSize: boardWidth < 360 ? "0.9rem" : "1.1rem" }}>{checked ? "✓" : key === "checks" ? "♟" : key === "captures" ? "⚔" : "⚠"}</span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ color: "#475569", fontSize: boardWidth < 360 ? "0.62rem" : "0.7rem", textAlign: "center" }}>
                {cctMode === "enforced" ? "Tap each after mentally scanning - board unlocks when all 3 confirmed" : "Tap each after mentally scanning"}
              </div>
            </>
          )}
        </div>
      )}

      {/* CCT nudge - flashes when they try to move before completing CCT (enforced mode) */}
      {cctNudge && (
        <div style={{
          width: boardWidth, boxSizing: "border-box",
          backgroundColor: "#1a1000", border: "2px solid #f59e0b",
          borderRadius: "8px", padding: "0.5rem 1rem", textAlign: "center",
          color: "#f59e0b", fontSize: "0.82rem", fontWeight: "700",
        }}>
          ⚡ Complete CCT first - tap Checks, Captures, and Threats below
        </div>
      )}

      {/* Amber banner - suggested mode, user moved without scanning CCT */}
      {amberBanner && !cctContextCard && (
        <div style={{
          width: boardWidth, boxSizing: "border-box",
          backgroundColor: "#1a1200", border: "1px solid #f59e0b",
          borderRadius: "8px", padding: "0.5rem 1rem", textAlign: "center",
          color: "#f59e0b", fontSize: "0.8rem", lineHeight: 1.5,
        }}>
          Before your next move, try scanning Checks → Captures → Threats first.
        </div>
      )}

      {/* Contextual post-puzzle CCT reinforcement */}
      {cctContextCard && (
        <div style={{
          width: boardWidth,
          boxSizing: "border-box",
          backgroundColor:
            cctContextCard.tone === "used" ? "#0d2218" :
            cctContextCard.tone === "ignored" ? "#1a1200" :
            "#0d1a2a",
          border: `1px solid ${
            cctContextCard.tone === "used" ? "#4ade80" :
            cctContextCard.tone === "ignored" ? "#f59e0b" :
            "#60a5fa"
          }`,
          borderRadius: "10px",
          padding: "0.85rem 1rem",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}>
          <div>
            <div style={{
              color:
                cctContextCard.tone === "used" ? "#4ade80" :
                cctContextCard.tone === "ignored" ? "#f59e0b" :
                "#93c5fd",
              fontSize: "0.84rem",
              fontWeight: 700,
              marginBottom: "0.25rem",
            }}>
              {cctContextCard.title}
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "0.8rem", lineHeight: 1.55 }}>
              {cctContextCard.body}
            </div>
          </div>
          <button
            onClick={() => setCctContextCard(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: "1rem",
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* CCT slide-up tip - shown after first wrong move, non-blocking */}
      {showCCTSlideUp && !cctContextCard && (
        <div style={{
          width: boardWidth, boxSizing: "border-box",
          backgroundColor: "#0d1a2a", border: "1px solid #2e75b6",
          borderRadius: "10px", padding: "0.85rem 1rem",
          display: "flex", alignItems: "flex-start", gap: "0.75rem",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#93c5fd", fontSize: "0.82rem", lineHeight: 1.6 }}>
              💡 Top players scan <span style={{ color: "#e2e8f0" }}>Checks</span>,{" "}
              <span style={{ color: "#e2e8f0" }}>Captures</span> &amp;{" "}
              <span style={{ color: "#e2e8f0" }}>Threats</span> before moving - it catches patterns like this one.
              Try the CCT buttons above before your next move.
            </div>
          </div>
          <button
            onClick={() => {
              try { localStorage.setItem("ctt_cct_tutorial_seen", "true"); } catch { /* ignore */ }
              setShowCCTSlideUp(false);
            }}
            style={{
              backgroundColor: "transparent", border: "none",
              color: "#475569", fontSize: "1.1rem", cursor: "pointer",
              padding: "0", lineHeight: 1, flexShrink: 0,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Mobile only: puzzle info below board */}
      {!isDesktop && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.78rem", color: "#475569" }}>
          <span>Rating: <span style={{ color: "#94a3b8" }}>{puzzleData.rating}</span></span>
          <span>•</span>
          <span>{orientation === "white" ? "White to move" : "Black to move"}</span>
        </div>
      )}
      </div>{/* end right column */}

      {/* CCT Info Modal */}
      <CCTInfoModal open={cctInfoOpen} onClose={() => setCctInfoOpen(false)} />
    </div>
  );
}

// ── Blunder Board ───────────────────────────────────────────────────────────

interface BlunderBoardProps {
  puzzleData: BlunderData;
  onResult: (correct: boolean) => void;
}

function BlunderBoard({ puzzleData, onResult }: BlunderBoardProps) {
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const resultCalledRef = useRef(false);

  const [boardWidth, setBoardWidth] = useState(320);
  useEffect(() => {
    function getWidth() {
      const vw = typeof window !== "undefined" ? window.innerWidth : 320;
      if (vw < 640) return Math.min(vw - 16, 320);
      return 340;
    }
    setBoardWidth(getWidth());
    const handler = () => setBoardWidth(getWidth());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  function handleChoice(idx: number) {
    if (revealed) return;
    setSelectedChoice(idx);
    setRevealed(true);
    const correct = idx === puzzleData.correctChoiceIndex;
    if (!resultCalledRef.current) {
      resultCalledRef.current = true;
      // Give them 800ms to see the result before onResult triggers next puzzle
      setTimeout(() => onResult(correct), 800);
    }
  }

  const choiceLabels = ["A", "B", "C"];
  const isCorrect = selectedChoice === puzzleData.correctChoiceIndex;

  // Build highlight squares: blue dots for choices, green/red after reveal
  const highlightSquares: Record<string, { background: string; borderRadius: string }> = {};
  const squares = puzzleData.choiceSquares ?? [];
  squares.forEach((sq, idx) => {
    if (!sq) return;
    const isThis = selectedChoice === idx;
    const thisCorrect = idx === puzzleData.correctChoiceIndex;
    if (revealed) {
      if (thisCorrect) {
        highlightSquares[sq] = { background: "rgba(74,222,128,0.6)", borderRadius: "50%" };
      } else if (isThis) {
        highlightSquares[sq] = { background: "rgba(239,68,68,0.6)", borderRadius: "50%" };
      } else {
        highlightSquares[sq] = { background: "rgba(148,163,184,0.25)", borderRadius: "50%" };
      }
    } else {
      highlightSquares[sq] = { background: "rgba(96,165,250,0.55)", borderRadius: "50%" };
    }
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Prompt */}
      <div style={{ textAlign: "center", padding: "0.5rem 0" }}>
        <div style={{ color: "#ef4444", fontWeight: "700", fontSize: "0.88rem", marginBottom: "0.15rem" }}>
          Blunder alert
        </div>
        <div style={{ color: "#64748b", fontSize: "0.78rem" }}>
          {revealed
            ? isCorrect ? "✓ Safe move - you avoided the blunder" : `✗ That's the blunder - ${puzzleData.blunderExplanation}`
            : "Tap the square you would play to - one of these moves loses material"}
        </div>
      </div>

      {/* Board with highlighted destination squares - user clicks a square */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ChessBoard
          fen={puzzleData.fen}
          draggable={false}
          boardWidth={boardWidth}
          orientation={puzzleData.fen.includes(" b ") ? "black" : "white"}
          highlightSquares={highlightSquares}
          onMove={(from, to) => {
            if (revealed) return false;
            const idx = squares.indexOf(to);
            if (idx === -1) return false;
            handleChoice(idx);
            return false; // don't apply the move visually
          }}
        />
      </div>
    </div>
  );
}

// ── Feedback Overlay ────────────────────────────────────────────────────────

interface FeedbackOverlayProps {
  correct: boolean;
  masteryAwarded: boolean;
  overTimeLimit: boolean;
  newMasteryHits: number;
}

// ── Correct Banner (solid bar above board, fully visible) ──────────────────
function CorrectBanner({ masteryAwarded, overTimeLimit, newMasteryHits }: Omit<FeedbackOverlayProps, 'correct'>) {
  const isFullMastery = masteryAwarded && newMasteryHits >= 3;
  if (isFullMastery) {
    return (
      <div style={{
        backgroundColor: "#0a1f12", border: "1px solid #4ade80", borderRadius: "10px",
        padding: "0.65rem 1rem", textAlign: "center",
        color: "#4ade80", fontWeight: "700", fontSize: "0.95rem",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem",
      }}>
        <span style={{ fontSize: "1.2rem" }}>★</span> Mastered! <MasteryDots hits={3} size={11} />
      </div>
    );
  }
  if (masteryAwarded) {
    return (
      <div style={{
        backgroundColor: "#0a1f12", border: "1px solid #4ade80", borderRadius: "10px",
        padding: "0.65rem 1rem", textAlign: "center",
        color: "#4ade80", fontWeight: "700", fontSize: "0.95rem",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem",
      }}>
        <span>✓ Correct</span> <MasteryDots hits={newMasteryHits} size={11} />
        <span style={{ color: "#22c55e", fontSize: "0.78rem", fontWeight: "normal" }}>+1 mastery hit</span>
      </div>
    );
  }
  return (
    <div style={{
      backgroundColor: "#0a1f12", border: "1px solid #22c55e",
      borderRadius: "10px", padding: "0.65rem 1rem", textAlign: "center",
      color: "#4ade80", fontWeight: "700", fontSize: "0.95rem",
    }}>
      ✓ {overTimeLimit ? "Correct - solve faster for mastery" : "Correct!"}
    </div>
  );
}

function FeedbackOverlay({ correct, masteryAwarded, overTimeLimit, newMasteryHits }: FeedbackOverlayProps) {
  // Slim banner - no modal, no text wall
  const isFullMastery = masteryAwarded && newMasteryHits >= 3;

  if (!correct) {
    return (
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        backgroundColor: "rgba(239,68,68,0.15)", borderBottom: "2px solid #ef4444",
        textAlign: "center", padding: "0.4rem",
        color: "#ef4444", fontWeight: "700", fontSize: "0.88rem", zIndex: 20,
      }}>
        ✗ Wrong
      </div>
    );
  }

  if (isFullMastery) {
    return (
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        backgroundColor: "rgba(74,222,128,0.15)", borderBottom: "2px solid #4ade80",
        textAlign: "center", padding: "0.4rem",
        color: "#4ade80", fontWeight: "700", fontSize: "0.88rem", zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
      }}>
        ✓ Mastered! <MasteryDots hits={3} size={10} />
      </div>
    );
  }

  if (masteryAwarded) {
    return (
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        backgroundColor: "rgba(74,222,128,0.12)", borderBottom: "2px solid #22c55e",
        textAlign: "center", padding: "0.4rem",
        color: "#4ade80", fontWeight: "700", fontSize: "0.88rem", zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
      }}>
        ✓ Correct <MasteryDots hits={newMasteryHits} size={10} />
      </div>
    );
  }

  // Correct but no mastery (over time or non-consecutive)
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0,
      backgroundColor: "rgba(74,222,128,0.08)", borderBottom: "1px solid #22c55e40",
      textAlign: "center", padding: "0.4rem",
      color: "#22c55e", fontWeight: "600", fontSize: "0.88rem", zIndex: 20,
    }}>
      ✓ Correct
    </div>
  );
}

// ── Sidebar Puzzle Settings Button + Popup ──────────────────────────────────
function SidebarPuzzleSettings() {
  const [open, setOpen] = useState(false);
  const [cctMode, setCctModeState] = useState<CCTMode>(() => getCCTMode());
  const [timerLimit, setTimerLimitState] = useState<number>(() => loadPuzzleSettings().timeLimit);

  function handleCCTMode(v: CCTMode) {
    setCctModeState(v);
    saveCCTMode(v);
  }

  function handleTimerLimit(v: number) {
    setTimerLimitState(v);
    const current = loadPuzzleSettings();
    savePuzzleSettings({ ...current, timeLimit: v });
    // Notify TacticBoard in same tab
    window.dispatchEvent(new CustomEvent("ctt_puzzle_settings_changed"));
  }

  const cctOptions: Array<{ value: CCTMode; label: string }> = [
    { value: "off", label: "Off" },
    { value: "suggested", label: "Suggested" },
    { value: "enforced", label: "Enforced" },
  ];

  const timerOptions: Array<{ value: number; label: string }> = [
    { value: 0, label: "Off" },
    { value: 5, label: "5s" },
    { value: 10, label: "10s" },
    { value: 15, label: "15s" },
    { value: 30, label: "30s" },
  ];

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          backgroundColor: "transparent", border: "1px solid #2e3a5c",
          borderRadius: "6px", padding: "0.45rem 0.6rem",
          color: open ? "#4ade80" : "#475569",
          fontSize: "0.78rem", cursor: "pointer", textAlign: "left",
          width: "100%",
        }}
      >
        ⚙ Puzzle Settings
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0,
            backgroundColor: "#13132b", border: "1px solid #2e3a5c",
            borderRadius: "10px", padding: "0.85rem 1rem", zIndex: 100,
            minWidth: "220px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            <div style={{ color: "#94a3b8", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
              Puzzle Settings
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <div style={{ color: "#e2e8f0", fontSize: "0.82rem", fontWeight: "600", marginBottom: "0.15rem" }}>CCT Mode</div>
              <div style={{ color: "#475569", fontSize: "0.72rem", marginBottom: "0.5rem" }}>Checks · Captures · Threats</div>
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {cctOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleCCTMode(opt.value)}
                    style={{
                      flex: 1, padding: "0.3rem 0.25rem", borderRadius: "5px", fontSize: "0.72rem",
                      fontWeight: cctMode === opt.value ? 700 : 400,
                      cursor: "pointer",
                      backgroundColor: cctMode === opt.value ? (opt.value === "suggested" ? "rgba(74,222,128,0.15)" : "rgba(46,117,182,0.2)") : "transparent",
                      color: cctMode === opt.value ? (opt.value === "suggested" ? "#4ade80" : "#60a5fa") : "#64748b",
                      border: `1px solid ${cctMode === opt.value ? (opt.value === "suggested" ? "#4ade80" : "#2e75b6") : "#2e3a5c"}`,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Timer setting */}
            <div style={{ marginTop: "0.65rem", paddingTop: "0.65rem", borderTop: "1px solid #1e2a3a" }}>
              <div style={{ color: "#e2e8f0", fontSize: "0.82rem", fontWeight: "600", marginBottom: "0.15rem" }}>Timer</div>
              <div style={{ color: "#475569", fontSize: "0.72rem", marginBottom: "0.5rem" }}>Countdown per puzzle</div>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                {timerOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleTimerLimit(opt.value)}
                    style={{
                      padding: "0.3rem 0.4rem", borderRadius: "5px", fontSize: "0.72rem",
                      fontWeight: timerLimit === opt.value ? 700 : 400,
                      cursor: "pointer",
                      backgroundColor: timerLimit === opt.value ? "rgba(74,222,128,0.15)" : "transparent",
                      color: timerLimit === opt.value ? "#4ade80" : "#64748b",
                      border: `1px solid ${timerLimit === opt.value ? "#4ade80" : "#2e3a5c"}`,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {timerLimit === 10 && (
                <div style={{ color: "#475569", fontSize: "0.68rem", marginTop: "0.35rem" }}>
                  ⭐ 10s = mastery standard
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid #1e2a3a", marginTop: "0.65rem", paddingTop: "0.65rem" }}>
              <a href="/app/settings" style={{ color: "#4ade80", fontSize: "0.78rem", textDecoration: "none" }}>
                All Settings →
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Quick Settings Popup ────────────────────────────────────────────────────
interface QuickSettingsProps {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  anchorLeft?: boolean;
}
function QuickSettings({ open: openProp, setOpen: setOpenProp, anchorLeft }: QuickSettingsProps = {}) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp !== undefined ? openProp : openInternal;
  const setOpen = setOpenProp ?? setOpenInternal;
  const [cctMode, setCctModeState] = useState<CCTMode>(() => getCCTMode());

  function handleCCTMode(v: CCTMode) {
    setCctModeState(v);
    saveCCTMode(v);
  }

  const cctOptions: Array<{ value: CCTMode; label: string }> = [
    { value: "off", label: "Off" },
    { value: "suggested", label: "Suggested" },
    { value: "enforced", label: "Enforced" },
  ];

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        title="Quick Settings"
        style={{ background: "none", border: "none", color: open ? "#4ade80" : "#475569", fontSize: "1rem", cursor: "pointer", padding: "0.2rem", lineHeight: 1 }}
      >
        ⚙️
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          {/* Popup */}
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", ...(anchorLeft ? { left: 0 } : { right: 0 }),
            backgroundColor: "#13132b", border: "1px solid #2e3a5c",
            borderRadius: "10px", padding: "0.85rem 1rem", zIndex: 100,
            minWidth: "230px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            <div style={{ color: "#94a3b8", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
              Puzzle Settings
            </div>
            {/* CCT mode selector */}
            <div style={{ marginBottom: "0.5rem" }}>
              <div style={{ color: "#e2e8f0", fontSize: "0.82rem", fontWeight: "600", marginBottom: "0.15rem" }}>CCT Mode</div>
              <div style={{ color: "#475569", fontSize: "0.72rem", marginBottom: "0.5rem" }}>Checks · Captures · Threats</div>
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {cctOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleCCTMode(opt.value)}
                    style={{
                      flex: 1, padding: "0.3rem 0.25rem", borderRadius: "5px", fontSize: "0.72rem",
                      fontWeight: cctMode === opt.value ? 700 : 400,
                      cursor: "pointer",
                      backgroundColor: cctMode === opt.value ? (opt.value === "suggested" ? "rgba(74,222,128,0.15)" : "rgba(46,117,182,0.2)") : "transparent",
                      color: cctMode === opt.value ? (opt.value === "suggested" ? "#4ade80" : "#60a5fa") : "#64748b",
                      border: `1px solid ${cctMode === opt.value ? (opt.value === "suggested" ? "#4ade80" : "#2e75b6") : "#2e3a5c"}`,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ borderTop: "1px solid #1e2a3a", marginTop: "0.65rem", paddingTop: "0.65rem" }}>
              <a href="/app/settings" style={{ color: "#4ade80", fontSize: "0.78rem", textDecoration: "none" }}>
                All Settings →
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Session Complete Screen ─────────────────────────────────────────────────

interface SessionCompleteProps {
  dailyGoal: number;
  dailyCompleted: number;
  masteredCount: number;
  sessionCorrect: number;
  sessionTotal: number;
  sessionUnder10s: number;
  sessionNewMastered: number;
  missedCount: number;
  streak: number;
  onContinue: () => void;
  onReviewMissed: () => void;
}

function SessionCompleteScreen({
  dailyGoal,
  dailyCompleted,
  masteredCount,
  sessionCorrect,
  sessionTotal,
  sessionUnder10s,
  sessionNewMastered,
  missedCount,
  streak,
  onContinue,
  onReviewMissed,
}: SessionCompleteProps) {
  const accuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0;
  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Summary card - celebratory */}
      <div style={{
        backgroundColor: "#0d2218", border: "1px solid #4ade80",
        borderRadius: "16px", padding: "2rem", textAlign: "center",
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>✓</div>
        <h2 style={{ color: "#4ade80", fontSize: "1.4rem", fontWeight: "900", margin: "0 0 1.25rem" }}>
          Session Complete!
        </h2>
        {/* Big stats row */}
        <div style={{ display: "flex", justifyContent: "center", gap: "1.75rem", marginBottom: "1rem" }}>
          <div>
            <div style={{ color: "#e2e8f0", fontSize: "2.25rem", fontWeight: "900", lineHeight: 1 }}>{sessionTotal}</div>
            <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>puzzles</div>
          </div>
          <div style={{ width: "1px", backgroundColor: "#1a3a2a", alignSelf: "stretch" }} />
          <div>
            <div style={{ color: accuracy >= 70 ? "#4ade80" : accuracy >= 50 ? "#f59e0b" : "#ef4444", fontSize: "2.25rem", fontWeight: "900", lineHeight: 1 }}>{accuracy}%</div>
            <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>accuracy</div>
          </div>
          <div style={{ width: "1px", backgroundColor: "#1a3a2a", alignSelf: "stretch" }} />
          <div>
            <div style={{ color: "#4ade80", fontSize: "2.25rem", fontWeight: "900", lineHeight: 1 }}>+{sessionNewMastered}</div>
            <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>mastered</div>
          </div>
        </div>
        <div style={{ color: "#475569", fontSize: "0.82rem", marginBottom: streak > 1 ? "0.75rem" : 0 }}>
          {sessionCorrect}/{sessionTotal} correct · {dailyCompleted}/{dailyGoal} daily goal
        </div>
        {streak > 1 && (
          <div style={{
            display: "inline-block",
            backgroundColor: "#1a1000",
            border: "1px solid #f97316",
            borderRadius: "20px",
            padding: "0.3rem 1rem",
            color: "#f97316",
            fontSize: "0.88rem",
            fontWeight: "700",
          }}>
            🔥 Day {streak} streak
          </div>
        )}
      </div>

      {/* Secondary stats */}
      <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "16px", padding: "1.25rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.65rem" }}>
          {[
            { label: "Under 10s", value: `${sessionUnder10s}/${sessionTotal}`, color: "#60a5fa" },
            { label: "Set progress", value: `${masteredCount}/100`, color: "#e2e8f0" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              backgroundColor: "#0d1621", border: "1px solid #1e3a5c",
              borderRadius: "10px", padding: "0.75rem", textAlign: "center",
            }}>
              <div style={{ color: "#475569", fontSize: "0.7rem", textTransform: "uppercase", marginBottom: "0.3rem" }}>{label}</div>
              <div style={{ color, fontSize: "1.2rem", fontWeight: "bold" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{
          backgroundColor: "#0d1621", border: "1px solid #1e3a5c",
          borderRadius: "10px", padding: "0.85rem", textAlign: "center",
          color: "#64748b", fontSize: "0.88rem",
        }}>
          Come back tomorrow to keep your streak!
        </div>
        {missedCount > 0 && (
          <button
            onClick={onReviewMissed}
            style={{
              backgroundColor: "#1a1a2e", border: "1px solid #ef4444",
              borderRadius: "10px", padding: "0.75rem",
              color: "#ef4444", fontSize: "0.88rem", cursor: "pointer", width: "100%",
              fontWeight: "600",
            }}
          >
            Review {missedCount} Missed Puzzle{missedCount > 1 ? "s" : ""} →
          </button>
        )}
        <button
          onClick={onContinue}
          style={{
            backgroundColor: "transparent", border: "1px solid #2e3a5c",
            borderRadius: "10px", padding: "0.75rem",
            color: "#64748b", fontSize: "0.88rem", cursor: "pointer",
          }}
        >
          Keep Going Anyway →
        </button>
      </div>
    </div>
  );
}

// ── Set Complete Screen ─────────────────────────────────────────────────────

interface SetCompleteProps {
  set: MasterySet;
  onStartNext: () => void;
}

function SetCompleteScreen({ set, onStartNext }: SetCompleteProps) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          onStartNext();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onStartNext]);

  const daysToComplete = set.completedAt
    ? Math.max(1, Math.round((set.completedAt - set.createdAt) / 86400000))
    : 0;
  const totalAttempts = set.puzzles.reduce((s, p) => s + p.attempts, 0);
  const totalCorrect = set.puzzles.reduce((s, p) => s + p.correctAttempts, 0);
  const overallAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
  const avgTime = Math.round(set.puzzles
    .filter((p) => p.avgSolveTime > 0)
    .reduce((s, p, _, arr) => s + p.avgSolveTime / arr.length, 0) / 1000);
  const masteredInSet = set.puzzles.filter((p) => p.masteryHits >= 3).length;
  const totalInSet = set.puzzles.length;

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{
        backgroundColor: "#13132b", border: "1px solid #f59e0b",
        borderRadius: "16px", padding: "2.5rem", textAlign: "center",
      }}>
        <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🎉</div>
        <h2 style={{ color: "#f59e0b", fontSize: "1.4rem", fontWeight: "bold", margin: "0 0 0.75rem" }}>
          Set {set.setNumber} Complete!
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0, lineHeight: 1.6 }}>
          You&apos;ve mastered {masteredInSet}/{totalInSet} tactical patterns. Time to level up.
        </p>
      </div>

      <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "16px", padding: "1.5rem" }}>
        <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
          Set Stats
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
          {[
            { label: "Days", value: daysToComplete, color: "#e2e8f0" },
            { label: "Accuracy", value: `${overallAccuracy}%`, color: overallAccuracy >= 70 ? "#4ade80" : "#f59e0b" },
            { label: "Avg time", value: `${avgTime}s`, color: "#e2e8f0" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              backgroundColor: "#0d1621", border: "1px solid #1e3a5c",
              borderRadius: "10px", padding: "0.75rem", textAlign: "center",
            }}>
              <div style={{ color: "#475569", fontSize: "0.7rem", textTransform: "uppercase", marginBottom: "0.3rem" }}>{label}</div>
              <div style={{ color, fontSize: "1.3rem", fontWeight: "bold" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onStartNext}
        style={{
          backgroundColor: "#f59e0b", color: "#0f0f00",
          border: "none", borderRadius: "10px", padding: "1rem",
          fontSize: "1rem", fontWeight: "bold", cursor: "pointer",
          width: "100%",
        }}
      >
        Start Set {set.setNumber + 1} → {countdown > 0 ? `(${countdown})` : ""}
      </button>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

type Phase = "loading" | "solving" | "feedback" | "session_complete" | "set_complete";

interface FeedbackState {
  correct: boolean;
  masteryAwarded: boolean;
  overTimeLimit: boolean;
  newMasteryHits: number;
}

export default function TrainingSession() {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [masteryProgress, setMasteryProgress] = useState<MasteryProgress | null>(null);
  const [currentSet, setCurrentSet] = useState<MasterySet | null>(null);
  const [completedSet, setCompletedSet] = useState<MasterySet | null>(null);
  const [currentPuzzleIdx, setCurrentPuzzleIdx] = useState(-1);
  const [puzzleKey, setPuzzleKey] = useState(0); // force remount
  const [puzzleStartTime, setPuzzleStartTime] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [dailyGoal, setDailyGoal] = useState(10);
  const [streak, setStreak] = useState(0);

  // Session stats (reset each session)
  // Session stats - read from localStorage so they survive navigation within same day
  const [sessionCorrect, setSessionCorrect] = useState(() => {
    try { const d = localStorage.getItem("ctt_session_stats"); return d ? JSON.parse(d).correct ?? 0 : 0; } catch { return 0; }
  });
  const [sessionTotal, setSessionTotal] = useState(() => {
    try { const d = localStorage.getItem("ctt_session_stats"); return d ? JSON.parse(d).total ?? 0 : 0; } catch { return 0; }
  });
  const [sessionUnder10s, setSessionUnder10s] = useState(() => {
    try { const d = localStorage.getItem("ctt_session_stats"); return d ? JSON.parse(d).under10s ?? 0 : 0; } catch { return 0; }
  });
  const [sessionNewMastered, setSessionNewMastered] = useState(() => {
    try { const d = localStorage.getItem("ctt_session_stats"); return d ? JSON.parse(d).mastered ?? 0 : 0; } catch { return 0; }
  });
  const [dailyCompleted, setDailyCompleted] = useState(0);

  const [keepGoing, setKeepGoing] = useState(false); // bypass daily goal after "Keep going anyway"
  const [sessionMissedPuzzles, setSessionMissedPuzzles] = useState<Array<{id: string; fen: string; solution: string[]}>>([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<Array<{id: string; fen: string; solution: string[]}>>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const lastShownIdRef = useRef<string | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceFnRef = useRef<() => void>(() => {});
  const handleResultRef = useRef<(correct: boolean) => void>(() => {});
  const retryModeRef = useRef(false); // tracks retry mode to skip mastery recording
  const retryPendingRef = useRef(false); // blocks advance() when user clicked Retry
  const sessionSeenPuzzleIdsRef = useRef<Set<string>>(new Set());
  const consecutiveMissesRef = useRef(0); // tracks consecutive wrong answers for miss-streak nudge
  const missStreakNudgeShownRef = useRef(false); // show miss-streak nudge at most once per session
  const [showMissStreakNudge, setShowMissStreakNudge] = useState(false);
  const [cctContextCard, setCctContextCard] = useState<null | {
    tone: "used" | "ignored" | "missed";
    title: string;
    body: string;
  }>(null);
  const milestone5ShownRef = useRef(false); // show 5-puzzle milestone once per session
  const [showMilestone5, setShowMilestone5] = useState(false);

  // ── 5-puzzle milestone ────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionTotal === 5 && !milestone5ShownRef.current) {
      milestone5ShownRef.current = true;
      setShowMilestone5(true);
      setTimeout(() => setShowMilestone5(false), 2000);
    }
  }, [sessionTotal]);

  // ── Mount & Init ──────────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const settings = getDailyTargetSettings();
    setDailyGoal(settings.dailyGoal);
    setStreak(getStreakData().currentStreak ?? 0);
    setDailyCompleted(getDailySessionCompleted());

    // Reset session stats if it's a new day
    try {
      const saved = localStorage.getItem("ctt_session_stats");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date !== new Date().toISOString().slice(0, 10)) {
          localStorage.removeItem("ctt_session_stats");
          setSessionCorrect(0); setSessionTotal(0); setSessionUnder10s(0); setSessionNewMastered(0);
        }
      }
    } catch { /* ignore */ }

    let progress = getMasteryProgress();
    let set = getCurrentMasterySet();

    // Generate first set if none exists
    if (!set) {
      set = generateMasterySet(progress.currentSetNumber);
      progress = { ...progress, sets: [...progress.sets, set] };
      saveMasteryProgress(progress);
    }

    // ── Daily refresh: swap mastered puzzles for new ones ──────────────
    // If it's a new day, carry forward unmastered puzzles and fill the
    // remaining slots with new puzzles. This gives the behavior:
    // "Master 4 today → tomorrow get 4 new + the 6 you missed"
    const today = new Date().toISOString().slice(0, 10);
    const lastSessionDate = progress.dailySessionDate || "";
    if (lastSessionDate && lastSessionDate !== today && set && !set.completedAt) {
      const unmastered = set.puzzles.filter((p) => p.masteryHits < 3);
      if (unmastered.length < set.puzzles.length) {
        // Some puzzles were mastered - refresh the set
        const nextSetNumber = set.setNumber + 1;
        const nextSet = generateMasterySet(nextSetNumber, unmastered);
        const updatedSet = { ...set, completedAt: Date.now() };
        progress = {
          ...progress,
          sets: [...progress.sets.map((s) => s.setNumber === set!.setNumber ? updatedSet : s), nextSet],
          currentSetNumber: nextSetNumber,
          dailySessionCompleted: 0,
          dailySessionDate: today,
        };
        saveMasteryProgress(progress);
        set = nextSet;
      }
    }

    setMasteryProgress(progress);
    setCurrentSet(set);

    // Check if the set was already completed (all mastered)
    if (set.completedAt || isSetComplete()) {
      const updatedSet = { ...set, completedAt: set.completedAt ?? Date.now() };
      const nextSetNumber = set.setNumber + 1;
      const nextSet = generateMasterySet(nextSetNumber, []);
      const updatedProgress = {
        ...progress,
        sets: [...progress.sets.map((s) => s.setNumber === set!.setNumber ? updatedSet : s), nextSet],
        currentSetNumber: nextSetNumber,
      };
      saveMasteryProgress(updatedProgress);
      setMasteryProgress(updatedProgress);
      setCompletedSet(updatedSet);
      setCurrentSet(nextSet);
      setPhase("set_complete");
      return;
    }

    // Check if daily session already done
    const todayCompleted = progress.dailySessionDate === today ? progress.dailySessionCompleted : 0;
    if (todayCompleted >= settings.dailyGoal) {
      setPhase("session_complete");
      return;
    }

    // Pick first puzzle
    sessionSeenPuzzleIdsRef.current = new Set();
    const idx = pickNextPuzzleIdx(set, null, sessionSeenPuzzleIdsRef.current);
    if (idx === -1) {
      // All mastered - mark set complete
      markSetComplete(progress, set);
      return;
    }
    setCurrentPuzzleIdx(idx);
    lastShownIdRef.current = set.puzzles[idx].id;
    sessionSeenPuzzleIdsRef.current.add(set.puzzles[idx].id);
    setPuzzleStartTime(Date.now());
    setPhase("solving");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  function markSetComplete(progress: MasteryProgress, set: MasterySet) {
    const updatedSet = { ...set, completedAt: Date.now() };
    const updatedSets = progress.sets.map((s) => (s.setNumber === set.setNumber ? updatedSet : s));

    // Generate next set immediately (all puzzles mastered, nothing to carry)
    const nextSetNumber = set.setNumber + 1;
    const nextSet = generateMasterySet(nextSetNumber, []);
    const updatedProgress = {
      ...progress,
      sets: [...updatedSets, nextSet],
      currentSetNumber: nextSetNumber,
    };
    saveMasteryProgress(updatedProgress);
    setCompletedSet(updatedSet);  // used by SetCompleteScreen for display
    setCurrentSet(nextSet);       // ready to solve when user advances
    setMasteryProgress(updatedProgress);
    setPhase("set_complete");
  }

  // ── Handle puzzle result ───────────────────────────────────────────────────
  const handleResult = useCallback((correct: boolean) => {
    if (!currentSet || currentPuzzleIdx < 0) return;

    const solveTimeMs = Date.now() - puzzleStartTime;
    const puzzle = currentSet.puzzles[currentPuzzleIdx];
    const isRetry = retryModeRef.current;
    retryModeRef.current = false;

    let masteryHits = puzzle.masteryHits;
    let masteryAwarded = false;
    const overTimeLimit = correct && solveTimeMs >= MASTERY_TIME_LIMIT_MS;
    let freshSet = currentSet;
    let freshProgress = getMasteryProgress();
    let newDailyCount = 0;

    if (!isRetry) {
    // Record attempt and get updated mastery
    const result = recordMasteryAttempt(puzzle.id, correct, solveTimeMs);
    masteryHits = result.masteryHits;
    masteryAwarded = result.masteryAwarded;

    // Update local set state from storage
    const fp = getMasteryProgress();
    const fs = fp.sets.find((s) => s.setNumber === currentSet.setNumber) ?? currentSet;
    setCurrentSet(fs);
    setMasteryProgress(fp);
    freshSet = fs;
    freshProgress = fp;

    // Update session stats and persist to localStorage
    setSessionTotal((t: number) => {
      const newT = t + 1;
      setSessionCorrect((c: number) => {
        const newC = correct ? c + 1 : c;
        setSessionUnder10s((u: number) => {
          const newU = correct && solveTimeMs < MASTERY_TIME_LIMIT_MS ? u + 1 : u;
          setSessionNewMastered((m: number) => {
            const newM = (masteryAwarded && masteryHits === 3) ? m + 1 : m;
            try { localStorage.setItem("ctt_session_stats", JSON.stringify({ correct: newC, total: newT, under10s: newU, mastered: newM, date: new Date().toISOString().slice(0,10) })); } catch { /* ignore */ }
            return newM;
          });
          return newU;
        });
        return newC;
      });
      return newT;
    });

    if (puzzle.type === "tactic" && puzzle.puzzleData) {
      const pd = puzzle.puzzleData as { fen: string; solution: string[] };
      if (!correct) {
        // Add to missed if not already there
        setSessionMissedPuzzles((prev) => {
          if (prev.some((p) => p.id === puzzle.id)) return prev;
          return [...prev, { id: puzzle.id, fen: pd.fen, solution: pd.solution }];
        });
      } else if (isRetry) {
        // Solved on retry - remove from missed list
        setSessionMissedPuzzles((prev) => prev.filter((p) => p.id !== puzzle.id));
      }
    }

    newDailyCount = incrementDailySession();
    setDailyCompleted(newDailyCount);
    recordActivityToday();

    // Miss-streak nudge: track consecutive wrong answers (suggested mode only)
    if (correct) {
      consecutiveMissesRef.current = 0;
    } else {
      consecutiveMissesRef.current += 1;
      if (
        consecutiveMissesRef.current >= 3 &&
        getCCTMode() === "suggested" &&
        !missStreakNudgeShownRef.current
      ) {
        missStreakNudgeShownRef.current = true;
        setShowMissStreakNudge(true);
      }
    }

    // Track completed sessions for TrainingPlan upgrade nudge
    if (newDailyCount === getDailyTargetSettings().dailyGoal) {
      incrementCCTSessionCount();
    }
    } // end if (!isRetry)

    // Show feedback
    setFeedback({ correct, masteryAwarded, overTimeLimit, newMasteryHits: masteryHits });
    setPhase("feedback");

    // Build advance function (reused for auto-advance on correct, or user-triggered on wrong)
    const advance = () => {
      // Block if user clicked Retry
      if (retryPendingRef.current) {
        retryPendingRef.current = false;
        return;
      }
      setFeedback(null);
      setCctContextCard(null);

      const settings = getDailyTargetSettings();

      // Check set complete
      if (freshSet.puzzles.every((p) => p.masteryHits >= 3)) {
        markSetComplete(freshProgress, freshSet);
        return;
      }

      // Check daily session complete - skip if user chose "Keep going anyway"
      if (newDailyCount >= settings.dailyGoal && !keepGoing) {
        setPhase("session_complete");
        return;
      }

      // Load next puzzle
      const nextIdx = pickNextPuzzleIdx(freshSet, lastShownIdRef.current, sessionSeenPuzzleIdsRef.current);
      if (nextIdx === -1) {
        markSetComplete(freshProgress, freshSet);
        return;
      }
      lastShownIdRef.current = freshSet.puzzles[nextIdx].id;
      sessionSeenPuzzleIdsRef.current.add(freshSet.puzzles[nextIdx].id);
      setCurrentPuzzleIdx(nextIdx);
      setPuzzleKey((k) => k + 1);
      setPuzzleStartTime(Date.now());
      setPhase("solving");
    };

    advanceFnRef.current = advance;

    if (correct || puzzle.type !== "tactic") {
      // Auto-advance after 1.5s for correct answers and wrong blunder answers
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(advance, 1500);
    }
    // Wrong tactic answers: wait for user to choose via review panel buttons
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSet, currentPuzzleIdx, puzzleStartTime]);

  // Keep ref always pointing to latest handleResult so TacticBoard never calls a stale closure
  handleResultRef.current = handleResult;
  const stableHandleResult = useCallback((correct: boolean) => handleResultRef.current(correct), []);

  // ── Handle advance (called by TacticBoard review panel) ───────────────────
  function handleAdvance() {
    advanceFnRef.current();
  }

  // ── Handle retry (called by TacticBoard review panel) ─────────────────────
  function handleRetry() {
    // Clear any pending auto-advance timeout - must happen before anything else
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = null;
    // Set retry mode - handleResult will skip mastery recording on next solve
    retryModeRef.current = true;
    // Clear feedback overlay
    setFeedback(null);
    setPhase("solving");
    // DO NOT bump puzzleKey - TacticBoard's onClick already resets its own internal state
    // (fen, moveIndex, status, resultCalledRef, hasScoredRef) before calling onRetry()
    // Bumping puzzleKey causes a remount which races with the internal reset
  }

  // ── Handle "keep going" after session complete ─────────────────────────────
  function handleContinue() {
    if (!currentSet || !masteryProgress) return;
    setKeepGoing(true); // bypass daily goal for rest of session
    const freshSet = getCurrentMasterySet() ?? currentSet;
    const nextIdx = pickNextPuzzleIdx(freshSet, lastShownIdRef.current, sessionSeenPuzzleIdsRef.current);
    if (nextIdx === -1) {
      markSetComplete(masteryProgress, freshSet);
      return;
    }
    lastShownIdRef.current = freshSet.puzzles[nextIdx].id;
    sessionSeenPuzzleIdsRef.current.add(freshSet.puzzles[nextIdx].id);
    setCurrentPuzzleIdx(nextIdx);
    setPuzzleKey((k) => k + 1);
    setPuzzleStartTime(Date.now());
    setPhase("solving");
  }

  // ── Handle start next set ─────────────────────────────────────────────────
  // Next set was already generated and saved in markSetComplete; just start solving it.
  function handleStartNextSet() {
    if (!currentSet) return;
    setSessionCorrect(0);
    setSessionTotal(0);
    setSessionUnder10s(0);
    setSessionNewMastered(0);
    setDailyCompleted(0);

    const idx = pickNextPuzzleIdx(currentSet, null);
    if (idx === -1) return;
    setCurrentPuzzleIdx(idx);
    lastShownIdRef.current = currentSet.puzzles[idx].id;
    setPuzzleKey((k) => k + 1);
    setPuzzleStartTime(Date.now());
    setPhase("solving");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!mounted || phase === "loading") {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "3rem", textAlign: "center", color: "#64748b" }}>
        Loading your training set...
      </div>
    );
  }

  const masteredCount = getMasteredCount();

  if (phase === "set_complete" && completedSet) {
    return <SetCompleteScreen set={completedSet} onStartNext={handleStartNextSet} />;
  }

  if (phase === "session_complete") {
    return (
      <SessionCompleteScreen
        dailyGoal={dailyGoal}
        dailyCompleted={dailyCompleted}
        masteredCount={masteredCount}
        sessionCorrect={sessionCorrect}
        sessionTotal={sessionTotal}
        sessionUnder10s={sessionUnder10s}
        sessionNewMastered={sessionNewMastered}
        missedCount={sessionMissedPuzzles.length}
        streak={streak}
        onContinue={handleContinue}
        onReviewMissed={() => {
          if (sessionMissedPuzzles.length === 0) return;
          setReviewQueue([...sessionMissedPuzzles]);
          setReviewIdx(0);
          setReviewMode(true);
          setShowAnalysis(false);
          setPhase("solving");
          setKeepGoing(true);
        }}
      />
    );
  }

  const puzzle = currentSet?.puzzles[currentPuzzleIdx];
  if (!puzzle || !currentSet) {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "3rem", textAlign: "center", color: "#64748b" }}>
        Loading puzzle...
      </div>
    );
  }

  const setNumber = currentSet.setNumber;
  const totalPuzzles = currentSet.puzzles.length;

  const milestone5Accuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* 5-puzzle milestone overlay */}
      {showMilestone5 && (
        <div style={{
          position: "fixed", top: "1.5rem", left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, backgroundColor: "#0d2218", border: "2px solid #4ade80",
          borderRadius: "12px", padding: "0.85rem 1.75rem",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem",
          boxShadow: "0 4px 24px rgba(74, 222, 128, 0.25)",
          animation: "slideDown 0.3s ease",
        }}>
          <div style={{ color: "#4ade80", fontSize: "1.1rem", fontWeight: "bold" }}>
            🔥 5 puzzles in a row
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            {milestone5Accuracy}% accuracy
          </div>
        </div>
      )}
      {/* Feedback overlay - rendered inside puzzle card below */}

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: "#13132b", border: "1px solid #2e3a5c",
        borderRadius: "10px", padding: "0.65rem 1rem",
        display: "flex", alignItems: "center", gap: "0.5rem",
        flexWrap: "wrap", fontSize: "0.82rem",
      }}>
        {/* Set badge */}
        <span style={{
          backgroundColor: "#1e3a5c", color: "#60a5fa",
          borderRadius: "6px", padding: "0.2rem 0.55rem",
          fontSize: "0.78rem", fontWeight: "bold", whiteSpace: "nowrap",
        }}>
          Set {setNumber}
        </span>

        {/* Mastered count */}
        <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>
          <span style={{ color: "#4ade80", fontWeight: "bold" }}>{masteredCount}</span>
          <span style={{ color: "#475569" }}>/{totalPuzzles} mastered</span>
        </span>

        <span style={{ color: "#2e3a5c" }}>·</span>

        {/* Session */}
        <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>
          Session:{" "}
          <span style={{ color: "#f59e0b", fontWeight: "bold" }}>{dailyCompleted}</span>
          <span style={{ color: "#475569" }}>/{dailyGoal} today</span>
        </span>

        {/* Streak */}
        {streak > 0 && (
          <>
            <span style={{ color: "#2e3a5c" }}>·</span>
            <span style={{ color: "#f97316", fontWeight: "bold", whiteSpace: "nowrap" }}>
              🔥 {streak}
            </span>
          </>
        )}

        {/* Progress bar fills remaining space */}
        <div style={{ flex: 1, minWidth: "60px" }}>
          <ProgressBar value={masteredCount} max={totalPuzzles} color="#4ade80" />
        </div>

        {/* Quick Settings moved to left sidebar */}
      </div>

      {/* Miss-streak nudge - shown when user gets 3+ wrong in a row (suggested mode only) */}
      {showMissStreakNudge && (
        <div style={{
          backgroundColor: "#0d1621", border: "1px solid #f59e0b",
          borderRadius: "8px", padding: "0.65rem 1rem",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
        }}>
          <div style={{ color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.5 }}>
            💡 Try enabling CCT scanning - it helps catch these patterns before you move.
          </div>
          <button
            onClick={() => setShowMissStreakNudge(false)}
            style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "1rem", flexShrink: 0, padding: "0.1rem" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Puzzle area ──────────────────────────────────────────────────────── */}
      {/* Correct feedback - solid bar ABOVE the board card, fully visible */}
      {phase === "feedback" && feedback && feedback.correct && (
        <CorrectBanner
          masteryAwarded={feedback.masteryAwarded}
          overTimeLimit={feedback.overTimeLimit}
          newMasteryHits={feedback.newMasteryHits}
        />
      )}

      <div style={{
        backgroundColor: "#13132b", border: "1px solid #2e3a5c",
        borderRadius: "12px", padding: "1.25rem 0", position: "relative", overflow: "hidden",
      }}>
        {puzzle.type === "tactic" ? (
          <TacticBoard
            key={`tactic_${puzzleKey}`}
            puzzleData={puzzle.puzzleData}
            onResult={stableHandleResult}
            onAdvance={handleAdvance}
            onRetry={handleRetry}
            onCctUnlocked={() => setPuzzleStartTime(Date.now())}
            showAnalysis={showAnalysis}
            onAnalyzeClick={() => {
              if (phase === "solving") {
                handleResultRef.current(false);
              }
              setShowAnalysis((v) => !v);
            }}
          />
        ) : (
          <BlunderBoard
            key={`blunder_${puzzleKey}`}
            puzzleData={puzzle.puzzleData}
            onResult={stableHandleResult}
          />
        )}
      </div>

      {/* Analyze with Engine - moved to left sidebar on desktop */}
      {showAnalysis && puzzle.type === "tactic" && puzzle.puzzleData && (
        <div style={{ maxWidth: "900px" }}>
          <StockfishAnalysis
            fen={(puzzle.puzzleData as {fen: string}).fen}
            orientation={(puzzle.puzzleData as {fen: string}).fen.includes(" b ") ? "black" : "white"}
            onClose={() => setShowAnalysis(false)}
          />
        </div>
      )}

      {/* Review mode indicator */}
      {reviewMode && (
        <div style={{
          textAlign: "center", color: "#f59e0b", fontSize: "0.72rem", fontWeight: "700",
          textTransform: "uppercase", letterSpacing: "0.06em", padding: "0.4rem",
        }}>
          Review Mode - Missed Puzzle {reviewIdx + 1}/{reviewQueue.length}
        </div>
      )}
    </div>
  );
}
