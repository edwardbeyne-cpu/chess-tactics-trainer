"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Chess } from "chess.js";
import patterns from "@/data/patterns";
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
  type Achievement,
} from "@/lib/storage";
import type { SM2Outcome } from "@/lib/storage";
import AchievementToast from "./AchievementToast";
import { fetchPuzzleByTheme, lichessPuzzleToApp, type AppPuzzle } from "@/lib/lichess";
import { startTrial } from "@/lib/trial";
import ChessBoard from "./ChessBoard";

// ── Mode: lichess (live), classic (static), or mixed ──────────────────────

type PuzzleMode = "lichess" | "classic" | "mixed";

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

// ── Lichess Puzzle Board ───────────────────────────────────────────────────

function LichessPuzzleBoard({
  puzzle,
  onResult,
  onNext,
  isMixedMode,
  revealedPattern,
}: {
  puzzle: AppPuzzle;
  onResult: (outcome: SM2Outcome, solveTimeMs: number) => void;
  onNext: () => void;
  isMixedMode?: boolean;
  revealedPattern?: string | null;
}) {
  const [fen, setFen] = useState(puzzle.fen);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<"solve" | "waiting" | "solved" | "failed">("solve");
  const [message, setMessage] = useState(puzzle.description);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [timeLeft, setTimeLeft] = useState(120);
  const [timerActive, setTimerActive] = useState(true);
  const [firstTry, setFirstTry] = useState(true);
  const startTimeRef = useRef<number>(Date.now());
  const solveTimeRef = useRef<number>(0);
  const resultCalledRef = useRef(false);

  useEffect(() => {
    setFen(puzzle.fen);
    setMoveIndex(0);
    setStatus("solve");
    setMessage(puzzle.description);
    setLastMove(undefined);
    setTimeLeft(120);
    setTimerActive(true);
    setFirstTry(true);
    startTimeRef.current = Date.now();
    solveTimeRef.current = 0;
    resultCalledRef.current = false;
  }, [puzzle.id]);

  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setTimerActive(false);
          setStatus("failed");
          setMessage("Time&apos;s up! Moving to next puzzle.");
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
  }, [timerActive]);

  function handleMove(sourceSquare: string, targetSquare: string): boolean {
    if (status !== "solve") return false;

    const expected = puzzle.solution[moveIndex];
    const expFrom = expected.slice(0, 2);
    const expTo = expected.slice(2, 4);

    if (sourceSquare !== expFrom || targetSquare !== expTo) {
      setFirstTry(false);
      setMessage("Incorrect move. Try again!");
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
      const outcome: SM2Outcome = firstTry ? "solved-first-try" : "solved-after-retry";
      setMessage(
        firstTry ? "Excellent! Puzzle solved!" : "Solved — but not on first try."
      );
      setTimerActive(false);
      if (!resultCalledRef.current) {
        resultCalledRef.current = true;
        onResult(outcome, solveTimeRef.current);
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
      afterOp.move({ from: opFrom, to: opTo, promotion: opMove.slice(4) || "q" });
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
  const timerColor = timeLeft <= 30 ? "#ef4444" : "#4ade80";
  const messageColor =
    status === "solved" ? "#4ade80" : status === "failed" ? "#ef4444" : "#e2e8f0";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2rem", alignItems: "start" }}>
      <div>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1rem 1.5rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <div style={{ color: "#4ade80", fontSize: "0.8rem", fontWeight: "bold" }}>
              {isMixedMode ? (
                status === "solved" || status === "failed"
                  ? `🎲 Mixed Mode — ${revealedPattern ?? puzzle.theme}`
                  : "🎲 Mixed Mode — identify the pattern!"
              ) : puzzle.title}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>⭐ {puzzle.rating}</span>
              <a
                href={puzzle.gameUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#2e75b6", fontSize: "0.75rem", textDecoration: "none" }}
              >
                View on Lichess ↗
              </a>
            </div>
          </div>
          <div style={{ color: messageColor, fontSize: "1rem" }}>{message}</div>
        </div>
        <ChessBoard
          fen={fen}
          onMove={handleMove}
          lastMove={lastMove}
          draggable={status === "solve"}
          boardWidth={480}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Timer */}
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem", textAlign: "center" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Timer</div>
          <div style={{ color: timerColor, fontSize: "3.5rem", fontWeight: "bold", fontFamily: "monospace", lineHeight: 1 }}>
            {minutes}:{String(seconds).padStart(2, "0")}
          </div>
          {timeLeft <= 30 && status === "solve" && (
            <div style={{ color: "#ef4444", fontSize: "0.75rem", marginTop: "0.4rem" }}>Running low!</div>
          )}
        </div>

        {/* Controls */}
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Controls</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <button
              onClick={handleHint}
              disabled={status !== "solve"}
              style={{
                backgroundColor: status === "solve" ? "#2e75b6" : "#1a2535",
                color: status === "solve" ? "white" : "#4a6a8a",
                border: "none", borderRadius: "8px", padding: "0.7rem",
                cursor: status === "solve" ? "pointer" : "not-allowed",
                fontWeight: "bold", fontSize: "0.9rem",
              }}
            >
              💡 Hint
            </button>
            {(status === "solved" || status === "failed") && (
              <button
                onClick={onNext}
                style={{ backgroundColor: "#4ade80", color: "#0f0f1a", border: "none", borderRadius: "8px", padding: "0.7rem", cursor: "pointer", fontWeight: "bold", fontSize: "0.9rem" }}
              >
                ⏭ Next Puzzle
              </button>
            )}
          </div>
        </div>

        {/* Puzzle info */}
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Puzzle Info</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.82rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Difficulty</span>
              <span style={{ color: "#e2e8f0", textTransform: "capitalize" }}>{puzzle.difficulty}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Rating</span>
              <span style={{ color: "#e2e8f0" }}>{puzzle.rating}</span>
            </div>
            {!isMixedMode && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Pattern</span>
                <span style={{ color: "#4ade80" }}>{puzzle.theme}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Source</span>
              <span style={{ color: "#4ade80" }}>Lichess</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Puzzle Component ──────────────────────────────────────────────────

export default function Puzzle() {
  const [mode, setMode] = useState<PuzzleMode>("lichess");
  const [selectedPattern, setSelectedPattern] = useState<string>("");
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
  const [achievementQueue, setAchievementQueue] = useState<Achievement[]>([]);
  const isBossPuzzleRef = useRef(false);
  const isNemesisPuzzleRef = useRef(false);
  const pendingPuzzleRef = useRef<{ pattern: string; isMixed: boolean } | null>(null);

  // Session puzzle count for social proof
  const sessionCountRef = useRef(0);
  const [showSocialProof, setShowSocialProof] = useState(false);

  // Sprint 7: Tactics rating milestone toast
  const [ratingMilestoneToast, setRatingMilestoneToast] = useState<{ rating: number } | null>(null);

  const selectedPatternObj = patterns.find((p) => p.name === selectedPattern);

  // Get patterns eligible for Mixed Mode (10+ attempts)
  const eligibleMixedPatterns = useCallback(() => {
    const sm2 = getSM2Attempts();
    const byTheme = new Map<string, number>();
    for (const a of sm2) {
      if (!a.theme) continue;
      const key = a.theme.toUpperCase();
      byTheme.set(key, (byTheme.get(key) ?? 0) + 1);
    }
    return patterns.filter((p) => (byTheme.get(p.name.toUpperCase()) ?? 0) >= 10);
  }, []);

  const fetchNextPuzzle = useCallback(
    async (patternName: string) => {
      const pattern = patterns.find((p) => p.name === patternName);
      if (!pattern) return;

      // Check if this should be a Boss puzzle (every 10th in session, unlocks at Level 3)
      const session = getSessionState();
      const xpData = getXPData();
      const isBoss = session.puzzleCount > 0 && session.puzzleCount % 10 === 0 && xpData.level >= 3;
      isBossPuzzleRef.current = isBoss;
      isNemesisPuzzleRef.current = false;

      setLoading(true);
      setError(null);
      setCurrentPuzzle(null);
      setMixedRevealedPattern(null);

      try {
        const theme = pattern.themes[0];
        const lichessPuzzle = await fetchPuzzleByTheme(theme);
        const appPuzzle = lichessPuzzleToApp(lichessPuzzle, patternName, pattern.tier);
        setCurrentPuzzle(appPuzzle);

        // Check if new puzzle is a Nemesis
        if (isPuzzleNemesis(appPuzzle.id)) {
          const failCount = getPuzzleFailCount(appPuzzle.id);
          isNemesisPuzzleRef.current = true;
          setNemesisFailCount(failCount);
          setShowNemesisAnnouncement(true);
        } else if (isBoss) {
          setShowBossAnnouncement(true);
        }
      } catch (err) {
        setError(
          `Failed to fetch puzzle: ${err instanceof Error ? err.message : "Unknown error"}. Check your network.`
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchMixedPuzzle = useCallback(async () => {
    const eligible = eligibleMixedPatterns();

    if (eligible.length === 0) {
      setError("Mixed Mode requires 10+ attempts in at least one pattern. Practice Pattern Mode first!");
      return;
    }

    const randomPattern = eligible[Math.floor(Math.random() * eligible.length)];
    setLoading(true);
    setError(null);
    setCurrentPuzzle(null);
    setMixedRevealedPattern(null);

    try {
      const theme = randomPattern.themes[0];
      const lichessPuzzle = await fetchPuzzleByTheme(theme);
      const appPuzzle = lichessPuzzleToApp(lichessPuzzle, randomPattern.name, randomPattern.tier);
      setCurrentPuzzle(appPuzzle);
    } catch (err) {
      setError(
        `Failed to fetch puzzle: ${err instanceof Error ? err.message : "Unknown error"}. Check your network.`
      );
    } finally {
      setLoading(false);
    }
  }, [eligibleMixedPatterns]);

  async function handlePatternSelect(patternName: string) {
    setSelectedPattern(patternName);
    await fetchNextPuzzle(patternName);
  }

  async function handleResult(outcome: SM2Outcome, solveTimeMs: number) {
    const pattern = mode === "mixed"
      ? patterns.find((p) => p.name === currentPuzzle?.theme)
      : selectedPatternObj;

    const tier = pattern?.tier ?? currentPuzzle?.patternTier ?? 1;
    const themeName = (mode === "mixed" ? currentPuzzle?.theme : selectedPattern) ?? "UNKNOWN";
    const isSolved = outcome === "solved-first-try" || outcome === "solved-after-retry";

    // Start free trial on first puzzle solve (if not already started)
    startTrial();

    if (currentPuzzle) {
      // Track nemesis: record fail
      if (!isSolved) {
        recordPuzzleFail(currentPuzzle.id);
      } else if (isNemesisPuzzleRef.current) {
        recordPuzzleWin(currentPuzzle.id);
      }

      // Record SM-2 attempt with solve time
      recordSM2Attempt({
        puzzleId: currentPuzzle.id,
        outcome,
        timestamp: new Date().toISOString(),
        theme: themeName.toUpperCase(),
        rating: currentPuzzle.rating,
        solve_time_ms: solveTimeMs > 0 ? solveTimeMs : undefined,
        tier,
      });

      // Reveal pattern in mixed mode after solving
      if (mode === "mixed") {
        setMixedRevealedPattern(themeName);
      }
    }

    // Update streak
    const { streakData } = updateStreak();

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

    // Sprint 7: Update in-app ELO tactics rating
    if (currentPuzzle?.rating) {
      const { milestoneHit } = updateTacticsRating(currentPuzzle.rating, isSolved);
      if (milestoneHit !== null) {
        setRatingMilestoneToast({ rating: milestoneHit });
        setTimeout(() => setRatingMilestoneToast(null), 5000);
      }
    }

    // Social proof every 5 puzzles
    if (sessionState.puzzleCount > 0 && sessionState.puzzleCount % 5 === 0) {
      setShowSocialProof(true);
    }
  }

  function handleNext() {
    if (mode === "mixed") {
      fetchMixedPuzzle();
    } else if (selectedPattern) {
      fetchNextPuzzle(selectedPattern);
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

      {/* Social proof banner every 5 puzzles */}
      {showSocialProof && (
        <div style={{
          backgroundColor: "#0a1525",
          border: "1px solid #1e3a5c",
          borderRadius: "10px",
          padding: "0.8rem 1.25rem",
          marginBottom: "1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}>
          <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            💡 Improver users solve 40% more puzzles per session — unlock unlimited training.
            <a href="/pricing" style={{ color: "#4ade80", marginLeft: "0.5rem", textDecoration: "none" }}>Start 30-day free trial →</a>
          </span>
          <button onClick={() => setShowSocialProof(false)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "1rem" }}>✕</button>
        </div>
      )}

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "center" }}>
        <div style={{ display: "flex", backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "8px", overflow: "hidden" }}>
          {(["lichess", "mixed", "classic"] as PuzzleMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setSelectedPattern(""); setCurrentPuzzle(null); setError(null); }}
              style={{
                backgroundColor: mode === m ? "#2e75b6" : "transparent",
                color: mode === m ? "white" : "#64748b",
                border: "none", padding: "0.5rem 1.25rem",
                cursor: "pointer", fontWeight: mode === m ? "bold" : "normal",
                fontSize: "0.9rem",
              }}
            >
              {m === "lichess" ? "🌐 Pattern Mode" : m === "mixed" ? "🎲 Mixed Mode" : "📚 Classic"}
            </button>
          ))}
        </div>
        <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
          {mode === "mixed"
            ? "Random patterns you've studied — trains recognition"
            : mode === "lichess"
            ? "Select a pattern to fetch live puzzles"
            : "Classic static puzzles"}
        </span>
      </div>

      {/* Mixed Mode */}
      {mode === "mixed" && (
        <div>
          {eligibleMixedPatterns().length === 0 && !loading && !currentPuzzle && (
            <div style={{ backgroundColor: "#1a1508", border: "1px solid #4a3a0a", borderRadius: "12px", padding: "2rem", textAlign: "center", marginBottom: "1rem" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🎲</div>
              <div style={{ color: "#f59e0b", fontWeight: "bold", marginBottom: "0.5rem" }}>Mixed Mode requires 10+ attempts per pattern</div>
              <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                Practice Pattern Mode first to unlock Mixed Mode. It trains your ability to recognize patterns when you don&apos;t know what&apos;s coming.
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
              isMixedMode={true}
              revealedPattern={mixedRevealedPattern}
            />
          )}
        </div>
      )}

      {/* Lichess / Pattern Mode */}
      {mode === "lichess" && (
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "1.5rem" }}>
          {/* Pattern selector */}
          <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem", overflowY: "auto", maxHeight: "700px" }}>
            <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Select Pattern
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {patterns.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handlePatternSelect(p.name)}
                  style={{
                    backgroundColor: selectedPattern === p.name ? "#2e75b6" : "#162030",
                    color: "white",
                    border: "none", borderRadius: "6px",
                    padding: "0.5rem 0.75rem", cursor: "pointer",
                    textAlign: "left", fontSize: "0.82rem",
                    display: "flex", alignItems: "center", gap: "0.5rem",
                  }}
                >
                  <span>{p.icon}</span>
                  <span>{p.name}</span>
                  <span style={{ marginLeft: "auto", color: "#475569", fontSize: "0.7rem" }}>T{p.tier}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Puzzle area */}
          <div>
            {!selectedPattern && (
              <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>♟</div>
                <div style={{ color: "#94a3b8", fontSize: "1.1rem" }}>
                  Select a tactical pattern on the left to fetch a live puzzle from Lichess
                </div>
              </div>
            )}

            {loading && (
              <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
                <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⟳</div>
                <div style={{ color: "#94a3b8" }}>Fetching puzzle from Lichess...</div>
              </div>
            )}

            {error && (
              <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #ef4444", borderRadius: "12px", padding: "2rem", textAlign: "center" }}>
                <div style={{ color: "#ef4444", marginBottom: "1rem" }}>{error}</div>
                <button
                  onClick={() => selectedPattern && fetchNextPuzzle(selectedPattern)}
                  style={{ backgroundColor: "#2e75b6", color: "white", border: "none", borderRadius: "8px", padding: "0.6rem 1.25rem", cursor: "pointer" }}
                >
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
              />
            )}
          </div>
        </div>
      )}

      {/* Classic Mode */}
      {mode === "classic" && <ClassicPuzzleMode />}
    </div>
  );
}

// ── Classic Mode (legacy static puzzles) ──────────────────────────────────

import puzzles from "@/data/puzzles";

function ClassicPuzzleMode() {
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

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2rem", alignItems: "start" }}>
      <div>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1rem 1.5rem", marginBottom: "1rem" }}>
          <div style={{ color: "#4ade80", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.4rem" }}>
            {puzzle.title} — {puzzle.theme}
          </div>
          <div style={{ color: messageColor, fontSize: "1rem" }}>{message}</div>
        </div>
        <ChessBoard fen={fen} onMove={handleMove} lastMove={lastMove} draggable={status === "solve"} boardWidth={480} />
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
