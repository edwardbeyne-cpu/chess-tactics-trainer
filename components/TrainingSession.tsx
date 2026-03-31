"use client";

/**
 * Sprint 36 — Mastery Set Training System
 * 100-puzzle sets; each puzzle needs 3 correct solves under 10s (non-consecutive) to master.
 * Mix of tactic puzzles (~80%) and blunder-resistance positions (~20%).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import ChessBoard from "@/components/ChessBoard";
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
  correctChoiceIndex: number;
  blunderExplanation: string;
  patternTag: string;
}

const BLUNDER_EXPLANATIONS: Record<string, string[]> = {
  fork: ["Taking that piece walks into a knight fork — you'd lose material", "Capturing there allows a fork on the next move"],
  pin: ["That move abandons the pinned piece — the opponent takes for free", "Moving that way walks into an absolute pin"],
  skewer: ["That move allows a skewer — your king runs, opponent takes the piece behind", "Retreating there sets up a skewer"],
  backRankMate: ["That greedy capture removes the back rank defender — checkmate follows", "Moving that piece exposes a back rank mate"],
  deflection: ["That move deflects your defender — leaving a key square unprotected"],
  overloading: ["That move overloads your piece — it can't defend two targets at once"],
  default: [
    "That greedy capture walks into a tactic — always check your opponent's responses",
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
    { san: safeSan, isSafe: true },
    { san: blunderSan, isSafe: false },
    { san: neutralSan, isSafe: false },
  ]);

  const NOISE_TAGS = new Set(["short", "long", "middlegame", "endgame", "opening", "master",
    "masterVsMaster", "advantage", "crushing", "equality", "mate", "mateIn1", "mateIn2",
    "mateIn3", "mateIn4", "mateIn5", "sacrifice"]);

  return {
    fen: afterOppFen,
    choices: rawChoices.map((c) => c.san),
    correctChoiceIndex: rawChoices.findIndex((c) => c.isSafe),
    blunderExplanation: getBlunderExplanation(raw.themes),
    patternTag: raw.themes.find((t) => !NOISE_TAGS.has(t)) ?? "tactics",
  };
}

// ── Set Generation ─────────────────────────────────────────────────────────

function computeBlunderRatio(): number {
  try {
    // Check calibration rating — high-rated players get fewer blunders
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

export function generateMasterySet(setNumber: number): MasterySet {
  const calibRaw = localStorage.getItem("ctt_calibration_rating");
  const calibrationRating = calibRaw ? Math.max(400, parseInt(calibRaw, 10) || 800) : 800;
  const targetELO = calibrationRating + (setNumber - 1) * 100;
  const blunderRatio = computeBlunderRatio();
  const blunderCount = Math.round(100 * blunderRatio);
  const tacticCount = 100 - blunderCount;

  const usedIds = new Set<string>();
  const puzzles: MasteryPuzzle[] = [];

  // ── Tactic puzzles ──────────────────────────────────────────────────────
  const allThemes = Object.keys(cachedPuzzlesByTheme);

  // Identify weak patterns (lowest solve-rate with enough data)
  const patternStats = getAllPatternStats();
  const weakestThemes = patternStats
    .filter((s) => s.totalAttempts >= 3)
    .sort((a, b) => a.solveRate - b.solveRate)
    .slice(0, 3)
    .map((s) => s.theme.toLowerCase());

  const weakTacticTarget = Math.round(tacticCount * 0.5);
  const spreadTacticTarget = tacticCount - weakTacticTarget;

  // Select from weak patterns (50% of tactic slots)
  if (weakestThemes.length > 0) {
    const perWeak = Math.ceil(weakTacticTarget / weakestThemes.length);
    for (const theme of weakestThemes) {
      const pool = cachedPuzzlesByTheme[theme] ?? [];
      const eligible = pool.filter((p) => Math.abs(p.rating - targetELO) <= 200 && !usedIds.has(p.id));
      const source = shuffleArray(eligible.length > 0 ? eligible : pool.filter((p) => !usedIds.has(p.id)));
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
  while (puzzles.filter((p) => p.type === "tactic").length < tacticCount && otherIdx < otherThemes.length * 5) {
    const theme = otherThemes[otherIdx % otherThemes.length];
    otherIdx++;
    const pool = cachedPuzzlesByTheme[theme] ?? [];
    const eligible = pool.filter((p) => Math.abs(p.rating - targetELO) <= 200 && !usedIds.has(p.id));
    const source = eligible.length > 0 ? eligible : pool.filter((p) => !usedIds.has(p.id));
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

  return {
    setNumber,
    createdAt: Date.now(),
    completedAt: null,
    targetELO,
    puzzles: shuffleArray(puzzles).slice(0, 100),
    blunderRatio,
  };
}

// ── Puzzle Selection ────────────────────────────────────────────────────────

/**
 * Pick the next puzzle to show from the set.
 * - Skip mastered puzzles (masteryHits === 3)
 * - Prefer lowest masteryHits (0 → 1 → 2)
 * - Avoid the puzzle that was just shown
 * Returns the index into set.puzzles, or -1 if all mastered.
 */
function pickNextPuzzleIdx(set: MasterySet, lastShownId: string | null): number {
  const candidates = set.puzzles
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.masteryHits < 3 && p.id !== lastShownId);

  if (candidates.length === 0) {
    // All (other) puzzles mastered — check if last puzzle is also mastered
    const allMastered = set.puzzles.every((p) => p.masteryHits >= 3);
    if (allMastered) return -1;
    // Only one unmastered puzzle left — show it even if it was just shown
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

// ── Tactic Board ────────────────────────────────────────────────────────────

interface TacticBoardProps {
  puzzleData: { fen: string; solution: string[]; rating: number; theme: string };
  onResult: (correct: boolean) => void;
}

function TacticBoard({ puzzleData, onResult }: TacticBoardProps) {
  const [fen, setFen] = useState(puzzleData.fen);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<"solve" | "solved" | "failed">("solve");
  const sideToMove = puzzleData.fen.includes(" b ") ? "Black" : "White";
  const [message, setMessage] = useState(`${sideToMove} to move — find the tactic`);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const resultCalledRef = useRef(false);
  const hasScoredRef = useRef(false);

  const [boardWidth, setBoardWidth] = useState(520);
  useEffect(() => {
    function getWidth() {
      const vw = typeof window !== "undefined" ? window.innerWidth : 520;
      if (vw < 640) return Math.min(vw - 16, 480);
      if (vw <= 1024) return Math.min(640, Math.floor(vw * 0.92));
      return Math.min(660, Math.floor(vw * 0.62));
    }
    setBoardWidth(getWidth());
    const handler = () => setBoardWidth(getWidth());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const orientation = puzzleData.fen.includes(" b ") ? "black" : "white";

  function handleMove(from: string, to: string): boolean {
    if (status !== "solve") return false;

    const expectedUci = puzzleData.solution[moveIndex];
    const expFrom = expectedUci.slice(0, 2);
    const expTo = expectedUci.slice(2, 4);
    const isCorrect = from === expFrom && to === expTo;

    if (!isCorrect) {
      setMessage("Wrong move — try again!");
      if (!hasScoredRef.current) {
        hasScoredRef.current = true;
        setTimeout(() => {
          if (!resultCalledRef.current) {
            resultCalledRef.current = true;
            onResult(false);
          }
        }, 800);
      }
      return false;
    }

    try {
      const chess = new Chess(fen);
      const promotion = expectedUci.length === 5 ? expectedUci[4] : undefined;
      chess.move({ from, to, promotion });
      const newFen = chess.fen();
      setFen(newFen);
      setLastMove([from, to]);

      const nextIndex = moveIndex + 1;
      if (nextIndex >= puzzleData.solution.length) {
        setStatus("solved");
        setMessage("Correct!");
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
          setMessage("Keep going — find the next move!");
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
      <div style={{
        fontSize: "0.9rem", fontWeight: 500, color: msgColor,
        padding: "0.5rem 1rem", backgroundColor: "#0d1621", borderRadius: "8px",
        border: `1px solid ${msgBorder}`, textAlign: "center",
        width: "100%", maxWidth: `${boardWidth}px`, boxSizing: "border-box",
      }}>
        {message}
      </div>
      <ChessBoard
        fen={fen}
        onMove={handleMove}
        lastMove={lastMove}
        draggable={status === "solve"}
        boardWidth={boardWidth}
        orientation={orientation as "white" | "black"}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.78rem", color: "#475569" }}>
        <span>Puzzle rating: <span style={{ color: "#94a3b8" }}>{puzzleData.rating}</span></span>
        <span>•</span>
        <span>{orientation === "white" ? "White to move" : "Black to move"}</span>
      </div>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Prompt */}
      <div style={{
        backgroundColor: "#0d0606", border: "1px solid #3a1a1a", borderRadius: "10px",
        padding: "0.75rem 1rem", textAlign: "center",
      }}>
        <div style={{ color: "#ef4444", fontWeight: "bold", fontSize: "0.88rem", marginBottom: "0.2rem" }}>
          Blunder Alert — find the safe move
        </div>
        <div style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
          One of these moves is a blunder. Choose the correct / safe move.
        </div>
      </div>

      {/* Board — orient to side that needs to find the safe move (active side in FEN) */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ChessBoard
          fen={puzzleData.fen}
          draggable={false}
          boardWidth={boardWidth}
          orientation={puzzleData.fen.includes(" b ") ? "black" : "white"}
        />
      </div>

      {/* Choices */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {puzzleData.choices.map((choice, idx) => {
          const isThis = selectedChoice === idx;
          const thisCorrect = idx === puzzleData.correctChoiceIndex;
          let bg = "#1a1a2e", border = "#2e3a5c", color = "#e2e8f0";
          if (revealed) {
            if (thisCorrect) { bg = "#0a1f12"; border = "#4ade80"; color = "#4ade80"; }
            else if (isThis && !thisCorrect) { bg = "#1f0a0a"; border = "#ef4444"; color = "#ef4444"; }
            else { color = "#475569"; border = "#1e2a3c"; }
          } else if (isThis) {
            bg = "#1e3a5c"; border = "#2e75b6";
          }
          return (
            <button
              key={idx}
              onClick={() => handleChoice(idx)}
              disabled={revealed}
              style={{
                width: "100%", backgroundColor: bg, border: `2px solid ${border}`,
                borderRadius: "10px", padding: "0.75rem 1rem", color,
                fontSize: "0.9rem", fontWeight: "bold", cursor: revealed ? "default" : "pointer",
                textAlign: "left", display: "flex", alignItems: "center", gap: "0.75rem",
              }}
            >
              <span style={{
                backgroundColor: revealed && thisCorrect ? "#4ade80" : revealed && isThis && !thisCorrect ? "#ef4444" : "#2e3a5c",
                color: revealed && (thisCorrect || (isThis && !thisCorrect)) ? "#0f0f1a" : "#94a3b8",
                borderRadius: "6px", width: "26px", height: "26px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.78rem", fontWeight: "bold", flexShrink: 0,
              }}>
                {choiceLabels[idx]}
              </span>
              <span>{choice}</span>
              {revealed && thisCorrect && <span style={{ marginLeft: "auto" }}>✓</span>}
              {revealed && isThis && !thisCorrect && <span style={{ marginLeft: "auto" }}>✗</span>}
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      {revealed && (
        <div style={{
          padding: "1rem", backgroundColor: isCorrect ? "#0a1f12" : "#1f0a0a",
          border: `1px solid ${isCorrect ? "#4ade80" : "#ef4444"}40`, borderRadius: "10px",
        }}>
          {isCorrect ? (
            <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.9rem" }}>
              Safe move found!
            </div>
          ) : (
            <>
              <div style={{ color: "#ef4444", fontWeight: "bold", fontSize: "0.9rem", marginBottom: "0.25rem" }}>
                That&apos;s the blunder
              </div>
              <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                {puzzleData.blunderExplanation}
              </div>
            </>
          )}
        </div>
      )}
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

function FeedbackOverlay({ correct, masteryAwarded, overTimeLimit, newMasteryHits }: FeedbackOverlayProps) {
  let bgColor = "#0a1520";
  let borderColor = "#1e3a5c";
  let mainText = "";
  let subText = "";

  if (!correct) {
    bgColor = "#1a0808"; borderColor = "#5c1e1e";
    mainText = "Mastery reset";
    subText = "A wrong answer resets this puzzle's mastery hits";
  } else if (masteryAwarded) {
    bgColor = "#0a1f12"; borderColor = "#4ade80";
    mainText = "Mastery point!";
    subText = `${newMasteryHits}/3 mastery hits`;
  } else if (overTimeLimit) {
    bgColor = "#0a1228"; borderColor = "#3b82f6";
    mainText = "Correct — solve faster for mastery";
    subText = "Under 10 seconds earns a mastery point";
  } else {
    // correct, under limit, but non-consecutive rule blocked
    bgColor = "#0a1228"; borderColor = "#3b82f6";
    mainText = "Correct!";
    subText = "Solve other puzzles first for non-consecutive mastery";
  }

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        backgroundColor: bgColor, border: `2px solid ${borderColor}`,
        borderRadius: "16px", padding: "2rem", textAlign: "center", maxWidth: "320px", width: "90%",
      }}>
        <div style={{
          fontSize: "1.5rem", fontWeight: "bold",
          color: !correct ? "#ef4444" : masteryAwarded ? "#4ade80" : "#60a5fa",
          marginBottom: "0.5rem",
        }}>
          {mainText}
        </div>
        <div style={{ color: "#94a3b8", fontSize: "0.88rem", marginBottom: "1rem" }}>
          {subText}
        </div>
        {correct && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <MasteryDots hits={newMasteryHits} size={16} />
          </div>
        )}
      </div>
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
  onContinue: () => void;
}

function SessionCompleteScreen({
  dailyGoal,
  dailyCompleted,
  masteredCount,
  sessionCorrect,
  sessionTotal,
  sessionUnder10s,
  sessionNewMastered,
  onContinue,
}: SessionCompleteProps) {
  const accuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0;
  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{
        backgroundColor: "#13132b", border: "1px solid #4ade80",
        borderRadius: "16px", padding: "2rem", textAlign: "center",
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✓</div>
        <h2 style={{ color: "#4ade80", fontSize: "1.3rem", fontWeight: "bold", margin: "0 0 0.5rem" }}>
          Session complete!
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>
          {dailyCompleted}/{dailyGoal} puzzles today
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "16px", padding: "1.5rem" }}>
        <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
          Session Stats
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
          {[
            { label: "Mastered today", value: `+${sessionNewMastered}`, color: "#4ade80" },
            { label: "Accuracy", value: `${accuracy}%`, color: accuracy >= 70 ? "#4ade80" : accuracy >= 50 ? "#f59e0b" : "#ef4444" },
            { label: "Under 10s", value: `${sessionUnder10s}/${sessionTotal}`, color: "#60a5fa" },
            { label: "Set progress", value: `${masteredCount}/100`, color: "#e2e8f0" },
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

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{
          backgroundColor: "#0d1621", border: "1px solid #1e3a5c",
          borderRadius: "10px", padding: "0.85rem", textAlign: "center",
          color: "#64748b", fontSize: "0.88rem",
        }}>
          Come back tomorrow to keep your streak!
        </div>
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
  const daysToComplete = set.completedAt
    ? Math.max(1, Math.round((set.completedAt - set.createdAt) / 86400000))
    : 0;
  const totalAttempts = set.puzzles.reduce((s, p) => s + p.attempts, 0);
  const totalCorrect = set.puzzles.reduce((s, p) => s + p.correctAttempts, 0);
  const overallAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
  const avgTime = Math.round(set.puzzles
    .filter((p) => p.avgSolveTime > 0)
    .reduce((s, p, _, arr) => s + p.avgSolveTime / arr.length, 0) / 1000);

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
          You&apos;ve mastered 100 tactical patterns. Time to level up.
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
        Start Set {set.setNumber + 1} →
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
  const [currentPuzzleIdx, setCurrentPuzzleIdx] = useState(-1);
  const [puzzleKey, setPuzzleKey] = useState(0); // force remount
  const [puzzleStartTime, setPuzzleStartTime] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [dailyGoal, setDailyGoal] = useState(10);
  const [streak, setStreak] = useState(0);

  // Session stats (reset each session)
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionUnder10s, setSessionUnder10s] = useState(0);
  const [sessionNewMastered, setSessionNewMastered] = useState(0);
  const [dailyCompleted, setDailyCompleted] = useState(0);

  const [keepGoing, setKeepGoing] = useState(false); // bypass daily goal after "Keep going anyway"
  const lastShownIdRef = useRef<string | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    let progress = getMasteryProgress();
    let set = getCurrentMasterySet();

    // Generate first set if none exists
    if (!set || set.puzzles.length < 100) {
      set = generateMasterySet(progress.currentSetNumber);
      progress = { ...progress, sets: [...progress.sets, set] };
      saveMasteryProgress(progress);
    }

    setMasteryProgress(progress);
    setCurrentSet(set);

    // Check if the set was already completed
    if (set.completedAt || isSetComplete()) {
      setPhase("set_complete");
      return;
    }

    // Check if daily session already done
    const today = new Date().toISOString().slice(0, 10);
    const todayCompleted = progress.dailySessionDate === today ? progress.dailySessionCompleted : 0;
    if (todayCompleted >= settings.dailyGoal) {
      setPhase("session_complete");
      return;
    }

    // Pick first puzzle
    const idx = pickNextPuzzleIdx(set, null);
    if (idx === -1) {
      // All mastered — mark set complete
      markSetComplete(progress, set);
      return;
    }
    setCurrentPuzzleIdx(idx);
    lastShownIdRef.current = set.puzzles[idx].id;
    setPuzzleStartTime(Date.now());
    setPhase("solving");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  function markSetComplete(progress: MasteryProgress, set: MasterySet) {
    const updatedSet = { ...set, completedAt: Date.now() };
    const updatedSets = progress.sets.map((s) => (s.setNumber === set.setNumber ? updatedSet : s));
    const updatedProgress = { ...progress, sets: updatedSets };
    saveMasteryProgress(updatedProgress);
    setCurrentSet(updatedSet);
    setMasteryProgress(updatedProgress);
    setPhase("set_complete");
  }

  // ── Handle puzzle result ───────────────────────────────────────────────────
  const handleResult = useCallback((correct: boolean) => {
    if (!currentSet || currentPuzzleIdx < 0) return;

    const solveTimeMs = Date.now() - puzzleStartTime;
    const puzzle = currentSet.puzzles[currentPuzzleIdx];

    // Record attempt and get updated mastery
    const { masteryHits, masteryAwarded } = recordMasteryAttempt(puzzle.id, correct, solveTimeMs);
    const overTimeLimit = correct && solveTimeMs >= MASTERY_TIME_LIMIT_MS;

    // Update local set state from storage
    const freshProgress = getMasteryProgress();
    const freshSet = freshProgress.sets.find((s) => s.setNumber === currentSet.setNumber) ?? currentSet;
    setCurrentSet(freshSet);
    setMasteryProgress(freshProgress);

    // Update session stats
    setSessionTotal((t) => t + 1);
    if (correct) {
      setSessionCorrect((c) => c + 1);
      if (solveTimeMs < MASTERY_TIME_LIMIT_MS) setSessionUnder10s((u) => u + 1);
    }
    if (masteryAwarded && masteryHits === 3) {
      setSessionNewMastered((m) => m + 1);
    }

    // Increment daily count
    const newDailyCount = incrementDailySession();
    setDailyCompleted(newDailyCount);
    recordActivityToday();

    // Show feedback
    setFeedback({ correct, masteryAwarded, overTimeLimit, newMasteryHits: masteryHits });
    setPhase("feedback");

    // After 1.5s, advance
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);

      const settings = getDailyTargetSettings();

      // Check set complete
      if (freshSet.puzzles.every((p) => p.masteryHits >= 3)) {
        markSetComplete(freshProgress, freshSet);
        return;
      }

      // Check daily session complete — skip if user chose "Keep going anyway"
      if (newDailyCount >= settings.dailyGoal && !keepGoing) {
        setPhase("session_complete");
        return;
      }

      // Load next puzzle
      const nextIdx = pickNextPuzzleIdx(freshSet, lastShownIdRef.current);
      if (nextIdx === -1) {
        markSetComplete(freshProgress, freshSet);
        return;
      }
      lastShownIdRef.current = freshSet.puzzles[nextIdx].id;
      setCurrentPuzzleIdx(nextIdx);
      setPuzzleKey((k) => k + 1);
      setPuzzleStartTime(Date.now());
      setPhase("solving");
    }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSet, currentPuzzleIdx, puzzleStartTime]);

  // ── Handle "keep going" after session complete ─────────────────────────────
  function handleContinue() {
    if (!currentSet || !masteryProgress) return;
    setKeepGoing(true); // bypass daily goal for rest of session
    const freshSet = getCurrentMasterySet() ?? currentSet;
    const nextIdx = pickNextPuzzleIdx(freshSet, lastShownIdRef.current);
    if (nextIdx === -1) {
      markSetComplete(masteryProgress, freshSet);
      return;
    }
    lastShownIdRef.current = freshSet.puzzles[nextIdx].id;
    setCurrentPuzzleIdx(nextIdx);
    setPuzzleKey((k) => k + 1);
    setPuzzleStartTime(Date.now());
    setPhase("solving");
  }

  // ── Handle start next set ─────────────────────────────────────────────────
  function handleStartNextSet() {
    if (!masteryProgress) return;
    const nextSetNumber = (currentSet?.setNumber ?? 0) + 1;
    const newSet = generateMasterySet(nextSetNumber);
    const updatedProgress: MasteryProgress = {
      ...masteryProgress,
      currentSetNumber: nextSetNumber,
      sets: [...masteryProgress.sets, newSet],
      dailySessionCompleted: 0,
      dailySessionDate: new Date().toISOString().slice(0, 10),
    };
    saveMasteryProgress(updatedProgress);
    setMasteryProgress(updatedProgress);
    setCurrentSet(newSet);
    setSessionCorrect(0);
    setSessionTotal(0);
    setSessionUnder10s(0);
    setSessionNewMastered(0);
    setDailyCompleted(0);

    const idx = pickNextPuzzleIdx(newSet, null);
    if (idx === -1) return;
    setCurrentPuzzleIdx(idx);
    lastShownIdRef.current = newSet.puzzles[idx].id;
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

  if (phase === "set_complete" && currentSet) {
    return <SetCompleteScreen set={currentSet} onStartNext={handleStartNextSet} />;
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
        onContinue={handleContinue}
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

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Feedback overlay */}
      {phase === "feedback" && feedback && (
        <FeedbackOverlay
          correct={feedback.correct}
          masteryAwarded={feedback.masteryAwarded}
          overTimeLimit={feedback.overTimeLimit}
          newMasteryHits={feedback.newMasteryHits}
        />
      )}

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
      </div>

      {/* ── Puzzle area ──────────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: "#13132b", border: "1px solid #2e3a5c",
        borderRadius: "12px", padding: "1.25rem",
      }}>
        {puzzle.type === "tactic" ? (
          <TacticBoard
            key={`tactic_${puzzleKey}`}
            puzzleData={puzzle.puzzleData}
            onResult={handleResult}
          />
        ) : (
          <BlunderBoard
            key={`blunder_${puzzleKey}`}
            puzzleData={puzzle.puzzleData}
            onResult={handleResult}
          />
        )}
      </div>

      {/* ── Mastery dots ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem",
        backgroundColor: "#13132b", border: "1px solid #1e2a3a",
        borderRadius: "10px", padding: "0.75rem",
      }}>
        <MasteryDots hits={puzzle.masteryHits} size={14} />
        <div style={{ color: "#475569", fontSize: "0.75rem" }}>
          Solve in under 10s to earn a mastery point
        </div>
      </div>
    </div>
  );
}
