"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Chess } from "chess.js";
import patterns from "@/data/patterns";
import { cachedPuzzlesByTheme, PATTERN_PUZZLE_COUNTS } from "@/data/lichess-puzzles";
import PatternProgressModal from "./PatternProgressModal";
import {
  recordAttempt,
  scheduleFailed,
  scheduleCorrect,
  recordSM2Attempt,
  getSM2Attempts,
  addXP,
  calculateXPForOutcome,
  updateQuestProgress,
  updateStreak,
  getLevelName,
  getXPData,
  getAchievements,
  earnAchievement,
  updateSessionState,
  getSessionState,
  recordPuzzleFail,
  recordPuzzleWin,
  isPuzzleNemesis,
  getPuzzleFailCount,
  checkAndAwardAchievements,
  updateTacticsRating,
  getTacticsRatingData,
  refreshHabitEntry,
  updatePuzzleProgress,
  updatePatternRating,
  getPatternRating,
  getNextPuzzleForPattern,
  getPatternCurriculumSummary,
  getLastActivePattern,
  setLastActivePattern,
  recordActivityToday,
  checkAndAwardNewAchievements,
  getReviewQueueCount,
  getCompletedPatternCount,
  getPatternsWithHighAccuracy,
  getWeeklyRatingGainAmount,
  getAllTimeHighRating,
  updateAllTimeHighRating,
  ensureWeeklyRatingBaseline,
  setSessionRatingStart,
  getSessionRatingStart,
  recordPuzzleTime,
  updatePuzzleRating,
  getPuzzleRating,
  type Achievement,
  type NewAchievement,
} from "@/lib/storage";

// Helper: get current tactics rating for aggregate tracking
function getTacticsRatingDataForAgg(): number {
  if (typeof window === "undefined") return 800;
  return getTacticsRatingData().tacticsRating;
}
import type { SM2Outcome, SM2Attempt } from "@/lib/storage";
import AchievementToast from "./AchievementToast";
import SocialProofBanner from "./SocialProofBanner";
import { fetchPuzzleByTheme, lichessPuzzleToApp, type AppPuzzle } from "@/lib/lichess";
import { startTrial, hasActiveSubscription } from "@/lib/trial";
import { isSocialProofSuppressed } from "@/lib/socialProof";
import { recordAggregateAttempt, updateWeeklyRatingGain } from "@/lib/aggregate";
import { getSubscriptionTier as getPercentileTier } from "@/lib/percentile";
import ChessBoard from "./ChessBoard";
import PuzzleSettingsModal, {
  loadPuzzleSettings,
  DEFAULT_PUZZLE_SETTINGS,
  type PuzzleSettings,
} from "./PuzzleSettingsModal";

// ── Mode: lichess (live), classic (static), or mixed ──────────────────────

type PuzzleMode = "lichess" | "classic" | "mixed";

// ── Review Queue helpers ───────────────────────────────────────────────────

const REVIEW_QUEUE_KEY = "ctt_review_queue";

function addToReviewQueue(puzzleId: string): void {
  if (typeof window === "undefined") return;
  try {
    const queue: string[] = JSON.parse(localStorage.getItem(REVIEW_QUEUE_KEY) || "[]");
    if (!queue.includes(puzzleId)) {
      queue.push(puzzleId);
      localStorage.setItem(REVIEW_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {
    // ignore
  }
}

function removeFromReviewQueue(puzzleId: string): void {
  if (typeof window === "undefined") return;
  try {
    const queue: string[] = JSON.parse(localStorage.getItem(REVIEW_QUEUE_KEY) || "[]");
    const updated = queue.filter((id) => id !== puzzleId);
    localStorage.setItem(REVIEW_QUEUE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

// ── Boss Puzzle Announcement ───────────────────────────────────────────────

function BossAnnouncement({ onReady }: { onReady: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: "#1a0a0a",
        border: "2px solid #ef4444",
        borderRadius: "20px",
        padding: "3rem",
        textAlign: "center",
        maxWidth: "420px",
        animation: "pulse 0.5s ease-in-out",
      }}>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>⚔️</div>
        <div style={{ color: "#ef4444", fontSize: "1.8rem", fontWeight: "bold", marginBottom: "0.75rem" }}>
          BOSS PUZZLE
        </div>
        <div style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.5rem" }}>
          Test everything you&apos;ve learned.
        </div>
        <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          This puzzle is rated 200+ above your average.<br />Defeat it for <span style={{ color: "#ffd700" }}>2× XP</span>.
        </div>
        <button onClick={onReady} style={{
          backgroundColor: "#ef4444", color: "white", border: "none",
          borderRadius: "10px", padding: "0.9rem 2rem",
          cursor: "pointer", fontWeight: "bold", fontSize: "1rem",
        }}>
          I&apos;m Ready ⚔️
        </button>
      </div>
    </div>
  );
}

// ── Nemesis Puzzle Announcement ────────────────────────────────────────────

function NemesisAnnouncement({ failCount, onReady }: { failCount: number; onReady: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: "#150a1e",
        border: "2px solid #a855f7",
        borderRadius: "20px",
        padding: "3rem",
        textAlign: "center",
        maxWidth: "420px",
      }}>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>👹</div>
        <div style={{ color: "#a855f7", fontSize: "1.8rem", fontWeight: "bold", marginBottom: "0.75rem" }}>
          NEMESIS PUZZLE
        </div>
        <div style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.5rem" }}>
          You&apos;ve faced this puzzle <strong style={{ color: "#ef4444" }}>{failCount} times</strong> and failed every time.
        </div>
        <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Ready to beat it? Win for <span style={{ color: "#ffd700" }}>3× XP</span>.
        </div>
        <button onClick={onReady} style={{
          backgroundColor: "#a855f7", color: "white", border: "none",
          borderRadius: "10px", padding: "0.9rem 2rem",
          cursor: "pointer", fontWeight: "bold", fontSize: "1rem",
        }}>
          Let&apos;s Do This 👹
        </button>
      </div>
    </div>
  );
}

// ── Boss Slayer Animation ──────────────────────────────────────────────────

function BossSlayerModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1100, cursor: "pointer",
    }} onClick={onClose}>
      <div style={{
        backgroundColor: "#1a0a0a",
        border: "3px solid #ffd700",
        borderRadius: "20px",
        padding: "3rem",
        textAlign: "center",
        maxWidth: "400px",
      }}>
        <div style={{ fontSize: "5rem", marginBottom: "1rem" }}>🏆</div>
        <div style={{ color: "#ffd700", fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
          BOSS SLAYER!
        </div>
        <div style={{ color: "#e2e8f0", fontSize: "1rem" }}>
          You defeated the Boss Puzzle!
        </div>
        <div style={{ color: "#4ade80", fontSize: "0.9rem", marginTop: "0.5rem" }}>
          +2× XP awarded ⭐
        </div>
      </div>
    </div>
  );
}

// ── Nemesis Defeated Animation ─────────────────────────────────────────────

function NemesisDefeatedModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1100, cursor: "pointer",
    }} onClick={onClose}>
      <div style={{
        backgroundColor: "#150a1e",
        border: "3px solid #a855f7",
        borderRadius: "20px",
        padding: "3rem",
        textAlign: "center",
        maxWidth: "400px",
      }}>
        <div style={{ fontSize: "5rem", marginBottom: "1rem" }}>💀</div>
        <div style={{ color: "#a855f7", fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
          NEMESIS DEFEATED!
        </div>
        <div style={{ color: "#e2e8f0", fontSize: "1rem" }}>
          You conquered your nemesis!
        </div>
        <div style={{ color: "#4ade80", fontSize: "0.9rem", marginTop: "0.5rem" }}>
          +3× XP awarded ⭐
        </div>
      </div>
    </div>
  );
}

// ── Level Up Celebration ───────────────────────────────────────────────────

function LevelUpModal({ level, onClose }: { level: number; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, cursor: "pointer",
    }} onClick={onClose}>
      <div style={{
        backgroundColor: "#1a1a2e",
        border: "2px solid #ffd700",
        borderRadius: "20px",
        padding: "3rem",
        textAlign: "center",
        maxWidth: "400px",
        animation: "pulse 0.5s ease-in-out",
      }}>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
        <div style={{ color: "#ffd700", fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
          Level Up!
        </div>
        <div style={{ color: "#e2e8f0", fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.75rem" }}>
          You&apos;re now a {getLevelName(level)}
        </div>
        <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          Level {level} achieved — keep training!
        </div>
        <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "1rem" }}>
          (tap to dismiss)
        </div>
      </div>
    </div>
  );
}

// ── XP Toast ───────────────────────────────────────────────────────────────

function XPToast({ xp, onDone }: { xp: number; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", top: "80px", right: "20px",
      backgroundColor: "#0a1f12",
      border: "1px solid #4ade80",
      borderRadius: "10px",
      padding: "0.6rem 1rem",
      color: "#4ade80",
      fontWeight: "bold",
      fontSize: "1rem",
      zIndex: 999,
      animation: "slideIn 0.3s ease",
    }}>
      +{xp} XP ⭐
    </div>
  );
}

// ── Responsive board width hook — Sprint 3: viewport-aware, never cut off ──

function useResponsiveBoardWidth(): number {
  const getWidth = () => {
    if (typeof window === "undefined") return 520;
    const vw = window.innerWidth;
    // Available height = viewport - nav (~56px) - page header (~60px) - container padding (~48px) - controls row (~48px)
    const availableHeight = window.innerHeight - 56 - 60 - 48 - 48;
    const maxFromHeight = Math.min(availableHeight, 560);
    if (vw < 640) return Math.min(vw - 32, maxFromHeight, 380);
    if (vw <= 1024) return Math.min(maxFromHeight, Math.floor(vw * 0.55));
    return Math.min(maxFromHeight, 520);
  };

  const [boardWidth, setBoardWidth] = useState<number>(getWidth);

  useEffect(() => {
    const handleResize = () => setBoardWidth(getWidth());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return boardWidth;
}

// ── Lichess Puzzle Board ───────────────────────────────────────────────────

function LichessPuzzleBoard({
  puzzle,
  onResult,
  onNext,
  onRepeat,
  isMixedMode,
  revealedPattern,
  boardWidth,
  puzzleIndex,
  totalPuzzles,
  patternThemeKey,
  settings,
  settingsOpen,
  onOpenSettings,
}: {
  puzzle: AppPuzzle;
  onResult: (outcome: SM2Outcome, solveTimeMs: number) => void;
  onNext: () => void;
  onRepeat?: () => void;
  isMixedMode?: boolean;
  revealedPattern?: string | null;
  boardWidth: number;
  puzzleIndex?: number;
  totalPuzzles?: number;
  patternThemeKey?: string;
  settings: PuzzleSettings;
  settingsOpen: boolean;
  onOpenSettings: () => void;
}) {
  const [fen, setFen] = useState(puzzle.fen);
  const [orientation] = useState<'white' | 'black'>(puzzle.fen.includes(' b ') ? 'black' : 'white');
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<"solve" | "waiting" | "solved" | "failed">("solve");
  const [message, setMessage] = useState(puzzle.description);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [firstTry, setFirstTry] = useState(true);
  const [boardFlash, setBoardFlash] = useState<"green" | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const solveTimeRef = useRef<number>(0);
  const resultCalledRef = useRef(false);
  const firstAttemptRef = useRef(true); // tracks if this is a repeat attempt

  // Timer derived from settings
  const totalTime = settings.timeLimit > 0 ? settings.timeLimit : 0;
  const [timeLeft, setTimeLeft] = useState(totalTime);
  const [timerActive, setTimerActive] = useState(totalTime > 0);

  useEffect(() => {
    setFen(puzzle.fen);
    setMoveIndex(0);
    setStatus("solve");
    setMessage(puzzle.description);
    setLastMove(undefined);
    const t = settings.timeLimit > 0 ? settings.timeLimit : 0;
    setTimeLeft(t);
    setTimerActive(t > 0);
    setFirstTry(true);
    setBoardFlash(null);
    startTimeRef.current = Date.now();
    solveTimeRef.current = 0;
    resultCalledRef.current = false;
    firstAttemptRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id]);

  // Re-sync timer when settings change (e.g. timeLimit toggled)
  useEffect(() => {
    if (status === "solve" || status === "waiting") {
      const t = settings.timeLimit > 0 ? settings.timeLimit : 0;
      setTimeLeft(t);
      setTimerActive(t > 0 && !settingsOpen);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.timeLimit]);

  // Pause timer when settings popup is open
  useEffect(() => {
    if (settingsOpen) {
      setTimerActive(false);
    } else if (totalTime > 0 && (status === "solve" || status === "waiting") && timeLeft > 0) {
      setTimerActive(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  useEffect(() => {
    if (!timerActive || timeLeft <= 0 || settings.timeLimit === 0) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setTimerActive(false);
          setStatus("failed");
          setMessage("Time's up! Moving to next puzzle...");
          if (!resultCalledRef.current) {
            resultCalledRef.current = true;
            onResult("failed", 0);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive, settings.timeLimit]);

  // Auto-advance after 1 second when timer runs out
  useEffect(() => {
    if (status === "failed" && timeLeft === 0 && settings.timeLimit > 0) {
      const autoAdvance = setTimeout(() => {
        onNext();
      }, 1000);
      return () => clearTimeout(autoAdvance);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, timeLeft]);

  function handleMove(sourceSquare: string, targetSquare: string): boolean {
    if (status !== "solve") return false;

    const expected = puzzle.solution[moveIndex];
    const expFrom = expected.slice(0, 2);
    const expTo = expected.slice(2, 4);

    if (sourceSquare !== expFrom || targetSquare !== expTo) {
      // Wrong move — immediately fail the puzzle (no retries allowed)
      setStatus("failed");
      setMessage("Wrong move! Puzzle failed — added to review queue.");
      setTimerActive(false);
      if (!resultCalledRef.current) {
        resultCalledRef.current = true;
        const totalElapsedMs = Date.now() - startTimeRef.current;
        onResult("failed", totalElapsedMs);
      }
      return false;
    }

    const game = new Chess(fen);
    try {
      game.move({ from: expFrom, to: expTo, promotion: expected.slice(4) || "q" });
    } catch {
      return false;
    }

    const newFen = game.fen();
    setFen(newFen);
    setLastMove([expFrom, expTo]);

    // Stop solve timer on first correct move
    if (moveIndex === 0 && solveTimeRef.current === 0) {
      solveTimeRef.current = Date.now() - startTimeRef.current;
    }

    const nextIndex = moveIndex + 1;

    if (nextIndex >= puzzle.solution.length) {
      setMoveIndex(nextIndex);
      setStatus("solved");
      // Only first-try solves count as clean — "solved-after-retry" is now impossible
      // since any wrong move immediately fails the puzzle. Always "solved-first-try" here.
      const outcome: SM2Outcome = "solved-first-try";
      setMessage("Excellent! Puzzle solved!");
      setTimerActive(false);
      if (!resultCalledRef.current) {
        resultCalledRef.current = true;
        // Sprint 12: use total elapsed time (start to completion) for time standard tracking
        const totalElapsedMs = Date.now() - startTimeRef.current;
        onResult(outcome, totalElapsedMs);
      }
      // Auto-advance on correct answer
      if (settings.autoAdvance) {
        setBoardFlash("green");
        setTimeout(() => setBoardFlash(null), 500);
        setTimeout(() => {
          onNext();
        }, 1500);
      }
      return true;
    }

    setStatus("waiting");
    setMoveIndex(nextIndex);

    const opMove = puzzle.solution[nextIndex];
    const opFrom = opMove.slice(0, 2);
    const opTo = opMove.slice(2, 4);

    setTimeout(() => {
      const afterOp = new Chess(newFen);
      const opPromotion = opMove.length === 5 ? opMove[4] : undefined;
      try {
        afterOp.move({ from: opFrom, to: opTo, ...(opPromotion ? { promotion: opPromotion } : {}) });
      } catch {
        // Opponent move failed — advance index past it and unblock player
        setMoveIndex(nextIndex + 1);
        setStatus("solve");
        setMessage("Good move! Keep going...");
        return;
      }
      const afterOpFen = afterOp.fen();
      setFen(afterOpFen);
      setLastMove([opFrom, opTo]);
      const afterOpIndex = nextIndex + 1;
      setMoveIndex(afterOpIndex);
      setStatus("solve");
      setMessage("Good move! Keep going...");
    }, 600);

    return true;
  }

  function handleHint() {
    if (status !== "solve") return;
    const expected = puzzle.solution[moveIndex];
    const from = expected.slice(0, 2);
    setMessage(`Hint: ${puzzle.hint} (from: ${from})`);
    setFirstTry(false);
    setStatus("failed");
    setTimerActive(false);
    if (!resultCalledRef.current) {
      resultCalledRef.current = true;
      onResult("hint", 0);
    }
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerPct = totalTime > 0 ? timeLeft / totalTime : 1;
  const timerColor = timerPct <= 0.2 ? "#ef4444" : timerPct <= 0.5 ? "#f59e0b" : "#4ade80";
  const messageColor =
    status === "solved" ? "#4ade80" : status === "failed" ? "#ef4444" : "#e2e8f0";

  const isMobile = boardWidth < 480;

  // Compute rating data for right panel
  const headerRatingData = (() => {
    const themeKey = patternThemeKey ?? (isMixedMode && (status === "solved" || status === "failed") && revealedPattern
      ? (PATTERN_NAME_TO_THEME_KEY[revealedPattern] ?? revealedPattern?.toLowerCase())
      : null);
    const patternData = themeKey ? getPatternRating(themeKey) : null;
    const patternName = themeKey ? (THEME_KEY_TO_PATTERN_NAME[themeKey] ?? themeKey) : null;
    let trendArrow = "";
    if (patternData && patternData.history.length >= 2) {
      const last = patternData.history[patternData.history.length - 1].rating;
      const prev = patternData.history[patternData.history.length - 2].rating;
      trendArrow = last > prev ? "↑" : last < prev ? "↓" : "";
    }
    const trendColor = trendArrow === "↑" ? "#4ade80" : trendArrow === "↓" ? "#ef4444" : "#94a3b8";
    return { patternData, patternName, trendArrow, trendColor };
  })();

  // Difficulty dots: easy=1-2, medium=3, hard=4-5
  const difficultyDots = (() => {
    const filled = puzzle.difficulty === "easy" ? 2 : puzzle.difficulty === "medium" ? 3 : 5;
    return Array.from({ length: 5 }, (_, i) => i < filled);
  })();

  // Status overlay: only show briefly after move result
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayKeyRef = useRef(0);

  useEffect(() => {
    if (status === "solved" || status === "failed") {
      overlayKeyRef.current += 1;
      setShowOverlay(true);
      const t = setTimeout(() => setShowOverlay(false), 1500);
      return () => clearTimeout(t);
    }
  }, [status]);

  // Sprint 3: unified container
  return (
    <div
      className="puzzle-unified-container"
      style={{
        transition: "box-shadow 0.3s",
        boxShadow: boardFlash === "green" ? "0 0 24px rgba(74,222,128,0.15)" : "none",
      }}
    >
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: "1.5rem",
        alignItems: "flex-start",
      }}>
        {/* ── Left: Board + controls below ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flexShrink: 0 }}>
          {/* Board with status overlay */}
          <div style={{ position: "relative", width: boardWidth, height: boardWidth }}>
            <ChessBoard
              key={puzzle.id}
              fen={fen}
              orientation={orientation}
              onMove={handleMove}
              lastMove={lastMove}
              draggable={status === "solve"}
              boardWidth={boardWidth}
            />
            {/* Status overlay on board */}
            {showOverlay && (
              <div
                key={overlayKeyRef.current}
                className="board-status-overlay"
                style={{
                  backgroundColor: status === "solved"
                    ? "rgba(22, 101, 52, 0.88)"
                    : "rgba(127, 29, 29, 0.88)",
                }}
              >
                <span style={{
                  color: status === "solved" ? "#86efac" : "#fca5a5",
                  fontSize: "1.1rem",
                  fontWeight: "bold",
                  textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                }}>
                  {status === "solved" ? "Correct! ✓" : "Wrong move — keep trying"}
                </span>
              </div>
            )}
          </div>

          {/* Controls row — below board, inside unified container */}
          <div style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}>
            <button
              onClick={handleHint}
              disabled={status !== "solve"}
              style={{
                backgroundColor: "transparent",
                color: status === "solve" ? "#93c5fd" : "#334155",
                border: `1px solid ${status === "solve" ? "#2e5a9f" : "#1e2a3a"}`,
                borderRadius: "6px",
                padding: "0.35rem 0.75rem",
                cursor: status === "solve" ? "pointer" : "not-allowed",
                fontWeight: "500",
                fontSize: "0.8rem",
                transition: "background 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => { if (status === "solve") e.currentTarget.style.backgroundColor = "#1e3a5f"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              Hint
            </button>
            {onRepeat && (
              <button
                onClick={onRepeat}
                style={{
                  backgroundColor: "transparent",
                  color: "#64748b",
                  border: "1px solid #1e2a3a",
                  borderRadius: "6px",
                  padding: "0.35rem 0.75rem",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: "500",
                  transition: "background 0.15s, border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#1e2a3a"; e.currentTarget.style.color = "#cbd5e1"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#64748b"; }}
              >
                Repeat
              </button>
            )}
            {(status === "solved" || status === "failed") && !settings.autoAdvance && (
              <button
                onClick={onNext}
                style={{
                  backgroundColor: "transparent",
                  color: "#86efac",
                  border: "1px solid #15803d",
                  borderRadius: "6px",
                  padding: "0.35rem 0.75rem",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "0.8rem",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#14532d"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                Next Puzzle →
              </button>
            )}
            <button
              onClick={onOpenSettings}
              style={{
                backgroundColor: "transparent",
                color: "#475569",
                border: "1px solid #1e2a3a",
                borderRadius: "6px",
                padding: "0.35rem 0.75rem",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: "500",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#1e2a3a"; e.currentTarget.style.color = "#94a3b8"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#475569"; }}
            >
              ⚙ Settings
            </button>
            {/* Timer inline with controls when active */}
            {settings.timeLimit > 0 && (
              <div style={{
                marginLeft: "auto",
                display: "flex", alignItems: "center", gap: "0.25rem",
                backgroundColor: "#0f1621",
                border: `1px solid ${timerColor}`,
                borderRadius: "6px",
                padding: "0.2rem 0.5rem",
              }}>
                <span style={{ fontSize: "0.65rem" }}>⏱</span>
                <span style={{ color: timerColor, fontSize: "0.8rem", fontWeight: "bold", fontFamily: "monospace" }}>
                  {minutes}:{String(seconds).padStart(2, "0")}
                </span>
              </div>
            )}
          </div>

          {/* Warm-up link — subtle, below controls */}
          {/* Sprint 3: no pill, just a quiet text link */}
        </div>

        {/* ── Right panel: info only ── */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          minWidth: 0,
          paddingTop: "0.25rem",
        }}>
          {/* Instruction */}
          <div>
            <div style={{
              color: "#e2e8f0",
              fontSize: "1rem",
              fontWeight: "600",
              lineHeight: 1.4,
              marginBottom: "0.25rem",
            }}>
              {puzzle.fen.includes(" w ") ? "White" : "Black"} to move — find the winning tactic
            </div>
            {puzzleIndex !== undefined && totalPuzzles !== undefined && (
              <div style={{ color: "#475569", fontSize: "0.75rem" }}>
                Puzzle {puzzleIndex} of {totalPuzzles}
                {!isMixedMode && (
                  <span style={{ marginLeft: "0.5rem", color: "#334155" }}>
                    · {puzzle.theme.charAt(0) + puzzle.theme.slice(1).toLowerCase()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Puzzle Rating */}
          {isMixedMode ? (
            <div style={{
              backgroundColor: "#111827",
              border: "1px solid #1e2a3a",
              borderRadius: "10px",
              padding: "0.75rem 1rem",
            }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Your Puzzle Rating
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                <span style={{ color: "#4ade80", fontSize: "1.75rem", fontWeight: "bold", lineHeight: 1 }}>
                  {typeof window !== "undefined" ? getPuzzleRating().rating.toLocaleString() : "—"}
                </span>
                <span style={{ color: "#4ade80", fontSize: "1rem" }}>↑</span>
              </div>
            </div>
          ) : headerRatingData.patternData ? (
            <div style={{
              backgroundColor: "#111827",
              border: "1px solid #1e2a3a",
              borderRadius: "10px",
              padding: "0.75rem 1rem",
            }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Your {headerRatingData.patternName ?? "Pattern"} Rating
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                <span style={{ color: "#4ade80", fontSize: "1.75rem", fontWeight: "bold", lineHeight: 1 }}>
                  {headerRatingData.patternData.rating.toLocaleString()}
                </span>
                {headerRatingData.trendArrow && (
                  <span style={{ color: headerRatingData.trendColor, fontSize: "1rem", fontWeight: "bold" }}>
                    {headerRatingData.trendArrow}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {/* Difficulty dots */}
          <div style={{
            backgroundColor: "#111827",
            border: "1px solid #1e2a3a",
            borderRadius: "10px",
            padding: "0.75rem 1rem",
          }}>
            <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Puzzle Difficulty
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div style={{ display: "flex", gap: "3px" }}>
                {difficultyDots.map((filled, i) => (
                  <span key={i} style={{
                    width: "10px", height: "10px", borderRadius: "50%",
                    backgroundColor: filled
                      ? (puzzle.difficulty === "easy" ? "#4ade80" : puzzle.difficulty === "medium" ? "#f59e0b" : "#ef4444")
                      : "#1e2a3a",
                    display: "inline-block",
                  }} />
                ))}
              </div>
              <span style={{
                color: puzzle.difficulty === "easy" ? "#4ade80" : puzzle.difficulty === "medium" ? "#f59e0b" : "#ef4444",
                fontSize: "0.75rem",
                fontWeight: "600",
                textTransform: "capitalize",
              }}>
                {puzzle.difficulty} · {puzzle.rating}
              </span>
            </div>
          </div>

          {/* After solve: pattern revealed + result */}
          {(status === "solved" || status === "failed") && (
            <div style={{
              backgroundColor: status === "solved" ? "rgba(22,101,52,0.2)" : "rgba(127,29,29,0.2)",
              border: `1px solid ${status === "solved" ? "#15803d" : "#7f1d1d"}`,
              borderRadius: "10px",
              padding: "0.75rem 1rem",
              animation: "slideUpIn 0.3s ease",
            }}>
              <div style={{
                color: status === "solved" ? "#86efac" : "#fca5a5",
                fontWeight: "bold",
                fontSize: "0.95rem",
                marginBottom: "0.35rem",
              }}>
                {status === "solved" ? "✓ Correct!" : "✗ Incorrect"}
              </div>
              {isMixedMode && revealedPattern && (
                <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                  Pattern: <span style={{ color: "#4ade80", fontWeight: "600" }}>{revealedPattern}</span>
                </div>
              )}
              {!isMixedMode && (
                <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                  Pattern: <span style={{ color: "#4ade80", fontWeight: "600" }}>{puzzle.theme.charAt(0) + puzzle.theme.slice(1).toLowerCase()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Lichess Pattern Mode (with tier lockout) ──────────────────────────────

function LichessPatternMode({
  selectedPattern,
  currentPuzzle,
  loading,
  error,
  mixedRevealedPattern,
  onPatternSelect,
  onNavigateToPuzzle,
  onResult,
  onNext,
  onRetry,
  onRepeat,
  boardWidth,
  currentPuzzleIndex,
  settings,
  settingsOpen,
  onOpenSettings,
}: {
  selectedPattern: string;
  currentPuzzle: AppPuzzle | null;
  loading: boolean;
  error: string | null;
  mixedRevealedPattern: string | null;
  onPatternSelect: (name: string) => void;
  onNavigateToPuzzle: (themeKey: string, index: number) => void;
  onResult: (outcome: SM2Outcome, solveTimeMs: number) => void;
  onNext: () => void;
  onRetry: () => void;
  onRepeat: () => void;
  boardWidth: number;
  currentPuzzleIndex?: number;
  settings: PuzzleSettings;
  settingsOpen: boolean;
  onOpenSettings: () => void;
}) {
  // Calculate tier lockout from SM2 attempts
  const { tier2Locked, tier3Locked } = useMemo(() => {
    const sm2 = getSM2Attempts();
    const byTheme = new Map<string, SM2Attempt[]>();
    for (const a of sm2) {
      if (!a.theme) continue;
      const key = a.theme.toUpperCase();
      if (!byTheme.has(key)) byTheme.set(key, []);
      byTheme.get(key)!.push(a);
    }

    function getSolveRate(patternName: string): number {
      const arr = byTheme.get(patternName.toUpperCase()) ?? [];
      if (arr.length === 0) return 0;
      const solved = arr.filter((a) => a.outcome === "solved-first-try").length;
      return solved / arr.length;
    }

    const tier1Patterns = patterns.filter((p) => p.tier === 1);
    const tier2Patterns = patterns.filter((p) => p.tier === 2);
    const t1At70 = tier1Patterns.filter((p) => getSolveRate(p.name) >= 0.7).length;
    const t2At70 = tier2Patterns.filter((p) => getSolveRate(p.name) >= 0.7).length;

    return {
      tier2Locked: t1At70 < tier1Patterns.length,
      tier3Locked: t2At70 < tier2Patterns.length,
    };
  }, []);

  function isPatternLocked(tier: number): boolean {
    if (tier === 2) return tier2Locked;
    if (tier === 3) return tier3Locked;
    return false;
  }

  // Progress modal state
  const [openProgressModal, setOpenProgressModal] = useState<string | null>(null);

  const isMobileLayout = boardWidth < 480;
  return (
    <>
    {/* Pattern Progress Modal */}
    {openProgressModal && (
      <PatternProgressModal
        theme={openProgressModal}
        isOpen={true}
        onClose={() => setOpenProgressModal(null)}
        onNavigateToPuzzle={(themeKey, index) => {
          onNavigateToPuzzle(themeKey, index);
        }}
      />
    )}
    <div style={{ display: "grid", gridTemplateColumns: isMobileLayout ? "1fr" : "200px 1fr", gap: "1rem" }}>
      {/* Pattern selector */}
      <div style={{
        backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px",
        padding: isMobileLayout ? "0.75rem" : "1rem",
        overflowY: isMobileLayout ? "hidden" : "auto",
        overflowX: isMobileLayout ? "auto" : "hidden",
        height: isMobileLayout ? "auto" : `${boardWidth}px`,
        display: "flex", flexDirection: isMobileLayout ? "row" : "column",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
      }}>
        <div style={{
          color: "#475569", fontSize: "0.7rem",
          marginBottom: isMobileLayout ? 0 : "0.6rem",
          marginRight: isMobileLayout ? "0.5rem" : 0,
          textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0,
          display: "flex", alignItems: "center",
        }}>
          Patterns
        </div>
        <div style={{
          display: "flex",
          flexDirection: isMobileLayout ? "row" : "column",
          gap: "0.25rem",
          flex: 1,
          overflowY: isMobileLayout ? "hidden" : "auto",
          overflowX: isMobileLayout ? "auto" : "hidden",
          scrollbarWidth: "none",
        }}>
          {patterns.map((p) => {
            const locked = isPatternLocked(p.tier);
            // Get theme key for this pattern
            const themeKeyForPattern = Object.entries({
              "Fork": "fork", "Pin": "pin", "Skewer": "skewer",
              "Discovered Attack": "discoveredAttack", "Back Rank Mate": "backRankMate",
              "Smothered Mate": "smotheredMate", "Double Check": "doubleCheck",
              "Overloading": "overloading", "Deflection": "deflection",
              "Interference": "interference", "Zugzwang": "zugzwang",
              "Attraction": "attraction", "Clearance": "clearance",
              "Trapped Piece": "trappedPiece", "Discovered Check": "discoveredCheck",
              "Kingside Attack": "kingsideAttack", "Queenside Attack": "queensideAttack",
            }).find(([k]) => k === p.name)?.[1] ?? p.name.toLowerCase();
            const isSelected = selectedPattern === themeKeyForPattern;
            const totalCount = PATTERN_PUZZLE_COUNTS[themeKeyForPattern] ?? (cachedPuzzlesByTheme[themeKeyForPattern]?.length ?? 0);

            // Get progress summary for badge
            const summary = !locked
              ? getPatternCurriculumSummary(themeKeyForPattern, totalCount)
              : null;
            const completed = summary?.completed ?? 0;
            const isComplete = completed >= totalCount && totalCount > 0;
            const isStarted = completed > 0;

            return (
              <button
                key={p.name}
                onClick={() => !locked && onPatternSelect(themeKeyForPattern)}
                title={locked ? `Complete Tier ${p.tier - 1} to unlock` : `${totalCount} puzzles`}
                style={{
                  backgroundColor: isSelected ? "#2e75b6" : locked ? "#0f1219" : "#162030",
                  color: locked ? "#475569" : isSelected ? "white" : "#cbd5e1",
                  border: `1px solid ${isSelected ? "#3b82f6" : "transparent"}`,
                  borderRadius: "6px",
                  padding: isMobileLayout ? "0.4rem 0.65rem" : "0.45rem 0.65rem",
                  cursor: locked ? "not-allowed" : "pointer",
                  textAlign: "left", fontSize: "0.78rem",
                  display: "flex", alignItems: "center", gap: "0.4rem",
                  opacity: locked ? 0.5 : 1,
                  flexShrink: 0,
                  whiteSpace: isMobileLayout ? "nowrap" : "normal",
                  transition: "background 0.15s",
                }}
              >
                <span>{locked ? "🔒" : p.icon}</span>
                <span style={{ flex: 1 }}>{p.name}</span>
                {!locked && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenProgressModal(themeKeyForPattern);
                    }}
                    title="View all puzzles for this pattern"
                    style={{
                      background: isComplete
                        ? 'rgba(34, 197, 94, 0.2)'
                        : isStarted
                        ? 'rgba(99, 102, 241, 0.2)'
                        : 'rgba(100, 116, 139, 0.2)',
                      border: isComplete
                        ? '1px solid rgba(34, 197, 94, 0.4)'
                        : isStarted
                        ? '1px solid rgba(99, 102, 241, 0.4)'
                        : '1px solid rgba(100, 116, 139, 0.3)',
                      borderRadius: '12px',
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      color: isComplete
                        ? '#86efac'
                        : isStarted
                        ? '#a5b4fc'
                        : '#64748b',
                      cursor: 'pointer',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isComplete
                        ? 'rgba(34, 197, 94, 0.35)'
                        : isStarted
                        ? 'rgba(99, 102, 241, 0.35)'
                        : 'rgba(100, 116, 139, 0.35)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isComplete
                        ? 'rgba(34, 197, 94, 0.2)'
                        : isStarted
                        ? 'rgba(99, 102, 241, 0.2)'
                        : 'rgba(100, 116, 139, 0.2)';
                    }}
                  >
                    {isComplete
                      ? `${totalCount}/${totalCount} ✅`
                      : `${completed}/${totalCount}`}
                  </button>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Puzzle area */}
      <div style={{ position: "relative" }}>
        {/* Show existing puzzle while loading next (prevents flash of empty board) */}
        {currentPuzzle && (
          <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.2s", pointerEvents: loading ? "none" : "auto" }}>
            <LichessPuzzleBoard
              key={currentPuzzle.id}
              puzzle={currentPuzzle}
              onResult={onResult}
              onNext={onNext}
              onRepeat={onRepeat}
              boardWidth={boardWidth}
              puzzleIndex={currentPuzzleIndex}
              totalPuzzles={selectedPattern ? (PATTERN_PUZZLE_COUNTS[selectedPattern] ?? cachedPuzzlesByTheme[selectedPattern]?.length ?? undefined) : undefined}
              patternThemeKey={selectedPattern || undefined}
              settings={settings}
              settingsOpen={settingsOpen}
              onOpenSettings={onOpenSettings}
            />
          </div>
        )}

        {/* Loading overlay (only on first load when no puzzle yet) */}
        {loading && !currentPuzzle && (
          <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
            <div style={{ color: "#94a3b8", fontSize: "1rem" }}>Loading puzzle...</div>
          </div>
        )}

        {/* Loading spinner overlay on top of existing puzzle */}
        {loading && currentPuzzle && (
          <div style={{
            position: "absolute", top: "0.75rem", right: "0.75rem",
            backgroundColor: "#1a1a2e", borderRadius: "8px", padding: "0.35rem 0.6rem",
            border: "1px solid #2e3a5c", color: "#64748b", fontSize: "0.78rem",
            zIndex: 5,
          }}>
            Loading...
          </div>
        )}

        {error && (
          <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #ef4444", borderRadius: "12px", padding: "2rem", textAlign: "center" }}>
            <div style={{ color: "#ef4444", marginBottom: "1rem" }}>{error}</div>
            <button
              onClick={onRetry}
              style={{ backgroundColor: "#2e75b6", color: "white", border: "none", borderRadius: "8px", padding: "0.6rem 1.25rem", cursor: "pointer", fontWeight: "bold" }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ── Main Puzzle Component ──────────────────────────────────────────────────

// ── Curriculum puzzle FEN resolver ────────────────────────────────────────

/**
 * Apply the opponent's first move (from the Lichess DB) to get the actual
 * puzzle start position and remaining solution moves.
 */
function applyFirstMoveCurriculum(fen: string, moves: string[]): { fen: string; solution: string[] } {
  if (!moves || moves.length < 2) return { fen, solution: moves };
  try {
    const chess = new Chess(fen);
    const opponentMove = moves[0];
    const from = opponentMove.slice(0, 2);
    const to = opponentMove.slice(2, 4);
    const promotion = opponentMove.length === 5 ? opponentMove[4] : undefined;
    chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    return { fen: chess.fen(), solution: moves.slice(1) };
  } catch {
    return { fen, solution: moves };
  }
}

// ── Theme key → pattern name mapping ─────────────────────────────────────

const THEME_KEY_TO_PATTERN_NAME: Record<string, string> = {
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

const PATTERN_NAME_TO_THEME_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(THEME_KEY_TO_PATTERN_NAME).map(([k, v]) => [v, k])
);

export default function Puzzle({ defaultMode }: { defaultMode?: PuzzleMode }) {
  const boardWidth = useResponsiveBoardWidth();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<PuzzleMode>(defaultMode ?? "lichess");

  // Sprint 10: Puzzle settings
  const [puzzleSettings, setPuzzleSettings] = useState<PuzzleSettings>(DEFAULT_PUZZLE_SETTINGS);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Sprint 10: Repeat puzzle state
  const previousPuzzleRef = useRef<{ puzzle: AppPuzzle; index: number } | null>(null);
  const isRepeatAttemptRef = useRef(false);

  // selectedPattern is now the THEME KEY (e.g. "fork"), not pattern name
  const [selectedPattern, setSelectedPattern] = useState<string>("");
  // Current puzzle index within the pattern (1-based)
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState<number>(1);

  const puzzleSubscriptionTier = typeof window !== "undefined" ? getPercentileTier() : "free";
  const [currentPuzzle, setCurrentPuzzle] = useState<AppPuzzle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelUpModal, setLevelUpModal] = useState<number | null>(null);
  const [xpToast, setXpToast] = useState<number | null>(null);
  const [mixedRevealedPattern, setMixedRevealedPattern] = useState<string | null>(null);

  // Sprint 6: Boss / Nemesis / Achievements
  const [showBossAnnouncement, setShowBossAnnouncement] = useState(false);
  const [showNemesisAnnouncement, setShowNemesisAnnouncement] = useState(false);
  const [nemesisFailCount, setNemesisFailCount] = useState(0);
  const [showBossSlayer, setShowBossSlayer] = useState(false);
  const [showNemesisDefeated, setShowNemesisDefeated] = useState(false);
  const [achievementQueue, setAchievementQueue] = useState<(Achievement | NewAchievement)[]>([]);
  const isBossPuzzleRef = useRef(false);
  const isNemesisPuzzleRef = useRef(false);
  const pendingPuzzleRef = useRef<{ pattern: string; isMixed: boolean } | null>(null);

  // Session puzzle count for social proof
  const sessionCountRef = useRef(0);
  const [showSocialProof, setShowSocialProof] = useState(false);
  const [socialProofType, setSocialProofType] = useState<"fifth-puzzle" | "failed-puzzle">("fifth-puzzle");

  // Sprint 7: Tactics rating milestone toast
  const [ratingMilestoneToast, setRatingMilestoneToast] = useState<{ rating: number } | null>(null);

  // selectedPattern is theme key ("fork"), find the pattern obj by it
  const selectedPatternObj = patterns.find((p) => {
    const key = PATTERN_NAME_TO_THEME_KEY[p.name];
    return key === selectedPattern;
  });

  // Get patterns eligible for Mixed Mode — Sprint 11: 20+ attempts in the curated DB
  const eligibleMixedPatterns = useCallback(() => {
    const progressMap = typeof window !== "undefined"
      ? (() => { try { return JSON.parse(localStorage.getItem("ctt_puzzle_progress") || "{}"); } catch { return {}; } })()
      : {};
    // Count attempts per theme from progress map
    const byTheme = new Map<string, number>();
    for (const entry of Object.values(progressMap) as Array<{ patternTheme: string }>) {
      if (!entry.patternTheme) continue;
      byTheme.set(entry.patternTheme, (byTheme.get(entry.patternTheme) ?? 0) + 1);
    }
    // Fall back to SM2 attempts for legacy data
    const sm2 = getSM2Attempts();
    for (const a of sm2) {
      if (!a.theme) continue;
      const key = a.theme.toLowerCase();
      byTheme.set(key, (byTheme.get(key) ?? 0) + 1);
    }
    return patterns.filter((p) => {
      const themeKey = PATTERN_NAME_TO_THEME_KEY[p.name] ?? p.name.toLowerCase();
      return (byTheme.get(themeKey) ?? 0) >= 20;
    });
  }, []);

  // Sprint 10: Load settings from localStorage on mount
  useEffect(() => {
    setPuzzleSettings(loadPuzzleSettings());
  }, []);

  /**
   * Load a specific puzzle from the curated database by theme key and index (1-based).
   * Sprint 11: all puzzle loading goes through this — no more random Lichess API calls.
   */
  const loadCurriculumPuzzle = useCallback(
    (themeKey: string, puzzleIndex: number) => {
      const puzzles = cachedPuzzlesByTheme[themeKey];
      if (!puzzles || puzzles.length === 0) {
        setError(`No puzzles found for pattern "${themeKey}". Database may not include this pattern.`);
        return;
      }

      // Sprint 10: Skip puzzles outside rating range (try nearby indexes)
      const settings = loadPuzzleSettings();
      let idx = Math.max(0, Math.min(puzzleIndex - 1, puzzles.length - 1));
      // Try to find a puzzle within rating range, searching up to 20 puzzles forward
      let raw = puzzles[idx];
      if (settings.minRating > 0 || settings.maxRating < 3000) {
        let found = false;
        for (let offset = 0; offset < 20; offset++) {
          const candidateIdx = (idx + offset) % puzzles.length;
          const candidate = puzzles[candidateIdx];
          if (candidate.rating >= settings.minRating && candidate.rating <= settings.maxRating) {
            idx = candidateIdx;
            raw = candidate;
            found = true;
            break;
          }
        }
        // If nothing found in range, just use the original idx
        if (!found) {
          idx = Math.max(0, Math.min(puzzleIndex - 1, puzzles.length - 1));
          raw = puzzles[idx];
        }
      }

      // Find pattern obj
      const patternName = THEME_KEY_TO_PATTERN_NAME[themeKey] ?? themeKey;
      const pattern = patterns.find((p) => p.name === patternName);
      const tier = pattern?.tier ?? 1;

      // Boss puzzle check
      const session = getSessionState();
      const xpData = getXPData();
      const isBoss = session.puzzleCount > 0 && session.puzzleCount % 10 === 0 && xpData.level >= 3;
      isBossPuzzleRef.current = isBoss;
      isNemesisPuzzleRef.current = false;

      setLoading(true);
      setError(null);
      setMixedRevealedPattern(null);

      try {
        // Apply first move (opponent's move) to get actual puzzle position
        const { fen, solution } = applyFirstMoveCurriculum(raw.fen, raw.moves);
        const difficulty = raw.rating < 1200 ? "easy" : raw.rating < 1800 ? "medium" : "hard";
        const appPuzzle: AppPuzzle = {
          id: raw.id,
          title: `${patternName} — #${puzzleIndex}`,
          theme: patternName.toUpperCase(),
          patternTier: tier,
          difficulty,
          description: `Find the best move!`,
          fen,
          solution,
          hint: `Theme: ${raw.themes.slice(0, 2).join(", ")}`,
          source: "lichess",
          rating: raw.rating,
          gameUrl: `https://lichess.org/training/${raw.id}`,
        };
        // Sprint 10: save previous puzzle before setting new one
        // Use direct ref to avoid stale closure issues
        if (currentPuzzle) {
          previousPuzzleRef.current = { puzzle: currentPuzzle, index: currentPuzzleIndex };
        }
        setCurrentPuzzle(appPuzzle);
        setCurrentPuzzleIndex(idx + 1);
        setLastActivePattern(themeKey);
        isRepeatAttemptRef.current = false;
        // Clear loading only after puzzle is set
        setLoading(false);

        // Check Nemesis
        if (isPuzzleNemesis(raw.id)) {
          const failCount = getPuzzleFailCount(raw.id);
          isNemesisPuzzleRef.current = true;
          setNemesisFailCount(failCount);
          setShowNemesisAnnouncement(true);
        } else if (isBoss) {
          setShowBossAnnouncement(true);
        }
      } catch (err) {
        setError(`Failed to load puzzle: ${err instanceof Error ? err.message : "Unknown error"}`);
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPuzzleIndex, currentPuzzle]
  );

  // Advance to next puzzle in sequence (or next due-for-review)
  const loadNextCurriculumPuzzle = useCallback(
    (themeKey: string, afterIndex: number) => {
      const totalPuzzles = PATTERN_PUZZLE_COUNTS[themeKey] ?? (cachedPuzzlesByTheme[themeKey]?.length ?? 0);
      // Get next: check for due-for-review first, otherwise advance sequentially
      const nextDue = getNextPuzzleForPattern(themeKey, totalPuzzles);
      // If nextDue is a review puzzle (already played) and it's different from where we are, show it
      const progressMap = typeof window !== "undefined"
        ? (() => { try { return JSON.parse(localStorage.getItem("ctt_puzzle_progress") || "{}"); } catch { return {}; } })()
        : {};
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const hasDue = Object.values(progressMap as Record<string, { patternTheme: string; nextReviewDate: string | null; orderIndex: number }>)
        .some(p => p.patternTheme === themeKey && p.nextReviewDate && new Date(p.nextReviewDate) <= now);

      if (hasDue && nextDue !== afterIndex) {
        loadCurriculumPuzzle(themeKey, nextDue);
      } else {
        // Sequential: go to next unplayed
        const nextIndex = afterIndex < totalPuzzles ? afterIndex + 1 : 1;
        loadCurriculumPuzzle(themeKey, nextIndex);
      }
    },
    [loadCurriculumPuzzle]
  );

  const fetchMixedPuzzle = useCallback(() => {
    const eligible = eligibleMixedPatterns();

    if (eligible.length === 0) {
      setError("Puzzles requires 20+ attempts in at least one pattern. Use Drill Tactics first!");
      return;
    }

    // Pick a random eligible pattern and a random puzzle from its curated set
    const randomPattern = eligible[Math.floor(Math.random() * eligible.length)];
    const themeKey = PATTERN_NAME_TO_THEME_KEY[randomPattern.name] ?? randomPattern.name.toLowerCase();
    const puzzles = cachedPuzzlesByTheme[themeKey];
    if (!puzzles || puzzles.length === 0) {
      setError("No puzzles available for this pattern.");
      return;
    }

    const randomIdx = Math.floor(Math.random() * puzzles.length);
    const raw = puzzles[randomIdx];

    setLoading(true);
    setError(null);
    setMixedRevealedPattern(null);

    try {
      const { fen, solution } = applyFirstMoveCurriculum(raw.fen, raw.moves);
      const difficulty = raw.rating < 1200 ? "easy" : raw.rating < 1800 ? "medium" : "hard";
      const appPuzzle: AppPuzzle = {
        id: raw.id,
        title: `${randomPattern.name} — Mixed`,
        theme: randomPattern.name.toUpperCase(),
        patternTier: randomPattern.tier,
        difficulty,
        description: `Find the best move!`,
        fen,
        solution,
        hint: `Theme: ${raw.themes.slice(0, 2).join(", ")}`,
        source: "lichess",
        rating: raw.rating,
        gameUrl: `https://lichess.org/training/${raw.id}`,
      };
      setCurrentPuzzle(appPuzzle);
      setLoading(false);
    } catch (err) {
      setError(`Failed to load puzzle: ${err instanceof Error ? err.message : "Unknown error"}`);
      setLoading(false);
    }
  }, [eligibleMixedPatterns]);

  // Sprint 11: URL param handling — ?pattern=fork&index=47
  useEffect(() => {
    const patternParam = searchParams?.get("pattern");
    const indexParam = searchParams?.get("index");
    if (patternParam && cachedPuzzlesByTheme[patternParam]) {
      const idx = indexParam ? parseInt(indexParam, 10) : 1;
      setMode("lichess"); // Sprint 12 bug fix: ensure Drill Tactics mode when pattern param present
      setSelectedPattern(patternParam);
      loadCurriculumPuzzle(patternParam, isNaN(idx) ? 1 : idx);
    } else if (!patternParam) {
      // Auto-load on page open (Step 6)
      const lastPattern = getLastActivePattern();
      if (lastPattern && cachedPuzzlesByTheme[lastPattern]) {
        const totalPuzzles = PATTERN_PUZZLE_COUNTS[lastPattern] ?? (cachedPuzzlesByTheme[lastPattern]?.length ?? 0);
        const nextIdx = getNextPuzzleForPattern(lastPattern, totalPuzzles);
        setSelectedPattern(lastPattern);
        loadCurriculumPuzzle(lastPattern, nextIdx);
      } else {
        // First time: auto-load Fork puzzle #1 (easiest pattern)
        setSelectedPattern("fork");
        loadCurriculumPuzzle("fork", 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePatternSelect(themeKey: string) {
    setSelectedPattern(themeKey);
    const totalPuzzles = PATTERN_PUZZLE_COUNTS[themeKey] ?? (cachedPuzzlesByTheme[themeKey]?.length ?? 0);
    const nextIdx = getNextPuzzleForPattern(themeKey, totalPuzzles);
    loadCurriculumPuzzle(themeKey, nextIdx);
  }

  async function handleResult(outcome: SM2Outcome, solveTimeMs: number) {
    const pattern = mode === "mixed"
      ? patterns.find((p) => p.name === currentPuzzle?.theme)
      : selectedPatternObj;

    const tier = pattern?.tier ?? currentPuzzle?.patternTier ?? 1;
    // In curriculum/pattern mode, selectedPattern is the theme key (e.g. "fork")
    // In mixed mode, use the puzzle's theme name
    const themeKey = mode === "mixed"
      ? (PATTERN_NAME_TO_THEME_KEY[currentPuzzle?.theme ?? ""] ?? (currentPuzzle?.theme?.toLowerCase() ?? ""))
      : selectedPattern;
    const themeName = (mode === "mixed" ? currentPuzzle?.theme : (THEME_KEY_TO_PATTERN_NAME[selectedPattern] ?? selectedPattern)) ?? "UNKNOWN";
    // Sprint 13: Only "solved-first-try" counts as success. Any wrong move fails the puzzle.
    // "solved-after-retry" is treated as a FAIL — negative rating delta, stays in review queue.
    const isSolved = outcome === "solved-first-try";
    // Sprint 10: Skip rating/SM2 updates on repeat attempts
    const isRepeat = isRepeatAttemptRef.current;

    // Start free trial on first puzzle solve (if not already started)
    startTrial();

    if (currentPuzzle) {
      // Track nemesis: record fail (only on first attempt)
      if (!isRepeat) {
        if (!isSolved) {
          recordPuzzleFail(currentPuzzle.id);
        } else if (isNemesisPuzzleRef.current) {
          recordPuzzleWin(currentPuzzle.id);
        }
      }

      // Record SM-2 attempt with solve time (only on first attempt)
      if (!isRepeat) {
        recordSM2Attempt({
          puzzleId: currentPuzzle.id,
          outcome,
          timestamp: new Date().toISOString(),
          theme: themeName.toUpperCase(),
          rating: currentPuzzle.rating,
          solve_time_ms: solveTimeMs > 0 ? solveTimeMs : undefined,
          tier,
        });
      }

      // Review queue: track missed puzzles for later re-drilling (only on first attempt)
      if (!isRepeat) {
        if (!isSolved) {
          addToReviewQueue(currentPuzzle.id);
        } else {
          removeFromReviewQueue(currentPuzzle.id);
        }
      }

      // Sprint 12: Record elapsed time for time-standard mastery tracking
      if (!isRepeat) {
        const elapsedSec = solveTimeMs > 0 ? Math.round(solveTimeMs / 1000) : 0;
        const timeStandard = puzzleSettings.timeStandard ?? 30;
        recordPuzzleTime(currentPuzzle.id, elapsedSec, isSolved, timeStandard);
      }

      // Sprint 11: Update curriculum puzzle progress and pattern-specific ELO rating.
      // IMPORTANT: Only update pattern rating in Pattern Mode (mode === "lichess").
      // In Mixed Mode the pattern-specific rating must NOT change — only the
      // overall tactics rating (updateTacticsRating below) should update.
      // Sprint 10: Skip on repeat attempts.
      if (!isRepeat && mode === "lichess" && themeKey) {
        updatePuzzleProgress(currentPuzzle.id, themeKey, currentPuzzleIndex, outcome, solveTimeMs > 0 ? solveTimeMs : null);
        updatePatternRating(themeKey, currentPuzzle.rating, isSolved, currentPuzzle.id);
      }

      // Sprint 12: Update Puzzle Rating — only in mixed/Puzzles mode, never in Drill Tactics
      if (!isRepeat && mode === "mixed" && currentPuzzle?.rating) {
        updatePuzzleRating(currentPuzzle.rating, isSolved);
      }

      // Reveal pattern in mixed mode after solving
      if (mode === "mixed") {
        setMixedRevealedPattern(themeName);
      }
    }

    // Update streak
    const { streakData } = updateStreak();

    // Sprint 10: Update daily habit entry
    refreshHabitEntry();

    // Sprint 7 Redesign: Record activity log for 30-day habit tracker
    recordActivityToday();

    // Update session state
    const sessionState = updateSessionState(isSolved);
    sessionCountRef.current = sessionState.puzzleCount;

    // Calculate XP multiplier for boss/nemesis
    let xpMultiplier = 1;
    if (isBossPuzzleRef.current && isSolved) {
      xpMultiplier = 2;
      setShowBossSlayer(true);
    } else if (isNemesisPuzzleRef.current && isSolved) {
      xpMultiplier = 3;
      setShowNemesisDefeated(true);
    }

    // Calculate and award XP
    const baseXP = calculateXPForOutcome(tier, outcome);
    const questXP = updateQuestProgress(outcome, themeName, tier);
    const totalXPEarned = Math.round(baseXP * xpMultiplier) + questXP;

    if (totalXPEarned > 0) {
      const { leveledUp, newLevel } = addXP(totalXPEarned);
      setXpToast(totalXPEarned);
      if (leveledUp) {
        setLevelUpModal(newLevel);
      }
    }

    // Check achievements
    const totalSM2 = getSM2Attempts().filter(
      (a) => a.outcome === "solved-first-try" || a.outcome === "solved-after-retry"
    ).length;
    const newAchievementIds = checkAndAwardAchievements({
      outcome,
      solveTimeMs,
      theme: themeName,
      consecutiveCorrect: sessionState.consecutiveCorrect,
      totalSolved: totalSM2,
      streakDays: streakData.currentStreak,
      tier,
      puzzleId: currentPuzzle?.id ?? "",
    });
    if (newAchievementIds.length > 0) {
      const allAch = getAchievements(); // already imported at top
      const newAchObjs = newAchievementIds
        .map((id) => allAch.find((a) => a.id === id))
        .filter((a): a is Achievement => a !== null && a !== undefined);
      if (newAchObjs.length > 0) {
        setAchievementQueue((q) => [...q, ...newAchObjs]);
      }
    }
    // Award nemesis_slayer if nemesis was defeated
    if (isNemesisPuzzleRef.current && isSolved) {
      const r = earnAchievement("nemesis_slayer");
      if (r.earned && r.achievement) {
        setAchievementQueue((q) => [...q, r.achievement!]);
      }
    }
    // Award boss_slayer if boss was defeated
    if (isBossPuzzleRef.current && isSolved) {
      const r = earnAchievement("boss_slayer");
      if (r.earned && r.achievement) {
        setAchievementQueue((q) => [...q, r.achievement!]);
      }
    }

    // Sprint 7: Update in-app ELO tactics rating (skip on repeat)
    if (!isRepeat && currentPuzzle?.rating) {
      const { delta, milestoneHit } = updateTacticsRating(currentPuzzle.rating, isSolved);
      if (milestoneHit !== null) {
        setRatingMilestoneToast({ rating: milestoneHit });
        setTimeout(() => setRatingMilestoneToast(null), 5000);
      }
      // Sprint 8: aggregate rating gain
      updateWeeklyRatingGain(delta);

      // Sprint 7 Redesign: New achievement system
      const currentTacticsData = getTacticsRatingData();
      const currentRating = currentTacticsData.tacticsRating;
      ensureWeeklyRatingBaseline(currentRating);
      const { isNewHigh, previousHigh } = updateAllTimeHighRating(currentRating);
      const sessionStart = getSessionRatingStart();
      // On first puzzle of session, set session start rating
      if (sessionState.puzzleCount <= 1) {
        setSessionRatingStart(currentRating);
      }
      const sessionGain = Math.max(0, currentRating - sessionStart);
      const weeklyGain = getWeeklyRatingGainAmount(currentRating);
      const reviewQCount = getReviewQueueCount();
      const completedPatterns = getCompletedPatternCount();
      const highAccPatterns = getPatternsWithHighAccuracy();
      // Check if this puzzle was previously in review queue (Second Chance)
      const wasMissed = (() => {
        try {
          const q: string[] = JSON.parse(localStorage.getItem("ctt_review_queue") || "[]");
          return q.includes(currentPuzzle?.id ?? "");
        } catch { return false; }
      })();

      const newV2Achievements = checkAndAwardNewAchievements({
        outcome,
        streakDays: streakData.currentStreak,
        tacticsRating: currentRating,
        sessionRatingGain: sessionGain,
        weeklyRatingGain: weeklyGain,
        allTimeHighRating: currentRating,
        previousAllTimeHigh: previousHigh,
        reviewQueueCount: reviewQCount,
        wasPreviouslyMissed: wasMissed,
        patternCompletedCount: completedPatterns,
        patternsWithHighAccuracy: highAccPatterns,
      });
      if (newV2Achievements.length > 0) {
        setAchievementQueue((q) => [...q, ...newV2Achievements]);
      }
    }

    // Sprint 8: Record aggregate contribution (opt-in)
    const subTier = getPercentileTier();
    const sessionStateForAgg = getSessionState();
    recordAggregateAttempt({
      patternName: themeName,
      patternTier: tier,
      solved: isSolved,
      solveTimeMs: solveTimeMs > 0 ? solveTimeMs : null,
      subscriptionTier: subTier,
      currentRating: getTacticsRatingDataForAgg(),
      puzzlesInSession: sessionStateForAgg.puzzleCount,
    });

    // Sprint 8: Social proof — show after every 5th puzzle (free users only)
    const isFree = !hasActiveSubscription();
    if (isFree && !isSocialProofSuppressed()) {
      if (sessionState.puzzleCount > 0 && sessionState.puzzleCount % 5 === 0) {
        setSocialProofType("fifth-puzzle");
        setShowSocialProof(true);
      } else if (!isSolved) {
        // Show fail prompt if no other prompt shown yet this session
        setSocialProofType("failed-puzzle");
        setShowSocialProof(true);
      }
    }
  }

  function handleNext() {
    if (mode === "mixed") {
      fetchMixedPuzzle();
    } else if (selectedPattern) {
      loadNextCurriculumPuzzle(selectedPattern, currentPuzzleIndex);
    }
  }

  // Sprint 10: Repeat Puzzle
  function handleRepeat() {
    // If auto-advance is on and we just moved to a new puzzle, go back to the previous one
    if (puzzleSettings.autoAdvance && previousPuzzleRef.current) {
      const prev = previousPuzzleRef.current;
      isRepeatAttemptRef.current = true;
      // Restore previous puzzle directly (no rating update on repeat)
      setCurrentPuzzle(prev.puzzle);
      setCurrentPuzzleIndex(prev.index);
      setMixedRevealedPattern(null);
      previousPuzzleRef.current = null;
    } else if (currentPuzzle) {
      // Reload the current puzzle from scratch (no rating update)
      isRepeatAttemptRef.current = true;
      if (mode === "lichess" && selectedPattern) {
        loadCurriculumPuzzle(selectedPattern, currentPuzzleIndex);
      } else if (mode === "mixed") {
        // For mixed, just re-show the same puzzle
        setCurrentPuzzle({ ...currentPuzzle });
      }
    }
  }

  // Start mixed mode
  useEffect(() => {
    if (mode === "mixed") {
      fetchMixedPuzzle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      {/* Sprint 10: Puzzle Settings Modal */}
      <PuzzleSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onSave={(s) => setPuzzleSettings(s)}
        currentSettings={puzzleSettings}
      />

      {/* Sprint 6 Modals */}
      {showBossAnnouncement && (
        <BossAnnouncement onReady={() => setShowBossAnnouncement(false)} />
      )}
      {showNemesisAnnouncement && (
        <NemesisAnnouncement failCount={nemesisFailCount} onReady={() => setShowNemesisAnnouncement(false)} />
      )}
      {showBossSlayer && (
        <BossSlayerModal onClose={() => setShowBossSlayer(false)} />
      )}
      {showNemesisDefeated && (
        <NemesisDefeatedModal onClose={() => setShowNemesisDefeated(false)} />
      )}
      {/* Achievement Toast Queue */}
      {achievementQueue.length > 0 && (
        <AchievementToast
          achievement={achievementQueue[0]}
          onDone={() => setAchievementQueue((q) => q.slice(1))}
        />
      )}
      {levelUpModal !== null && (
        <LevelUpModal level={levelUpModal} onClose={() => setLevelUpModal(null)} />
      )}
      {xpToast !== null && (
        <XPToast xp={xpToast} onDone={() => setXpToast(null)} />
      )}

      {/* Sprint 7: Tactics Rating Milestone Toast */}
      {ratingMilestoneToast && (
        <div
          onClick={() => setRatingMilestoneToast(null)}
          style={{
            position: "fixed",
            bottom: "80px",
            right: "24px",
            backgroundColor: "#1a1a2e",
            border: "2px solid #4ade80",
            borderRadius: "14px",
            padding: "1rem 1.25rem",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            cursor: "pointer",
            maxWidth: "320px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            animation: "slideUpIn 0.4s ease",
          }}
        >
          <span style={{ fontSize: "2.5rem", flexShrink: 0 }}>🎉</span>
          <div>
            <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.1rem" }}>
              Rating Milestone!
            </div>
            <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem" }}>
              +50 milestone! Your tactics rating hit {ratingMilestoneToast.rating}
            </div>
          </div>
        </div>
      )}

      {/* Sprint 8: Social proof banner (free users, max once per session) */}
      {showSocialProof && (
        <SocialProofBanner
          type={socialProofType}
          onDismiss={() => setShowSocialProof(false)}
          onUpgrade={() => { setShowSocialProof(false); window.location.href = "/pricing"; }}
        />
      )}

      {/* Mode toggle — only show when not in a dedicated single-mode page */}
      {!defaultMode && (
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "8px", overflow: "hidden" }}>
            {(["lichess", "mixed"] as PuzzleMode[]).map((m) => {
              const isMixedLocked = m === "mixed" && puzzleSubscriptionTier === "free";
              return (
                <button
                  key={m}
                  onClick={() => {
                    if (isMixedLocked) {
                      window.location.href = "/pricing";
                      return;
                    }
                    setMode(m); setSelectedPattern(""); setCurrentPuzzle(null); setError(null);
                  }}
                  title={isMixedLocked ? "Puzzles mode requires Improver or Serious plan" : undefined}
                  style={{
                    backgroundColor: mode === m ? "#2e75b6" : "transparent",
                    color: isMixedLocked ? "#475569" : mode === m ? "white" : "#64748b",
                    border: "none", padding: "0.5rem 1.25rem",
                    cursor: isMixedLocked ? "not-allowed" : "pointer",
                    fontWeight: mode === m ? "bold" : "normal",
                    fontSize: "0.9rem",
                    position: "relative",
                  }}
                >
                  {m === "lichess" ? "Drill Tactics" : (isMixedLocked ? "Puzzles (Locked)" : "Puzzles")}
                </button>
              );
            })}
          </div>
          <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
            {mode === "mixed"
              ? "Random puzzles at your rating — adaptive difficulty"
              : "Select a pattern to fetch live puzzles"}
          </span>
          {puzzleSubscriptionTier === "free" && mode !== "mixed" && (
            <span style={{ color: "#f59e0b", fontSize: "0.75rem", backgroundColor: "#1a1508", border: "1px solid #4a3a0a", borderRadius: "6px", padding: "0.3rem 0.6rem" }}>
              🔒 Puzzles Mode — <a href="/pricing" style={{ color: "#f59e0b", textDecoration: "underline" }}>Upgrade to Improver</a>
            </span>
          )}
        </div>
      )}

      {/* Mixed Mode */}
      {mode === "mixed" && (
        <div>
          {eligibleMixedPatterns().length === 0 && !loading && !currentPuzzle && (
            <div style={{ backgroundColor: "#1a1508", border: "1px solid #4a3a0a", borderRadius: "12px", padding: "2rem", textAlign: "center", marginBottom: "1rem" }}>
              <div style={{ color: "#f59e0b", fontWeight: "bold", marginBottom: "0.5rem" }}>Puzzles requires 20+ attempts per pattern</div>
              <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                Use Drill Tactics first to unlock Puzzles mode. Complete 20+ puzzles in any pattern to enable it.
              </div>
            </div>
          )}

          {loading && (
            <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⟳</div>
              <div style={{ color: "#94a3b8" }}>Fetching random puzzle from Lichess...</div>
            </div>
          )}

          {error && (
            <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #ef4444", borderRadius: "12px", padding: "2rem", textAlign: "center" }}>
              <div style={{ color: "#ef4444", marginBottom: "1rem" }}>{error}</div>
              <button onClick={fetchMixedPuzzle} style={{ backgroundColor: "#2e75b6", color: "white", border: "none", borderRadius: "8px", padding: "0.6rem 1.25rem", cursor: "pointer" }}>
                Retry
              </button>
            </div>
          )}

          {currentPuzzle && !loading && (
            <LichessPuzzleBoard
              key={currentPuzzle.id}
              puzzle={currentPuzzle}
              onResult={handleResult}
              onNext={handleNext}
              onRepeat={handleRepeat}
              isMixedMode={true}
              revealedPattern={mixedRevealedPattern}
              boardWidth={boardWidth}
              patternThemeKey={
                mixedRevealedPattern
                  ? (PATTERN_NAME_TO_THEME_KEY[mixedRevealedPattern] ?? mixedRevealedPattern.toLowerCase())
                  : undefined
              }
              settings={puzzleSettings}
              settingsOpen={settingsModalOpen}
              onOpenSettings={() => setSettingsModalOpen(true)}
            />
          )}
        </div>
      )}

      {/* Lichess / Pattern Mode */}
      {mode === "lichess" && (
        <LichessPatternMode
          selectedPattern={selectedPattern}
          currentPuzzle={currentPuzzle}
          loading={loading}
          error={error}
          mixedRevealedPattern={mixedRevealedPattern}
          onPatternSelect={handlePatternSelect}
          onNavigateToPuzzle={(themeKey, index) => {
            setSelectedPattern(themeKey);
            loadCurriculumPuzzle(themeKey, index);
          }}
          onResult={handleResult}
          onNext={handleNext}
          onRetry={() => selectedPattern && loadCurriculumPuzzle(selectedPattern, currentPuzzleIndex)}
          onRepeat={handleRepeat}
          boardWidth={boardWidth}
          currentPuzzleIndex={currentPuzzleIndex}
          settings={puzzleSettings}
          settingsOpen={settingsModalOpen}
          onOpenSettings={() => setSettingsModalOpen(true)}
        />
      )}

      {/* Classic Mode — removed from nav, kept for backward compatibility via direct access */}
      {mode === "classic" && <ClassicPuzzleMode />}
    </div>
  );
}

// ── Classic Mode (legacy static puzzles) ──────────────────────────────────

import puzzles from "@/data/puzzles";

function ClassicPuzzleMode() {
  const boardWidth = useResponsiveBoardWidth();
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [fen, setFen] = useState(puzzles[0].fen);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<"solve" | "waiting" | "solved" | "failed">("solve");
  const [message, setMessage] = useState(puzzles[0].description);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [timeLeft, setTimeLeft] = useState(120);
  const [timerActive, setTimerActive] = useState(true);

  const puzzle = puzzles[puzzleIndex];

  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setTimerActive(false);
          setStatus("failed");
          setMessage("Time&apos;s up! Try again.");
          recordAttempt(puzzle.id, "failed");
          scheduleFailed(puzzle.id);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive]);

  function loadPuzzle(index: number) {
    const p = puzzles[index];
    setPuzzleIndex(index);
    setFen(p.fen);
    setMoveIndex(0);
    setStatus("solve");
    setMessage(p.description);
    setLastMove(undefined);
    setTimeLeft(120);
    setTimerActive(true);
  }

  function handleMove(sourceSquare: string, targetSquare: string): boolean {
    if (status !== "solve") return false;

    const expected = puzzle.solution[moveIndex];
    const expFrom = expected.slice(0, 2);
    const expTo = expected.slice(2, 4);

    if (sourceSquare !== expFrom || targetSquare !== expTo) {
      setMessage("Incorrect move. Puzzle added to review queue.");
      setStatus("failed");
      setTimerActive(false);
      recordAttempt(puzzle.id, "failed");
      scheduleFailed(puzzle.id);
      return false;
    }

    const game = new Chess(fen);
    try {
      game.move({ from: expFrom, to: expTo, promotion: "q" });
    } catch {
      return false;
    }

    const newFen = game.fen();
    setFen(newFen);
    setLastMove([expFrom, expTo]);

    const nextIndex = moveIndex + 1;

    if (nextIndex >= puzzle.solution.length) {
      setMoveIndex(nextIndex);
      setStatus("solved");
      setMessage("Excellent! Puzzle solved!");
      setTimerActive(false);
      recordAttempt(puzzle.id, "solved");
      scheduleCorrect(puzzle.id);
      return true;
    }

    setStatus("waiting");
    setMoveIndex(nextIndex);

    const opMove = puzzle.solution[nextIndex];
    const opFrom = opMove.slice(0, 2);
    const opTo = opMove.slice(2, 4);

    setTimeout(() => {
      const afterOp = new Chess(newFen);
      afterOp.move({ from: opFrom, to: opTo, promotion: "q" });
      setFen(afterOp.fen());
      setLastMove([opFrom, opTo]);
      setMoveIndex(nextIndex + 1);
      setStatus("solve");
      setMessage("Good move! Keep going...");
    }, 600);

    return true;
  }

  function handleHint() {
    if (status !== "solve") return;
    const expected = puzzle.solution[moveIndex];
    const from = expected.slice(0, 2);
    setMessage(`Hint: ${puzzle.hint} (marked as failed — from square: ${from})`);
    setStatus("failed");
    setTimerActive(false);
    recordAttempt(puzzle.id, "hint");
    scheduleFailed(puzzle.id);
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerDisplay = `${minutes}:${String(seconds).padStart(2, "0")}`;
  const timerColor = timeLeft <= 30 ? "#ef4444" : "#4ade80";
  const messageColor =
    status === "solved" ? "#4ade80" : status === "failed" ? "#ef4444" : "#e2e8f0";

  const isMobile = boardWidth < 480;
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: isMobile ? "1rem" : "2rem", alignItems: "start" }}>
      <div>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1rem 1.5rem", marginBottom: "1rem" }}>
          <div style={{ color: "#4ade80", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.4rem" }}>
            {puzzle.title} — {puzzle.theme}
          </div>
          <div style={{ color: messageColor, fontSize: "1rem" }}>{message}</div>
        </div>
        <ChessBoard key={puzzles[puzzleIndex]?.id} fen={fen} orientation={puzzles[puzzleIndex]?.fen?.includes(' b ') ? 'black' : 'white'} onMove={handleMove} lastMove={lastMove} draggable={status === "solve"} boardWidth={boardWidth} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem", textAlign: "center" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Timer</div>
          <div style={{ color: timerColor, fontSize: "3.5rem", fontWeight: "bold", fontFamily: "monospace", lineHeight: 1 }}>{timerDisplay}</div>
        </div>

        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Controls</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <button onClick={handleHint} disabled={status !== "solve"}
              style={{ backgroundColor: status === "solve" ? "#2e75b6" : "#1a2535", color: status === "solve" ? "white" : "#4a6a8a", border: "none", borderRadius: "8px", padding: "0.7rem", cursor: status === "solve" ? "pointer" : "not-allowed", fontWeight: "bold", fontSize: "0.9rem" }}>
              💡 Hint (marks as failed)
            </button>
            <button onClick={() => loadPuzzle((puzzleIndex + 1) % puzzles.length)}
              style={{ backgroundColor: "#1e3a5f", color: "white", border: "none", borderRadius: "8px", padding: "0.7rem", cursor: "pointer", fontSize: "0.9rem" }}>
              ⏭ Next Puzzle
            </button>
            {status !== "solve" && status !== "waiting" && (
              <button onClick={() => loadPuzzle(puzzleIndex)}
                style={{ backgroundColor: "#1e3a5f", color: "white", border: "none", borderRadius: "8px", padding: "0.7rem", cursor: "pointer", fontSize: "0.9rem" }}>
                🔄 Retry Puzzle
              </button>
            )}
          </div>
        </div>

        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Puzzles</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {puzzles.map((p, i) => (
              <button key={p.id} onClick={() => loadPuzzle(i)}
                style={{ backgroundColor: i === puzzleIndex ? "#2e75b6" : "#162030", color: "white", border: "none", borderRadius: "6px", padding: "0.5rem 0.75rem", cursor: "pointer", textAlign: "left", fontSize: "0.8rem" }}>
                {p.title} — {p.theme}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
