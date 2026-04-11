"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";
import type { LichessCachedPuzzle } from "@/data/lichess-puzzles";
import { saveDailyTargetSettings, saveGameSnapshot } from "@/lib/storage";
import { runGameAnalysis, fetchRecentGames as fetchRecentGamesShared } from "@/lib/game-analysis";

const ChessBoard = dynamic(() => import("@/components/ChessBoard"), { ssr: false });

const TOTAL_PUZZLES = 10;
const TIMER_MAX = 120; // seconds before auto-skip
const SKIP_VISIBLE_AT = 90; // seconds when skip hint appears

// Storage keys for platform connect (written during calibration reveal)
const CUSTOM_USERNAME_KEY = "ctt_custom_username";
const CUSTOM_PLATFORM_KEY = "ctt_custom_platform";
const PLATFORM_RATING_KEY = "ctt_platform_rating";
const PLATFORM_RATINGS_V2_KEY = "ctt_platform_ratings_v2";
const CUSTOM_QUEUE_KEY = "ctt_custom_queue";
const CUSTOM_ANALYSIS_KEY = "ctt_custom_analysis";

type Platform = "chesscom" | "lichess";

interface AllRatings {
  bullet: number | null;
  blitz: number | null;
  rapid: number | null;
  main: number | null;
}

async function fetchWithRetry(url: string, opts: RequestInit = {}): Promise<Response> {
  const fetchOpts = { ...opts, redirect: "follow" as RequestRedirect };
  try {
    return await fetch(url, fetchOpts);
  } catch {
    // Retry once after 1 second — handles transient mobile network issues
    await new Promise((r) => setTimeout(r, 1000));
    return await fetch(url, fetchOpts);
  }
}

async function fetchAllRatings(platform: Platform, username: string): Promise<AllRatings | null> {
  try {
    if (platform === "chesscom") {
      const res = await fetchWithRetry(
        `https://api.chess.com/pub/player/${username.toLowerCase()}/stats`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const bullet: number | null = data?.chess_bullet?.last?.rating ?? null;
      const blitz: number | null = data?.chess_blitz?.last?.rating ?? null;
      const rapid: number | null = data?.chess_rapid?.last?.rating ?? null;
      return { bullet, blitz, rapid, main: rapid ?? blitz ?? bullet };
    } else {
      const res = await fetchWithRetry(
        `https://lichess.org/api/user/${username}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const perfs = data?.perfs ?? {};
      const bullet: number | null = perfs?.bullet?.rating ?? null;
      const blitz: number | null = perfs?.blitz?.rating ?? null;
      const rapid: number | null = perfs?.rapid?.rating ?? null;
      return { bullet, blitz, rapid, main: rapid ?? blitz ?? bullet };
    }
  } catch {
    return null;
  }
}

function parsePgnMoves(pgn: string): string[] {
  const cleaned = pgn
    .replace(/\{[^}]*\}/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\$\d+/g, "")
    .replace(/\d+\./g, "")
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, "")
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const uci: string[] = [];
  const c = new Chess();
  for (const tok of tokens) {
    try {
      const m = c.move(tok);
      if (m) uci.push(m.from + m.to + (m.promotion ?? ""));
    } catch { break; }
  }
  return uci;
}

function detectMissedTacticSimple(fen: string): string | null {
  const c = new Chess(fen);
  const moves = c.moves({ verbose: true });
  for (const m of moves) {
    const clone = new Chess(fen);
    clone.move(m);
    const attacks = clone.moves({ verbose: true }).filter(x => x.captured);
    if (attacks.length >= 2) return "fork";
  }
  return null;
}

function analyzeGamesForQueue(games: Array<{ pgn: string; playerColor: string }>): Array<{ pattern: string; fen: string; moveNumber?: number }> {
  const results: Array<{ pattern: string; fen: string; moveNumber?: number }> = [];
  // Scan all games (up to 50) to get enough pattern data
  for (const { pgn, playerColor } of games) {
    const moves = parsePgnMoves(pgn);
    const isWhite = playerColor.toLowerCase().startsWith("w");
    const c = new Chess();
    let moveNum = 0;
    for (const uci of moves) {
      moveNum++;
      const isPlayerTurn = isWhite ? c.turn() === "w" : c.turn() === "b";
      const fen = c.fen();
      try {
        c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : undefined });
      } catch { break; }
      // Scan every position (not just player turns) to get more tactical patterns
      if (moveNum > 1) {
        const pattern = detectMissedTacticSimple(fen);
        if (pattern) results.push({ pattern, fen, moveNumber: moveNum });
      }
    }
  }
  return results.slice(0, 50);
}



// ── Puzzle selection & calibration math ────────────────────────────────────

function getOrientation(fen: string): "white" | "black" {
  // The player solves from the side that moves in this FEN position
  // (opponent already moved first to reach this position)
  return fen.split(" ")[1] === "w" ? "white" : "black";
}

function getPlayerOrientation(puzzle: LichessCachedPuzzle): "white" | "black" {
  // In Lichess puzzles, moves[0] is the opponent's move that creates the tactic.
  // The player is the side that moves AFTER the opponent's first move.
  // So if the original FEN has white to move, opponent (white) plays moves[0],
  // then the player (black) needs to find the solution.
  const originalSideToMove = puzzle.fen.split(" ")[1];
  // Player is the opposite of who moves first
  return originalSideToMove === "w" ? "black" : "white";
}

function selectPuzzle(targetElo: number, usedIds: Set<string>): LichessCachedPuzzle | null {
  const candidates: LichessCachedPuzzle[] = [];
  for (const puzzles of Object.values(cachedPuzzlesByTheme)) {
    for (const p of puzzles) {
      if (!usedIds.has(p.id) && Math.abs(p.rating - targetElo) <= 100) {
        candidates.push(p);
      }
    }
  }
  if (candidates.length < 3) {
    for (const puzzles of Object.values(cachedPuzzlesByTheme)) {
      for (const p of puzzles) {
        if (!usedIds.has(p.id) && Math.abs(p.rating - targetElo) <= 300) {
          if (!candidates.find((c) => c.id === p.id)) candidates.push(p);
        }
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function applyCalibStep(
  current: number,
  elapsedSecs: number,
  correct: boolean,
  skipped: boolean
): number {
  const clamp = (n: number) => Math.min(2800, Math.max(400, n));
  if (skipped) return clamp(current - 75);
  if (!correct) return clamp(current - 100);
  if (elapsedSecs < 15) return clamp(current + 250);
  if (elapsedSecs <= 60) return clamp(current + 150);
  return clamp(current + 75);
}

// ── Component ───────────────────────────────────────────────────────────────

interface CalibrationFlowProps {
  startingElo: number;
  onComplete: (finalElo: number) => void;
}

export default function CalibrationFlow({ startingElo, onComplete }: CalibrationFlowProps) {
  // Puzzle-solving state
  const [phase, setPhase] = useState<"solving" | "between" | "reveal">("solving");

  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [calibElo, setCalibElo] = useState(startingElo);
  const [currentPuzzle, setCurrentPuzzle] = useState<LichessCachedPuzzle | null>(null);
  const [currentFen, setCurrentFen] = useState("");
  const [moveIndex, setMoveIndex] = useState(0);
  const [madeError, setMadeError] = useState(false);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [elapsed, setElapsed] = useState(0);
  const [skipVisible, setSkipVisible] = useState(false);
  const [finalElo, setFinalElo] = useState(0);
  const [revealCount, setRevealCount] = useState(0);
  const [lastResult, setLastResult] = useState<"correct" | "wrong" | null>(null);
  const [newElo, setNewElo] = useState(0);
  const [eloChange, setEloChange] = useState(0);

  // Reveal sub-step: rating → daily_goal → connect
  const [revealStep, setRevealStep] = useState<"rating" | "connect" | "daily_goal">("rating");

  // Daily goal step state
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);
  const [customGoalInput, setCustomGoalInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Connect step state (shown in reveal)
  const [platform, setPlatform] = useState<Platform>("chesscom");
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectingPhase, setConnectingPhase] = useState<"connecting" | "analyzing">("connecting");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectedUsername, setConnectedUsername] = useState("");
  const [connectedPlatform, setConnectedPlatform] = useState<Platform>("chesscom");
  const [fetchedRatings, setFetchedRatings] = useState<{ bullet: number | null; blitz: number | null; rapid: number | null } | null>(null);

  // Refs to avoid stale closures
  const calibEloRef = useRef(calibElo);
  const puzzleIndexRef = useRef(puzzleIndex);
  const madeErrorRef = useRef(madeError);
  const elapsedRef = useRef(elapsed);
  const phaseRef = useRef(phase);
  const usedIds = useRef(new Set<string>());
  const startTimeRef = useRef(Date.now());
  const timerActiveRef = useRef(false);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const nextPuzzleRef = useRef<LichessCachedPuzzle | null>(null);
  const nextPuzzleFenRef = useRef<string>("");
  const lastPuzzleRef = useRef<LichessCachedPuzzle | null>(null);

  // Board width — use same logic as Puzzle.tsx useResponsiveBoardWidth
  const [boardWidth, setBoardWidth] = useState<number>(360);

  useEffect(() => {
    function handleResize() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxH = Math.floor(vh * 0.55);
      // Content column is max ~800px on desktop; board should be ~80% of that
      const maxW = vw < 480 ? vw - 64 : vw < 768 ? 360 : vw < 1200 ? 440 : 520;
      setBoardWidth(Math.min(maxW, maxH));
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  calibEloRef.current = calibElo;
  puzzleIndexRef.current = puzzleIndex;
  madeErrorRef.current = madeError;
  elapsedRef.current = elapsed;
  phaseRef.current = phase;



  const loadPuzzle = useCallback((elo: number, used: Set<string>, preloaded?: LichessCachedPuzzle | null) => {
    const puzzle = preloaded ?? selectPuzzle(elo, used);
    if (!puzzle) return;
    used.add(puzzle.id);
    lastPuzzleRef.current = puzzle;

    // Preload next puzzle synchronously — ensures it's ready before user taps Next
    nextPuzzleRef.current = selectPuzzle(elo, used);

    // Apply the opponent's first move so the player sees the position they need to solve
    // In Lichess puzzles, moves[0] is the opponent's move that creates the tactic
    let startFen = puzzle.fen;
    if (puzzle.moves && puzzle.moves.length > 0) {
      const oppMove = puzzle.moves[0];
      try {
        const chess = new Chess(puzzle.fen);
        chess.move({ from: oppMove.slice(0, 2), to: oppMove.slice(2, 4), promotion: oppMove[4] || undefined });
        startFen = chess.fen();
      } catch {
        startFen = puzzle.fen;
      }
    }

    // Set FEN first so board never shows original pre-opponent-move FEN
    setCurrentFen(startFen);
    setCurrentPuzzle(puzzle);
    setMoveIndex(1); // Start at index 1 since opponent's move (index 0) is already applied
    setMadeError(false);
    madeErrorRef.current = false;
    setLastMove(undefined);
    setElapsed(0);
    setSkipVisible(false);
    startTimeRef.current = Date.now();
    timerActiveRef.current = true;
  }, []);

  useEffect(() => {
    loadPuzzle(startingElo, usedIds.current);
  }, [loadPuzzle, startingElo]);

  useEffect(() => {
    if (phase !== "solving") {
      timerActiveRef.current = false;
      return;
    }
    timerActiveRef.current = true;
    const interval = setInterval(() => {
      if (!timerActiveRef.current) return;
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(secs);
      elapsedRef.current = secs;
      if (secs >= SKIP_VISIBLE_AT) setSkipVisible(true);
      if (secs >= TIMER_MAX) {
        timerActiveRef.current = false;
        advancePuzzle(false, true, secs);
      }
    }, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, puzzleIndex]);

  function advancePuzzle(correct: boolean, skipped: boolean, secs: number) {
    timerActiveRef.current = false;

    const calculatedElo = applyCalibStep(calibEloRef.current, secs, correct, skipped);
    const nextIdx = puzzleIndexRef.current + 1;

    if (nextIdx >= TOTAL_PUZZLES) {
      setFinalElo(calculatedElo);
      setCalibElo(calculatedElo);
      calibEloRef.current = calculatedElo;
      try { localStorage.setItem("ctt_calibration_rating", String(calculatedElo)); } catch { /* ignore */ }
      setPhase("reveal");
      return;
    }

    const change = calculatedElo - calibEloRef.current;
    setLastResult(skipped ? "wrong" : correct ? "correct" : "wrong");
    setNewElo(calculatedElo);
    setEloChange(change);
    // Preload next puzzle + pre-compute its startFen while user reads transition screen
    setTimeout(() => {
      const next = selectPuzzle(calculatedElo, usedIds.current);
      if (next) {
        let startFen = next.fen;
        if (next.moves && next.moves.length > 0) {
          try {
            const chess = new Chess(next.fen);
            chess.move({ from: next.moves[0].slice(0,2), to: next.moves[0].slice(2,4), promotion: next.moves[0][4] || undefined });
            startFen = chess.fen();
          } catch { /* ignore */ }
        }
        nextPuzzleRef.current = next;
        nextPuzzleFenRef.current = startFen;
      }
    }, 50);
    setPhase("between");
  }

  const handleMove = useCallback(
    (from: string, to: string): boolean => {
      if (phaseRef.current !== "solving" || !currentPuzzle) return false;

      const expected = currentPuzzle.moves[moveIndex];
      const playerMove = from + to;
      const isCorrect = playerMove === expected.slice(0, 4);

      if (!isCorrect) {
        setMadeError(true);
        madeErrorRef.current = true;
        // Block any further moves immediately
        phaseRef.current = "between";
        // Apply the wrong move visually so player sees it land
        try {
          const wrongChess = new Chess(currentFen);
          wrongChess.move({ from, to });
          setCurrentFen(wrongChess.fen());
          setLastMove([from, to]);
        } catch { /* ignore if illegal */ }
        // Short pause so player sees their wrong move, then transition
        setTimeout(() => advancePuzzle(false, false, elapsedRef.current), 700);
        return true;
      }

      const chess = new Chess(currentFen);
      const promotion = expected.length > 4 ? expected[4] : undefined;
      try {
        chess.move({ from, to, ...(promotion ? { promotion } : {}) });
      } catch {
        return false;
      }
      const afterPlayer = chess.fen();
      const nextMoveIdx = moveIndex + 1;

      if (nextMoveIdx >= currentPuzzle.moves.length) {
        setCurrentFen(afterPlayer);
        setLastMove([from, to]);
        const secs = elapsedRef.current;
        // No delay — transition screen handles timing, no need to show board after last move
        advancePuzzle(!madeErrorRef.current, false, secs);
        return true;
      }

      const oppMove = currentPuzzle.moves[nextMoveIdx];
      // Show player's move for 900ms before opponent responds
      setTimeout(() => {
        const chessForOpponent = new Chess(afterPlayer);
        try {
          chessForOpponent.move({
            from: oppMove.slice(0, 2),
            to: oppMove.slice(2, 4),
            ...(oppMove.length > 4 ? { promotion: oppMove[4] } : {}),
          });
        } catch {
          setCurrentFen(afterPlayer);
          setLastMove([from, to]);
          const secs = elapsedRef.current;
          setTimeout(() => advancePuzzle(!madeErrorRef.current, false, secs), 900);
          return;
        }
        const afterOpp = chessForOpponent.fen();
        setLastMove([oppMove.slice(0, 2) as string, oppMove.slice(2, 4) as string]);
        setCurrentFen(afterOpp);
        setMoveIndex(nextMoveIdx + 1);
      }, 900);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPuzzle, moveIndex, currentFen]
  );

  function handleSkip() {
    advancePuzzle(false, true, elapsedRef.current);
  }

  // Count-up animation on reveal
  useEffect(() => {
    if (phase !== "reveal") return;
    const target = finalElo;
    let current = Math.max(0, target - 350);
    const increment = Math.ceil((target - current) / 40);
    const timer = setInterval(() => {
      current = Math.min(target, current + increment);
      setRevealCount(current);
      if (current >= target) clearInterval(timer);
    }, 18);
    return () => clearInterval(timer);
  }, [phase, finalElo]);

  // Connect handler (used in reveal screen)
  const runBackgroundAnalysis = useCallback(async (plat: Platform, uname: string) => {
    try {
      const games = await fetchRecentGamesShared(uname, plat);
      await runGameAnalysis(uname, plat);
      if (games.length > 0) {
        // Save snapshot AFTER analysis so pattern data is available
        saveGameSnapshot(games);
      }
    } catch {
      // Silent background task
    }
  }, []);

  async function handleConnect() {
    const uname = username.trim();
    if (!uname) return;
    setConnecting(true);
    setConnectingPhase("connecting");
    setConnectError(null);
    try {
      const allRatings = await fetchAllRatings(platform, uname);
      if (!allRatings?.main) {
        setConnectError(`Couldn't find ${platform === "chesscom" ? "Chess.com" : "Lichess"} account "${uname}". Check the username and try again.`);
        setConnecting(false);
        return;
      }
      localStorage.setItem(CUSTOM_USERNAME_KEY, uname);
      localStorage.setItem(CUSTOM_PLATFORM_KEY, platform);
      localStorage.setItem(PLATFORM_RATING_KEY, String(allRatings.main));
      localStorage.setItem(PLATFORM_RATINGS_V2_KEY, JSON.stringify({
        bullet: allRatings.bullet,
        blitz: allRatings.blitz,
        rapid: allRatings.rapid,
        main: allRatings.rapid ? "rapid" : allRatings.blitz ? "blitz" : "bullet",
      }));
      setFetchedRatings({ bullet: allRatings.bullet, blitz: allRatings.blitz, rapid: allRatings.rapid });
      setConnectedUsername(uname);
      setConnectedPlatform(platform);

      // Show connected state immediately, run analysis in background
      setConnected(true);
      setConnectingPhase("analyzing");

      // Use setTimeout to yield the main thread so the UI repaints
      // before the CPU-intensive analysis starts
      setTimeout(async () => {
        try {
          await runBackgroundAnalysis(platform, uname);
        } catch {
          // Non-fatal: connect still works even if analysis fails
        }
        setConnectingPhase("connecting");
      }, 100);
    } catch {
      setConnectError("Connection failed. Check your username and try again.");
    } finally {
      setConnecting(false);
    }
  }



  // ── Percentile from Lichess public puzzle rating distribution ──────────────
  function getPercentile(elo: number): string {
    // Based on Lichess puzzle rating distribution (millions of rated players)
    if (elo >= 2400) return "top 2%";
    if (elo >= 2200) return "top 5%";
    if (elo >= 2000) return "top 10%";
    if (elo >= 1800) return "top 15%";
    if (elo >= 1600) return "top 25%";
    if (elo >= 1400) return "top 35%";
    if (elo >= 1200) return "top 50%";
    if (elo >= 1000) return "top 65%";
    return "top 80%";
  }

// ── Reveal screen ──────────────────────────────────────────────────────────
  if (phase === "reveal") {
    const tier =
      finalElo >= 1800
        ? { label: "Elite", color: "#f59e0b" }
        : finalElo >= 1400
        ? { label: "Advanced", color: "#a78bfa" }
        : finalElo >= 1000
        ? { label: "Intermediate", color: "#60a5fa" }
        : { label: "Beginner", color: "#94a3b8" };
    const percentile = getPercentile(finalElo);

    // ── Sub-step: rating reveal ─────────────────────────────────────────────
    if (revealStep === "rating") {
      return (
        <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem 1rem" }}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem", maxWidth: "480px", width: "100%" }}>
            <div style={{ fontSize: "7rem", marginBottom: "0.5rem", lineHeight: 1 }}>♔</div>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: "600", margin: "0 0 0.2rem" }}>
              Your starting tactics rating:
            </p>
            <div style={{
              fontSize: "7rem",
              fontWeight: "900",
              color: "#4ade80",
              lineHeight: 1,
              margin: "0.5rem 0 0.5rem",
              textShadow: "0 0 60px rgba(74, 222, 128, 0.5)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.03em",
            }}>
              {revealCount.toLocaleString()}
            </div>
            <div style={{
              display: "inline-block",
              backgroundColor: "rgba(255,255,255,0.05)",
              border: `1px solid ${tier.color}40`,
              borderRadius: "20px",
              padding: "0.3rem 1rem",
              fontSize: "0.9rem",
              color: tier.color,
              fontWeight: "700",
              marginBottom: "1rem",
            }}>
              {tier.label}
            </div>
            <p style={{ color: "#4ade80", fontSize: "0.95rem", fontWeight: "700", margin: "0 0 0.4rem" }}>
              {percentile} of puzzle solvers
            </p>
            <p style={{ color: "#64748b", fontSize: "0.82rem", lineHeight: 1.6, margin: 0 }}>
              Based on your solve speed and accuracy across 10 puzzles
            </p>
          </div>

          <button
            onClick={() => setRevealStep("daily_goal")}
            style={{
              backgroundColor: "#4ade80",
              color: "#0f1a0a",
              border: "none",
              borderRadius: "10px",
              padding: "1rem",
              fontSize: "0.95rem",
              fontWeight: "bold",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Continue →
          </button>
        </div>
      );
    }

    // ── Sub-step: daily goal commitment ────────────────────────────────────
    if (revealStep === "daily_goal") {
      const PRESET_GOALS = [10, 20, 30];

      function commitGoal(goal: number) {
        setSelectedGoal(goal);
        saveDailyTargetSettings({ dailyGoal: goal });
        setRevealStep("connect");
      }

      function handleCustomCommit() {
        const val = parseInt(customGoalInput, 10);
        if (!isNaN(val) && val >= 1) {
          commitGoal(Math.min(30, val));
        }
      }

      return (
        <div style={{ padding: "3.25rem 1rem 0.75rem" }}>
          <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            <p style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "700", margin: "0 0 0.6rem" }}>
              How fast do you want to improve?
            </p>
            <p style={{ color: "#64748b", fontSize: "0.82rem", lineHeight: 1.6, margin: 0 }}>
              Players who set a daily goal improve 3x faster
            </p>
          </div>

          {(() => {
            const TIER_LABELS: Record<number, { label: string; sub: string }> = {
              10: { label: "Casual",     sub: "10 puzzles / day" },
              20: { label: "Serious",    sub: "20 puzzles / day" },
              30: { label: "Aggressive", sub: "30 puzzles / day" },
            };
            return (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1rem" }}>
            {PRESET_GOALS.map((g) => (
              <button
                key={g}
                onClick={() => commitGoal(g)}
                style={{
                  backgroundColor: selectedGoal === g ? "#123021" : "#0d1621",
                  border: `1px solid ${selectedGoal === g ? "#4ade80" : "#2e3a5c"}`,
                  borderRadius: "12px",
                  color: selectedGoal === g ? "#4ade80" : "#e2e8f0",
                  fontSize: "1rem",
                  fontWeight: "bold",
                  padding: "0.9rem",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
                onMouseEnter={(e) => {
                  if (selectedGoal !== g) {
                    e.currentTarget.style.backgroundColor = "#123021";
                    e.currentTarget.style.borderColor = "#4ade80";
                    e.currentTarget.style.color = "#4ade80";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedGoal !== g) {
                    e.currentTarget.style.backgroundColor = "#0d1621";
                    e.currentTarget.style.borderColor = "#2e3a5c";
                    e.currentTarget.style.color = "#e2e8f0";
                  }
                }}
              >
                <span>{TIER_LABELS[g]?.label ?? `${g} puzzles / day`}</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 400, color: selectedGoal === g ? "#4ade80" : "#94a3b8" }}>{TIER_LABELS[g]?.sub}</span>
              </button>
            ))}

            {/* Custom option */}
            {!showCustomInput ? (
              <button
                onClick={() => setShowCustomInput(true)}
                style={{
                  backgroundColor: "#0d1621",
                  border: "1px solid #2e3a5c",
                  borderRadius: "12px",
                  color: "#94a3b8",
                  fontSize: "1rem",
                  fontWeight: "bold",
                  padding: "0.9rem",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                Custom
              </button>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="e.g. 15"
                  value={customGoalInput}
                  onChange={(e) => setCustomGoalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCustomCommit(); }}
                  autoFocus
                  style={{
                    flex: 1,
                    backgroundColor: "#0d1621",
                    border: "1px solid #4ade80",
                    borderRadius: "10px",
                    color: "#e2e8f0",
                    fontSize: "1rem",
                    padding: "0.75rem 1rem",
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleCustomCommit}
                  disabled={!customGoalInput || isNaN(parseInt(customGoalInput, 10))}
                  style={{
                    backgroundColor: customGoalInput ? "#4ade80" : "#1a2535",
                    color: customGoalInput ? "#0f1a0a" : "#4a6a8a",
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.75rem 1.1rem",
                    fontWeight: "bold",
                    cursor: customGoalInput ? "pointer" : "not-allowed",
                    fontSize: "0.9rem",
                  }}
                >
                  Set
                </button>
              </div>
            )}
          </div>
            );
          })()}

          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => { saveDailyTargetSettings({ dailyGoal: 10 }); onComplete(finalElo); }}
              style={{
                background: "none",
                border: "none",
                color: "#475569",
                fontSize: "0.78rem",
                cursor: "pointer",
                padding: "0.25rem",
              }}
            >
              Skip — use default (10/day)
            </button>
          </div>
        </div>
      );
    }

    // ── Sub-step: connect Chess.com / Lichess ──────────────────────────────
    return (
      <div style={{ padding: "1.5rem 1rem 0.5rem" }}>
        {/* Outcome-first headline */}
        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          <p style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "700", margin: "0 0 0.5rem" }}>
            Train smarter, not harder
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", margin: "0 0 1rem", textAlign: "left" }}>
            {[
              "We scan your last 50 games",
              "We find your top 3 tactical weaknesses",
              "We weight your training set around those patterns",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#94a3b8", fontSize: "0.82rem" }}>
                <span style={{ color: "#4ade80", fontWeight: 700, flexShrink: 0 }}>✓</span>
                {step}
              </div>
            ))}
          </div>

          {/* Static ELO line chart preview */}
          <div style={{
            backgroundColor: "#0a1520",
            border: "1px solid #1e3a5c",
            borderRadius: "12px",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
          }}>
            <div style={{ color: "#475569", fontSize: "0.68rem", textAlign: "left", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Rating over time
            </div>
            <svg viewBox="0 0 240 60" width="100%" height="60" style={{ display: "block" }}>
              {/* Grid lines */}
              <line x1="0" y1="50" x2="240" y2="50" stroke="#1e3a5c" strokeWidth="1" />
              <line x1="0" y1="30" x2="240" y2="30" stroke="#1e3a5c" strokeWidth="0.5" strokeDasharray="4,4" />
              <line x1="0" y1="10" x2="240" y2="10" stroke="#1e3a5c" strokeWidth="0.5" strokeDasharray="4,4" />
              {/* Rising ELO line */}
              <polyline
                points="0,48 30,44 60,42 90,36 120,30 150,22 180,14 210,10 240,6"
                fill="none"
                stroke="#4ade80"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Area fill */}
              <polyline
                points="0,48 30,44 60,42 90,36 120,30 150,22 180,14 210,10 240,6 240,50 0,50"
                fill="rgba(74,222,128,0.08)"
                stroke="none"
              />
              {/* End dot */}
              <circle cx="240" cy="6" r="3.5" fill="#4ade80" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.2rem" }}>
              <span style={{ color: "#334155", fontSize: "0.65rem" }}>Week 1</span>
              <span style={{ color: "#4ade80", fontSize: "0.72rem", fontWeight: "bold" }}>+180 rating</span>
            </div>
          </div>
        </div>

        {/* Connect step */}
        <div style={{ marginBottom: "1.25rem" }}>
          {connected ? (
            <div style={{
              backgroundColor: "#0d2a1a",
              border: "1px solid #4ade80",
              borderRadius: "12px",
              padding: "1rem",
              textAlign: "center",
            }}>
              <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.82rem", marginBottom: "0.35rem" }}>
                ✓ Connected
              </div>
              <div style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "bold", marginBottom: "0.2rem" }}>
                {connectedUsername}
              </div>
              <div style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "0.6rem" }}>
                {connectedPlatform === "chesscom" ? "♟ Chess.com" : "🐴 Lichess"}
              </div>
              {fetchedRatings && (
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  backgroundColor: "#0a1520",
                  border: "1px solid #1e3a5c",
                  borderRadius: "8px",
                  padding: "0.5rem 0.75rem",
                  gap: "0.5rem",
                }}>
                  {[
                    { label: "Bullet", value: fetchedRatings.bullet },
                    { label: "Blitz", value: fetchedRatings.blitz },
                    { label: "Rapid", value: fetchedRatings.rapid },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: "center", flex: 1 }}>
                      <div style={{ color: value ? "#4ade80" : "#475569", fontSize: "1.2rem", fontWeight: "bold", lineHeight: 1 }}>
                        {value ?? "—"}
                      </div>
                      <div style={{ color: "#64748b", fontSize: "0.68rem", marginTop: "0.2rem" }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Platform toggle */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                {(["chesscom", "lichess"] as Platform[]).map((plat) => (
                  <button
                    key={plat}
                    onClick={() => setPlatform(plat)}
                    style={{
                      flex: 1,
                      backgroundColor: platform === plat ? "#1e3a5c" : "#0d1621",
                      border: `1px solid ${platform === plat ? "#4ade80" : "#2e3a5c"}`,
                      borderRadius: "8px",
                      color: platform === plat ? "#e2e8f0" : "#64748b",
                      fontSize: "0.82rem",
                      fontWeight: platform === plat ? "bold" : "normal",
                      padding: "0.5rem",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {plat === "chesscom" ? "♟ Chess.com" : "🐴 Lichess"}
                  </button>
                ))}
              </div>

              {/* Username input */}
              <div style={{ marginBottom: connectError ? "0.4rem" : "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.35rem" }}>
                  {platform === "chesscom" ? "Chess.com" : "Lichess"} username
                  <span style={{ color: "#ef4444", marginLeft: "0.2rem" }}>*</span>
                  <span style={{ color: "#475569", marginLeft: "0.4rem", fontWeight: "normal" }}>(optional — skip if you prefer)</span>
                </label>
                <input
                  type="text"
                  placeholder={platform === "chesscom" ? "Chess.com username" : "Lichess username"}
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setConnectError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
                  style={{
                    backgroundColor: "#0d1621",
                    border: `1px solid ${connectError ? "#ef4444" : "#2e3a5c"}`,
                    borderRadius: "8px",
                    color: "#e2e8f0",
                    fontSize: "0.9rem",
                    padding: "0.65rem 0.9rem",
                    width: "100%",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {connectError && (
                <div style={{
                  color: "#ef4444",
                  fontSize: "0.75rem",
                  marginBottom: "0.5rem",
                  backgroundColor: "#1f0a0a",
                  border: "1px solid #4a1a1a",
                  borderRadius: "6px",
                  padding: "0.4rem 0.6rem",
                }}>
                  {connectError}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={!username.trim() || connecting}
                style={{
                  backgroundColor: "transparent",
                  color: username.trim() && !connecting ? "#4ade80" : "#334155",
                  border: `1px solid ${username.trim() && !connecting ? "#4ade80" : "#2e3a5c"}`,
                  borderRadius: "8px",
                  padding: "0.7rem",
                  fontSize: "0.88rem",
                  fontWeight: "600",
                  cursor: username.trim() && !connecting ? "pointer" : "not-allowed",
                  width: "100%",
                  marginBottom: "0.5rem",
                  transition: "all 0.15s",
                }}
              >
                {connecting
                  ? (connectingPhase === "analyzing" ? "Analyzing your games…" : "Connecting…")
                  : platform === "chesscom"
                  ? "Connect Chess.com →"
                  : "Connect Lichess →"}
              </button>
            </>
          )}
        </div>

        {/* Continue → complete calibration */}
        <button
          onClick={() => onComplete(finalElo)}
          disabled={connectingPhase === "analyzing"}
          style={{
            backgroundColor: connectingPhase === "analyzing" ? "#1a2535" : "#4ade80",
            color: connectingPhase === "analyzing" ? "#4ade80" : "#0f1a0a",
            border: connectingPhase === "analyzing" ? "1px solid #4ade80" : "none",
            borderRadius: "10px",
            padding: "1rem",
            fontSize: "0.95rem",
            fontWeight: "bold",
            cursor: connectingPhase === "analyzing" ? "wait" : "pointer",
            width: "100%",
            transition: "all 0.3s ease",
          }}
        >
          {connectingPhase === "analyzing" ? (
            <>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: "0.5rem" }}>⟳</span>
              Analyzing your games… hang tight
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </>
          ) : "Continue →"}
        </button>

        {!connected && (
          <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
            <button
              onClick={() => onComplete(finalElo)}
              style={{
                background: "none",
                border: "none",
                color: "#475569",
                fontSize: "0.78rem",
                cursor: "pointer",
                padding: "0.25rem",
              }}
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Between-puzzle transition screen ──────────────────────────────────────
  if (phase === "between") {
    return (
      <div style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}>
        {/* Top section */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            fontSize: "5rem",
            lineHeight: 1,
            color: lastResult === "correct" ? "#22c55e" : "#ef4444",
            marginBottom: "0.5rem",
          }}>
            {lastResult === "correct" ? "✓" : "✗"}
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#e2e8f0", marginBottom: "0.4rem" }}>
            {lastResult === "correct" ? "Correct!" : "Missed"}
          </div>
          <div style={{ fontSize: "0.9rem", color: "#94a3b8" }}>
            {lastResult === "correct"
              ? "Nice find. The next puzzle will be a bit harder."
              : "No worries. The next puzzle will be at a similar level."}
          </div>
        </div>

        {/* Middle section — adaptive rating */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
            Your calibration rating
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}>
            <div style={{
              fontSize: "3rem",
              fontWeight: "bold",
              color: "#4ade80",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}>
              {newElo}
            </div>
            <div style={{
              fontSize: "1rem",
              fontWeight: "bold",
              color: eloChange >= 0 ? "#22c55e" : "#ef4444",
              backgroundColor: eloChange >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              border: `1px solid ${eloChange >= 0 ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
              borderRadius: "8px",
              padding: "0.2rem 0.5rem",
            }}>
              {eloChange > 0 ? `+${eloChange}` : eloChange}
            </div>
          </div>
          <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.5rem" }}>
            Puzzle {puzzleIndex + 1} of {TOTAL_PUZZLES} complete
          </div>
        </div>

        {/* Bottom section — next puzzle button */}
        <div style={{ width: "100%", maxWidth: "360px" }}>
          <button
            onClick={() => {
              setLastResult(null);
              setCalibElo(newElo);
              calibEloRef.current = newElo;
              setPuzzleIndex(puzzleIndex + 1);
              puzzleIndexRef.current = puzzleIndex + 1;
              const preloaded = nextPuzzleRef.current;
              const preloadedFen = nextPuzzleFenRef.current;
              nextPuzzleRef.current = null;
              nextPuzzleFenRef.current = "";
              // If we have precomputed FEN, apply it directly — no computation needed on tap
              if (preloaded && preloadedFen) {
                lastPuzzleRef.current = preloaded;
                usedIds.current.add(preloaded.id);
                setCurrentFen(preloadedFen);
                setCurrentPuzzle(preloaded);
                setMoveIndex(1);
                setMadeError(false);
                madeErrorRef.current = false;
                setLastMove(undefined);
                setElapsed(0);
                setSkipVisible(false);
                startTimeRef.current = Date.now();
                timerActiveRef.current = true;
              } else {
                loadPuzzle(newElo, usedIds.current, null);
              }
              setPhase("solving");
            }}
            style={{
              backgroundColor: "#4ade80",
              color: "#0f1a0a",
              border: "none",
              borderRadius: "10px",
              padding: "1rem",
              fontSize: "1rem",
              fontWeight: "bold",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Next Puzzle →
          </button>
        </div>
      </div>
    );
  }

  // ── Loading / transition state ─────────────────────────────────────────────
  // Use last known puzzle during fade transition so board never goes blank
  const displayPuzzle = currentPuzzle ?? lastPuzzleRef.current;
  if (!displayPuzzle) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 1rem", color: "#64748b", fontSize: "0.9rem" }}>
        Loading…
      </div>
    );
  }

  // Orientation: player is the side AFTER opponent's first move (moves[0])
  // Use getPlayerOrientation on the original puzzle FEN — never recompute mid-puzzle
  const orientation = currentPuzzle ? getPlayerOrientation(currentPuzzle) : getOrientation(currentFen);
  const bw = boardWidth;

  // ── Solving screen ─────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <p style={{
          color: "#475569",
          fontSize: "0.9rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          margin: "0 0 0.2rem",
        }}>
          Let&apos;s find your level
        </p>
        <p style={{ color: "#94a3b8", fontSize: "1.3rem", fontWeight: "700", margin: 0 }}>
          Puzzle {Math.min(puzzleIndex + 1, TOTAL_PUZZLES)} of {TOTAL_PUZZLES}
        </p>

        {/* Progress bar */}
        <div style={{
          margin: "0.55rem auto 0",
          maxWidth: "300px",
          height: "4px",
          borderRadius: "2px",
          backgroundColor: "#1e3a5c",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${(puzzleIndex / TOTAL_PUZZLES) * 100}%`,
            backgroundColor: "#4ade80",
            borderRadius: "2px",
            transition: "width 0.35s ease",
          }} />
        </div>
      </div>

      {/* Chess board */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
        <div style={{ width: bw, height: bw, position: "relative", flexShrink: 0 }}>
          <ChessBoard
            fen={currentFen}
            onMove={handleMove}
            lastMove={lastMove}
            boardWidth={bw}
            orientation={orientation}
            disableAnimation={true}
          />
        </div>
      </div>
      <p style={{
        fontSize: "1.1rem",
        color: "#94a3b8",
        textAlign: "center",
        margin: "0 0 0.5rem",
        fontWeight: "600",
      }}>
          Find the best move for {orientation === "white" ? "White ♔" : "Black ♚"}
        </p>

      {/* Skip hint */}
      <div style={{
        textAlign: "center",
        minHeight: "1.6rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {skipVisible && (
          <span style={{ color: "#475569", fontSize: "0.78rem" }}>
            Take your time — or{" "}
            <button
              onClick={handleSkip}
              style={{
                background: "none",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                padding: 0,
                fontSize: "0.78rem",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              tap Skip
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
