"use client";

/**
 * Sprint 32 — Training Session Component
 * Serves the user's weak patterns in order, 30 puzzles per pattern at their ELO level.
 * Clean, focused mode: NO thinking framework, NO verbalization, NO confidence overlay, NO fatigue detection.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import ChessBoard from "@/components/ChessBoard";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";
import {
  getAllPatternStats,
  getPatternRatings,
  updatePatternRating,
  updateTacticsRating,
  recordSM2Attempt,
  recordActivityToday,
  getActivityLog,
  getTacticsRatingData,
  type PatternStat,
} from "@/lib/storage";

// ── Constants ──────────────────────────────────────────────────────────────

const TRAINING_SESSION_KEY = "ctt_training_session";
const CUSTOM_ANALYSIS_KEY = "ctt_custom_analysis";

const THEME_KEY_TO_LABEL: Record<string, string> = {
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discoveredAttack: "Discovered Attack",
  backRankMate: "Back Rank Mate",
  smotheredMate: "Smothered Mate",
  doubleCheck: "Double Check",
  overloading: "Overloading",
  deflection: "Deflection",
  interference: "Interference",
  zugzwang: "Zugzwang",
  attraction: "Attraction",
  clearance: "Clearance",
  trappedPiece: "Trapped Piece",
  discoveredCheck: "Discovered Check",
  kingsideAttack: "Kingside Attack",
  queensideAttack: "Queenside Attack",
};

// Map UPPERCASE theme names to theme keys
const THEME_NAME_TO_KEY: Record<string, string> = {
  "FORK": "fork",
  "PIN": "pin",
  "SKEWER": "skewer",
  "DISCOVERED ATTACK": "discoveredAttack",
  "BACK RANK MATE": "backRankMate",
  "BACK RANK": "backRankMate",
  "SMOTHERED MATE": "smotheredMate",
  "DOUBLE CHECK": "doubleCheck",
  "OVERLOADING": "overloading",
  "DEFLECTION": "deflection",
  "INTERFERENCE": "interference",
  "ZUGZWANG": "zugzwang",
  "ATTRACTION": "attraction",
  "CLEARANCE": "clearance",
  "TRAPPED PIECE": "trappedPiece",
  "DISCOVERED CHECK": "discoveredCheck",
  "KINGSIDE ATTACK": "kingsideAttack",
  "QUEENSIDE ATTACK": "queensideAttack",
};

// ── Types ──────────────────────────────────────────────────────────────────

interface TrainingPattern {
  theme: string;     // lowercase theme key e.g. "fork"
  label: string;     // display name e.g. "Fork"
  target: number;    // number of puzzles for this pattern
  completed: number;
  correct: number;
  startRating: number; // ELO at session start (for improvement display)
}

interface TrainingSessionData {
  sessionDate: string;
  patterns: TrainingPattern[];
  startedAt: string;
  completedAt: string | null;
}

interface TrainingPuzzle {
  id: string;
  fen: string;          // after first opponent move applied
  solution: string[];   // remaining moves to play
  rating: number;
  theme: string;        // theme key
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function applyFirstMove(fen: string, moves: string[]): { fen: string; solution: string[] } {
  if (!moves || moves.length < 2) return { fen, solution: moves };
  try {
    const chess = new Chess(fen);
    const opponentMove = moves[0];
    const from = opponentMove.slice(0, 2);
    const to = opponentMove.slice(2, 4);
    const promotion = opponentMove.length === 5 ? opponentMove[4] : undefined;
    chess.move({ from, to, promotion });
    return { fen: chess.fen(), solution: moves.slice(1) };
  } catch {
    return { fen, solution: moves };
  }
}

function getPatternElo(themeKey: string): number {
  try {
    const ratings = getPatternRatings();
    if (ratings[themeKey]?.rating) return ratings[themeKey].rating;
    // Feature 2: for uncalibrated users, default calibration = 800 → pattern start = 650
    const calibRating = parseInt(localStorage.getItem("ctt_calibration_rating") ?? "0") || 800;
    return Math.max(600, calibRating - 150);
  } catch {
    return 650;
  }
}

function loadSessionFromStorage(): TrainingSessionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TRAINING_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as TrainingSessionData;
    // Reset if it's a different day
    if (session.sessionDate !== getTodayKey()) return null;
    return session;
  } catch {
    return null;
  }
}

function saveSessionToStorage(session: TrainingSessionData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRAINING_SESSION_KEY, JSON.stringify(session));
}

function getWeakPatterns(count = 3): Array<{ theme: string; label: string; elo: number }> {
  // Check custom analysis (Chess.com game analysis) first
  try {
    const customAnalysis = localStorage.getItem(CUSTOM_ANALYSIS_KEY);
    if (customAnalysis) {
      const analysis = JSON.parse(customAnalysis) as { weakPatterns?: string[] };
      if (analysis.weakPatterns && analysis.weakPatterns.length > 0) {
        return analysis.weakPatterns.slice(0, count).map((theme) => {
          const key = THEME_NAME_TO_KEY[theme.toUpperCase()] ?? theme.toLowerCase();
          return {
            theme: key,
            label: THEME_KEY_TO_LABEL[key] ?? theme,
            elo: getPatternElo(key),
          };
        });
      }
    }
  } catch {
    // ignore
  }

  // Fall back to patterns with lowest ELO from ctt_pattern_ratings
  const ratings = getPatternRatings();
  const allThemeKeys = Object.keys(cachedPuzzlesByTheme);

  const ratingEntries = allThemeKeys.map((key) => ({
    theme: key,
    label: THEME_KEY_TO_LABEL[key] ?? key,
    elo: ratings[key]?.rating ?? 1000,
  }));

  // Also check ctt_sm2_attempts patterns with lowest accuracy
  const patternStats: PatternStat[] = getAllPatternStats();
  const statsWithData = patternStats.filter((s) => s.totalAttempts >= 3);

  if (statsWithData.length >= count) {
    // Sort by solve rate ascending (weakest first)
    const sorted = [...statsWithData].sort((a, b) => a.solveRate - b.solveRate);
    return sorted.slice(0, count).map((s) => {
      const key = THEME_NAME_TO_KEY[s.theme.toUpperCase()] ?? s.theme.toLowerCase();
      return {
        theme: key,
        label: THEME_KEY_TO_LABEL[key] ?? s.theme,
        elo: getPatternElo(key),
      };
    });
  }

  // Not enough data — use lowest ELO patterns
  return ratingEntries
    .sort((a, b) => a.elo - b.elo)
    .slice(0, count);
}

function buildNewSession(): TrainingSessionData {
  const weakPatterns = getWeakPatterns(3);
  const patterns: TrainingPattern[] = weakPatterns.map((p, i) => ({
    theme: p.theme,
    label: p.label,
    target: i === 0 ? 30 : 15,
    completed: 0,
    correct: 0,
    startRating: p.elo,
  }));

  return {
    sessionDate: getTodayKey(),
    patterns,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

function getSessionTotalTarget(session: TrainingSessionData): number {
  return session.patterns.reduce((sum, p) => sum + p.target, 0);
}

function getSessionTotalCompleted(session: TrainingSessionData): number {
  return session.patterns.reduce((sum, p) => sum + p.completed, 0);
}

function loadPuzzleForPattern(
  themeKey: string,
  userElo: number,
  excludeIds?: Set<string>,
): TrainingPuzzle | null {
  const pool = cachedPuzzlesByTheme[themeKey];
  if (!pool || pool.length === 0) return null;

  // Exclude already-used puzzles; fall back to full pool only when exhausted
  const available =
    excludeIds && excludeIds.size > 0
      ? pool.filter((p) => !excludeIds.has(p.id))
      : pool;
  const workingPool = available.length > 0 ? available : pool;

  // ELO-range-constrained selection: ±150, expanding to ±300, then ±500
  const narrow = workingPool.filter((p) => Math.abs(p.rating - userElo) <= 150);
  const mid    = workingPool.filter((p) => Math.abs(p.rating - userElo) <= 300);
  const wide   = workingPool.filter((p) => Math.abs(p.rating - userElo) <= 500);
  const selected =
    narrow.length >= 3 ? narrow :
    mid.length >= 1    ? mid    :
    wide.length >= 1   ? wide   : workingPool;
  const raw = selected[Math.floor(Math.random() * selected.length)];

  const { fen, solution } = applyFirstMove(raw.fen, raw.moves);
  return { id: raw.id, fen, solution, rating: raw.rating, theme: themeKey };
}

function hasSufficientData(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sm2 = JSON.parse(localStorage.getItem("ctt_sm2_attempts") || "[]") as unknown[];
    return sm2.length >= 20;
  } catch {
    return false;
  }
}

function hasChessComConnected(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("ctt_custom_username");
}

// ── Progress Bar ───────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = "#4ade80" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{
      backgroundColor: "#0f0f1a",
      borderRadius: "999px",
      height: "8px",
      overflow: "hidden",
      border: "1px solid #1e2a3a",
      flex: 1,
    }}>
      <div style={{
        height: "100%",
        backgroundColor: color,
        borderRadius: "999px",
        width: `${pct}%`,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

// ── Inline Puzzle Board ────────────────────────────────────────────────────

interface TrainingPuzzleBoardProps {
  puzzle: TrainingPuzzle;
  onResult: (correct: boolean) => void;
  patternLabel?: string;
}

function TrainingPuzzleBoard({ puzzle, onResult, patternLabel }: TrainingPuzzleBoardProps & { patternLabel?: string }) {
  const [fen, setFen] = useState(puzzle.fen);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<"solve" | "solved" | "failed">("solve");
  const contextMsg = patternLabel
    ? `Training: ${patternLabel} — find the ${patternLabel.toLowerCase()} tactic`
    : "Find the winning move!";
  const [message, setMessage] = useState(contextMsg);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [firstTry, setFirstTry] = useState(true);
  const resultCalledRef = useRef(false);
  const hasScoredRef = useRef(false);

  // Board sizing — Sprint 33: use more horizontal space
  const [boardWidth, setBoardWidth] = useState(520);
  useEffect(() => {
    function getWidth() {
      if (typeof window === "undefined") return 520;
      const vw = window.innerWidth;
      if (vw < 640) return Math.min(vw - 16, 480);
      if (vw <= 1024) return Math.min(640, Math.floor(vw * 0.92));
      return Math.min(660, Math.floor(vw * 0.62));
    }
    setBoardWidth(getWidth());
    const handler = () => setBoardWidth(getWidth());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Reset when puzzle changes
  useEffect(() => {
    setFen(puzzle.fen);
    setMoveIndex(0);
    setStatus("solve");
    setMessage(patternLabel
      ? `Training: ${patternLabel} — find the ${patternLabel.toLowerCase()} tactic`
      : "Find the winning move!");
    setLastMove(undefined);
    setFirstTry(true);
    resultCalledRef.current = false;
    hasScoredRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id]);

  const orientation = puzzle.fen.includes(" b ") ? "black" : "white";

  function handleMove(from: string, to: string): boolean {
    if (status !== "solve") return false;

    const expectedUci = puzzle.solution[moveIndex];
    const expFrom = expectedUci.slice(0, 2);
    const expTo = expectedUci.slice(2, 4);

    const isCorrect = from === expFrom && to === expTo;

    if (!isCorrect) {
      setMessage("❌ Wrong move — try again!");
      setFirstTry(false);
      if (!hasScoredRef.current) {
        hasScoredRef.current = true;
        // Score as failed immediately on first wrong move
        setTimeout(() => {
          if (!resultCalledRef.current) {
            resultCalledRef.current = true;
            onResult(false);
          }
        }, 800);
      }
      return false;
    }

    // Apply the player's move
    try {
      const chess = new Chess(fen);
      const promotion = expectedUci.length === 5 ? expectedUci[4] : undefined;
      chess.move({ from, to, promotion });
      const newFen = chess.fen();
      setFen(newFen);
      setLastMove([from, to]);

      const nextIndex = moveIndex + 1;

      // Check if there are more solution moves (opponent response + our next move)
      if (nextIndex >= puzzle.solution.length) {
        // Puzzle complete!
        setStatus("solved");
        setMessage("✅ Correct! Well done.");
        if (!resultCalledRef.current) {
          resultCalledRef.current = true;
          onResult(firstTry);
        }
        return true;
      }

      // Apply opponent's response move
      const opponentUci = puzzle.solution[nextIndex];
      const opFrom = opponentUci.slice(0, 2);
      const opTo = opponentUci.slice(2, 4);
      const opPromotion = opponentUci.length === 5 ? opponentUci[4] : undefined;

      setTimeout(() => {
        try {
          const chess2 = new Chess(newFen);
          chess2.move({ from: opFrom, to: opTo, promotion: opPromotion });
          setFen(chess2.fen());
          setLastMove([opFrom, opTo]);
          setMoveIndex(nextIndex + 1);
          setMessage("Keep going — find the next move!");
        } catch {
          // If opponent move fails, consider puzzle solved
          setStatus("solved");
          setMessage("✅ Correct! Well done.");
          if (!resultCalledRef.current) {
            resultCalledRef.current = true;
            onResult(firstTry);
          }
        }
      }, 400);

      setMoveIndex(nextIndex);
      return true;
    } catch {
      return false;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
      {/* Status message */}
      <div style={{
        fontSize: "0.9rem",
        fontWeight: "500",
        color: status === "solved" ? "#4ade80" : status === "failed" ? "#ef4444" : "#e2e8f0",
        padding: "0.5rem 1rem",
        backgroundColor: "#0d1621",
        borderRadius: "8px",
        border: `1px solid ${status === "solved" ? "#4ade80" : status === "failed" ? "#ef4444" : "#2e3a5c"}`,
        textAlign: "center",
        width: "100%",
        maxWidth: `${boardWidth}px`,
        boxSizing: "border-box",
      }}>
        {message}
      </div>

      {/* Board */}
      <ChessBoard
        fen={fen}
        onMove={handleMove}
        lastMove={lastMove}
        draggable={status === "solve"}
        boardWidth={boardWidth}
        orientation={orientation as "white" | "black"}
      />

      {/* Rating badge */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        fontSize: "0.78rem",
        color: "#475569",
      }}>
        <span>Puzzle rating: <span style={{ color: "#94a3b8" }}>{puzzle.rating}</span></span>
        <span>•</span>
        <span>{orientation === "white" ? "⬜ White to move" : "⬛ Black to move"}</span>
      </div>
    </div>
  );
}

// ── Main TrainingSession Component ─────────────────────────────────────────

export default function TrainingSession() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<TrainingSessionData | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentPatternIdx, setCurrentPatternIdx] = useState(0);
  const [currentPuzzle, setCurrentPuzzle] = useState<TrainingPuzzle | null>(null);
  const [loadingPuzzle, setLoadingPuzzle] = useState(false);
  const [transition, setTransition] = useState<string | null>(null); // e.g. "✅ Fork complete!"
  const [sessionComplete, setSessionComplete] = useState(false);
  const [ratingImprovements, setRatingImprovements] = useState<Array<{ label: string; start: number; end: number }>>([]);
  const sessionStartTimeRef = useRef<number>(Date.now());
  // Duplicate-prevention: track puzzle IDs already shown this session
  const usedPuzzleIdsRef = useRef<Set<string>>(new Set());
  // Monotonic key — guarantees TrainingPuzzleBoard remounts on every advance
  const puzzleKeyRef = useRef<number>(0);

  // ── Mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Check if session already started today ────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    const existing = loadSessionFromStorage();
    if (existing) {
      // If session completed today, go straight to complete screen
      if (existing.completedAt) {
        setSession(existing);
        setSessionComplete(true);
        return;
      }
      // Resume in-progress session
      setSession(existing);
      setSessionStarted(true);
      // Find which pattern we're currently on
      const idx = existing.patterns.findIndex((p) => p.completed < p.target);
      setCurrentPatternIdx(idx >= 0 ? idx : 0);
      if (idx >= 0) {
        loadNextPuzzle(existing, idx);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // ── Load a puzzle for the given pattern ──────────────────────────────────
  function loadNextPuzzle(sess: TrainingSessionData, patIdx: number): void {
    const pattern = sess.patterns[patIdx];
    if (!pattern) return;
    setLoadingPuzzle(true);
    puzzleKeyRef.current += 1;          // always bump — forces remount even if same id
    const elo = getPatternElo(pattern.theme);
    const puzzle = loadPuzzleForPattern(pattern.theme, elo, usedPuzzleIdsRef.current);
    if (puzzle) usedPuzzleIdsRef.current.add(puzzle.id);
    setCurrentPuzzle(puzzle);
    setLoadingPuzzle(false);
  }

  // ── Start session ─────────────────────────────────────────────────────────
  function handleStart(): void {
    usedPuzzleIdsRef.current = new Set();   // fresh dedup set for new session
    puzzleKeyRef.current = 0;
    const newSession = buildNewSession();
    saveSessionToStorage(newSession);
    setSession(newSession);
    setSessionStarted(true);
    setCurrentPatternIdx(0);
    sessionStartTimeRef.current = Date.now();
    loadNextPuzzle(newSession, 0);
  }

  // ── Handle puzzle result ──────────────────────────────────────────────────
  const handlePuzzleResult = useCallback((correct: boolean): void => {
    if (!session) return;

    const updatedSession = { ...session, patterns: session.patterns.map((p, i) => ({ ...p })) };
    const pattern = updatedSession.patterns[currentPatternIdx];
    if (!pattern) return;

    pattern.completed += 1;
    if (correct) pattern.correct += 1;

    // Update pattern ELO (same as Drill Tactics)
    const puzzleRating = currentPuzzle?.rating ?? 1000;
    updatePatternRating(pattern.theme, puzzleRating, correct, currentPuzzle?.id ?? "unknown");
    updateTacticsRating(puzzleRating, correct);

    // Record SM2 attempt for streak/review tracking
    recordSM2Attempt({
      puzzleId: currentPuzzle?.id ?? "unknown",
      outcome: correct ? "solved-first-try" : "failed",
      timestamp: new Date().toISOString(),
      theme: pattern.theme.toUpperCase(),
      rating: puzzleRating,
    });

    recordActivityToday();
    saveSessionToStorage(updatedSession);
    setSession(updatedSession);

    // Check if this pattern is complete
    if (pattern.completed >= pattern.target) {
      // Check if all patterns are complete
      const allComplete = updatedSession.patterns.every((p) => p.completed >= p.target);

      if (allComplete) {
        // Session complete!
        setTimeout(() => handleSessionComplete(updatedSession), 500);
        return;
      }

      // Transition to next pattern
      const nextIdx = currentPatternIdx + 1;
      if (nextIdx < updatedSession.patterns.length) {
        const nextPattern = updatedSession.patterns[nextIdx];
        const transitionMsg = `✅ ${pattern.label} complete! ${pattern.target}/${pattern.target} puzzles`;
        setTransition(transitionMsg);
        setTimeout(() => {
          setTransition(null);
          setCurrentPatternIdx(nextIdx);
          loadNextPuzzle(updatedSession, nextIdx);
        }, 2000);
      }
      return;
    }

    // Load next puzzle in same pattern — 1.5s delay so user sees ✅ Correct!
    setTimeout(() => {
      loadNextPuzzle(updatedSession, currentPatternIdx);
    }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, currentPatternIdx, currentPuzzle]);

  // ── Session complete handler ───────────────────────────────────────────────
  function handleSessionComplete(completedSession: TrainingSessionData): void {
    const now = new Date().toISOString();
    completedSession.completedAt = now;
    saveSessionToStorage(completedSession);

    // Mark in activity log
    recordActivityToday();

    // Compute rating improvements
    const improvements = completedSession.patterns.map((p) => {
      const endRating = getPatternElo(p.theme);
      return { label: p.label, start: p.startRating, end: endRating };
    });
    setRatingImprovements(improvements);
    setSession(completedSession);
    setSessionComplete(true);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  if (!mounted) return null;

  const insufficient = !hasSufficientData() && !hasChessComConnected();
  const totalTarget = session ? getSessionTotalTarget(session) : 0;
  const totalCompleted = session ? getSessionTotalCompleted(session) : 0;

  // ── State A: Not enough data ──────────────────────────────────────────────
  if (!session && insufficient) {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "2.5rem",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📋</div>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.3rem", fontWeight: "bold", margin: "0 0 0.75rem" }}>
            Complete your setup first
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Connect Chess.com or solve 20 puzzles to generate your training plan.
          </p>
          <button
            onClick={() => router.push("/app/training-plan")}
            style={{
              backgroundColor: "#4ade80",
              color: "#0f1a0a",
              border: "none",
              borderRadius: "10px",
              padding: "0.85rem 1.75rem",
              fontSize: "0.95rem",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Go to Training Plan →
          </button>
        </div>
      </div>
    );
  }

  // ── State D: Session complete ─────────────────────────────────────────────
  if (sessionComplete && session) {
    const totalCorrect = session.patterns.reduce((sum, p) => sum + p.correct, 0);
    const accuracy = totalCompleted > 0 ? Math.round((totalCorrect / totalCompleted) * 100) : 0;
    const elapsedMs = session.completedAt
      ? new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
      : 0;
    const elapsedMin = Math.round(elapsedMs / 60000);

    return (
      <div style={{ maxWidth: "600px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #4ade80",
          borderRadius: "16px",
          padding: "2rem",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🎉</div>
          <h2 style={{ color: "#4ade80", fontSize: "1.4rem", fontWeight: "bold", margin: "0 0 0.5rem" }}>
            Training session complete!
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "0.88rem", margin: 0 }}>
            Great work today. Your pattern ratings have been updated.
          </p>
        </div>

        {/* Stats */}
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "1.5rem",
        }}>
          <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
            Session Stats
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
            {[
              { label: "Puzzles", value: totalCompleted, color: "#e2e8f0" },
              { label: "Accuracy", value: `${accuracy}%`, color: accuracy >= 70 ? "#4ade80" : accuracy >= 50 ? "#f59e0b" : "#ef4444" },
              { label: "Time", value: `${elapsedMin}m`, color: "#e2e8f0" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                backgroundColor: "#0d1621",
                border: "1px solid #1e3a5c",
                borderRadius: "10px",
                padding: "0.75rem",
                textAlign: "center",
              }}>
                <div style={{ color: "#475569", fontSize: "0.7rem", textTransform: "uppercase", marginBottom: "0.3rem" }}>{label}</div>
                <div style={{ color, fontSize: "1.4rem", fontWeight: "bold" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rating improvements */}
        {ratingImprovements.some((r) => r.end !== r.start) && (
          <div style={{
            backgroundColor: "#13132b",
            border: "1px solid #2e3a5c",
            borderRadius: "16px",
            padding: "1.5rem",
          }}>
            <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
              Rating Changes
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {ratingImprovements.map((r) => {
                const delta = r.end - r.start;
                return (
                  <div key={r.label} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#0d1621",
                    border: "1px solid #1e3a5c",
                    borderRadius: "8px",
                    padding: "0.6rem 1rem",
                  }}>
                    <span style={{ color: "#94a3b8", fontSize: "0.88rem" }}>{r.label}</span>
                    <span style={{ color: "#94a3b8", fontSize: "0.88rem" }}>
                      {r.start} → {r.end}
                      {delta !== 0 && (
                        <span style={{
                          color: delta > 0 ? "#4ade80" : "#ef4444",
                          marginLeft: "0.5rem",
                          fontWeight: "bold",
                          fontSize: "0.85rem",
                        }}>
                          ({delta > 0 ? "+" : ""}{delta})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => router.push("/app/training-plan")}
          style={{
            backgroundColor: "#4ade80",
            color: "#0f1a0a",
            border: "none",
            borderRadius: "10px",
            padding: "0.9rem",
            fontSize: "0.95rem",
            fontWeight: "bold",
            cursor: "pointer",
            width: "100%",
          }}
        >
          View your updated Training Plan →
        </button>
      </div>
    );
  }

  // ── State B: Plan ready, session not started ──────────────────────────────
  if (!sessionStarted) {
    const previewSession = buildNewSession();
    const total = previewSession.patterns.reduce((sum, p) => sum + p.target, 0);
    const estimatedMin = Math.round(total * 0.75);

    return (
      <div style={{ maxWidth: "600px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "1.5rem",
        }}>
          <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
            Today&apos;s Training Session
          </div>

          <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginBottom: "1rem" }}>
            📋 Your weak patterns, in order:
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.25rem" }}>
            {previewSession.patterns.map((p, i) => (
              <div key={p.theme} style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                backgroundColor: "#0d1621",
                border: "1px solid #1e3a5c",
                borderRadius: "10px",
                padding: "0.85rem 1rem",
              }}>
                <span style={{
                  backgroundColor: "#1e3a5c",
                  color: "#4ade80",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.72rem",
                  fontWeight: "bold",
                  flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#e2e8f0", fontSize: "0.92rem", fontWeight: 600 }}>{p.label}</div>
                  <div style={{ color: "#475569", fontSize: "0.75rem" }}>
                    {p.target} puzzles at ~{p.startRating} rating
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{
            borderTop: "1px solid #1e2a3a",
            paddingTop: "1rem",
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "1.25rem",
            fontSize: "0.82rem",
            color: "#64748b",
          }}>
            <span>Total: <strong style={{ color: "#94a3b8" }}>{total} puzzles</strong></span>
            <span>Est. <strong style={{ color: "#94a3b8" }}>{estimatedMin} min</strong></span>
          </div>

          <button
            onClick={handleStart}
            style={{
              backgroundColor: "#4ade80",
              color: "#0f1a0a",
              border: "none",
              borderRadius: "10px",
              padding: "0.9rem",
              fontSize: "0.95rem",
              fontWeight: "bold",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Start Training Session →
          </button>
        </div>
      </div>
    );
  }

  // ── State C: Session in progress ──────────────────────────────────────────
  const currentPattern = session?.patterns[currentPatternIdx];

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Pattern transition overlay */}
      {transition && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.75)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            backgroundColor: "#13132b",
            border: "1px solid #4ade80",
            borderRadius: "16px",
            padding: "2.5rem",
            textAlign: "center",
            maxWidth: "360px",
          }}>
            <div style={{ color: "#4ade80", fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.75rem" }}>
              {transition}
            </div>
            {session && currentPatternIdx + 1 < session.patterns.length && (
              <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                Moving to {session.patterns[currentPatternIdx + 1]?.label} training...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header: current pattern + progress */}
      {currentPattern && session && (
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "12px",
          padding: "1rem 1.25rem",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}>
            <div>
              <div style={{ color: "#475569", fontSize: "0.68rem", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                Training
              </div>
              <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem" }}>
                {currentPattern.label} — Puzzle {currentPattern.completed + 1}/{currentPattern.target}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#475569", fontSize: "0.68rem", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                Overall
              </div>
              <div style={{ color: "#4ade80", fontSize: "0.88rem", fontWeight: "bold" }}>
                {totalCompleted}/{totalTarget}
              </div>
            </div>
          </div>

          {/* Overall session progress bar */}
          <ProgressBar value={totalCompleted} max={totalTarget} color="#4ade80" />

          {/* Pattern steps — Sprint 33: Next → indicator + Locked tooltip */}
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.6rem" }}>
            {session.patterns.map((p, i) => {
              const done = p.completed >= p.target;
              const active = i === currentPatternIdx;
              const isNext = i === currentPatternIdx + 1;
              const isLocked = i > currentPatternIdx + 1;
              // Get the pattern before this one (what unlocks it)
              const prevPattern = i > 0 ? session.patterns[i - 1] : null;
              return (
                <div
                  key={p.theme}
                  title={isLocked && prevPattern ? `Unlocks after ${prevPattern.label}` : undefined}
                  style={{
                    flex: 1,
                    backgroundColor: done ? "#0d2a1a" : active ? "#1e3a5c" : "#0d1621",
                    border: `1px solid ${done ? "#4ade80" : active ? "#60a5fa" : isNext ? "#3a5a7a" : "#1e2a3a"}`,
                    borderRadius: "6px",
                    padding: "0.3rem 0.4rem",
                    textAlign: "center",
                    cursor: isLocked ? "not-allowed" : "default",
                    opacity: isLocked ? 0.6 : 1,
                  }}
                >
                  <div style={{ color: done ? "#4ade80" : active ? "#60a5fa" : isNext ? "#60a5fa" : "#334155", fontSize: "0.65rem", fontWeight: "bold" }}>
                    {done ? "✓" : active ? "▶" : isNext ? "Next →" : "○"} {p.label}
                  </div>
                  <div style={{ color: "#475569", fontSize: "0.6rem" }}>
                    {p.completed}/{p.target}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sprint 33: Progress encouragement line */}
          {(() => {
            const pct = totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0;
            let encouragement: string | null = null;
            if (pct >= 100) {
              const nextPat = session.patterns[currentPatternIdx + 1];
              encouragement = nextPat
                ? `${currentPattern?.label} complete! Moving to ${nextPat.label}...`
                : null;
            } else if (pct >= 75) {
              encouragement = "Almost done with this pattern 🔥";
            } else if (pct >= 50) {
              encouragement = "Halfway there 💪";
            } else if (pct >= 25) {
              encouragement = "Good start — keep going";
            }
            if (!encouragement) return null;
            return (
              <div style={{
                textAlign: "center",
                color: "#64748b",
                fontSize: "0.75rem",
                marginTop: "0.4rem",
                fontStyle: "italic",
              }}>
                {encouragement}
              </div>
            );
          })()}
        </div>
      )}

      {/* Puzzle board */}
      {loadingPuzzle && (
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "12px",
          padding: "3rem",
          textAlign: "center",
          color: "#64748b",
        }}>
          Loading puzzle...
        </div>
      )}

      {currentPuzzle && !loadingPuzzle && (
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "12px",
          padding: "1.25rem",
        }}>
          <TrainingPuzzleBoard
            key={puzzleKeyRef.current}
            puzzle={currentPuzzle}
            onResult={handlePuzzleResult}
            patternLabel={currentPattern?.label}
          />
        </div>
      )}
    </div>
  );
}
