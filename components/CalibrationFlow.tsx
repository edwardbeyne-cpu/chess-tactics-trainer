"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";
import type { LichessCachedPuzzle } from "@/data/lichess-puzzles";
import { saveDailyTargetSettings } from "@/lib/storage";

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

async function fetchAllRatings(platform: Platform, username: string): Promise<AllRatings | null> {
  try {
    if (platform === "chesscom") {
      const res = await fetch(
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
      const res = await fetch(
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

function analyzeGamesForQueue(games: Array<{ pgn: string; playerColor: string }>): Array<{ pattern: string; fen: string }> {
  const results: Array<{ pattern: string; fen: string }> = [];
  for (const { pgn, playerColor } of games.slice(0, 10)) {
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
      if (isPlayerTurn && moveNum > 1) {
        const pattern = detectMissedTacticSimple(fen);
        if (pattern) results.push({ pattern, fen });
      }
    }
  }
  return results.slice(0, 20);
}

async function fetchRecentGames(platform: Platform, username: string): Promise<Array<{ pgn: string; playerColor: string }>> {
  try {
    if (platform === "chesscom") {
      const archivesRes = await fetch(
        `https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`,
        { headers: { "User-Agent": "ChessTacticsTrainer/1.0" } }
      );
      if (!archivesRes.ok) return [];
      const { archives } = await archivesRes.json() as { archives: string[] };
      if (!archives?.length) return [];
      const gamesRes = await fetch(archives[archives.length - 1], { headers: { "User-Agent": "ChessTacticsTrainer/1.0" } });
      if (!gamesRes.ok) return [];
      const { games } = await gamesRes.json() as { games: Array<{ pgn: string; white: { username: string }; black: { username: string } }> };
      if (!games?.length) return [];
      return games.slice(-10).map(g => ({
        pgn: g.pgn,
        playerColor: g.white.username.toLowerCase() === username.toLowerCase() ? "white" : "black",
      }));
    } else {
      const res = await fetch(
        `https://lichess.org/api/games/user/${username}?max=10&moves=true&pgnInJson=false`,
        { headers: { Accept: "application/x-ndjson" } }
      );
      if (!res.ok) return [];
      const text = await res.text();
      return text.trim().split("\n").filter(Boolean).map(line => {
        try {
          const game = JSON.parse(line);
          return {
            pgn: game.moves ?? "",
            playerColor: game.players?.white?.user?.name?.toLowerCase() === username.toLowerCase() ? "white" : "black",
          };
        } catch { return null; }
      }).filter((x): x is { pgn: string; playerColor: string } => x !== null);
    }
  } catch {
    return [];
  }
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
  const [phase, setPhase] = useState<"solving" | "transitioning" | "reveal">("solving");
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
  const [resultFlash, setResultFlash] = useState<"correct" | "wrong" | null>(null);

  // Reveal sub-step: rating → daily_goal → connect
  const [revealStep, setRevealStep] = useState<"rating" | "daily_goal" | "connect">("rating");

  // Daily goal step state
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);
  const [customGoalInput, setCustomGoalInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Connect step state (shown in reveal)
  const [platform, setPlatform] = useState<Platform>("chesscom");
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);
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



  const loadPuzzle = useCallback((elo: number, used: Set<string>) => {
    const puzzle = selectPuzzle(elo, used);
    if (!puzzle) return;
    used.add(puzzle.id);

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

    setCurrentPuzzle(puzzle);
    setCurrentFen(startFen);
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

    // Show result flash for 900ms before advancing
    if (!skipped) {
      setResultFlash(correct ? "correct" : "wrong");
      setTimeout(() => setResultFlash(null), 900);
    }

    const delay = skipped ? 0 : 900;
    setTimeout(() => {
      const newElo = applyCalibStep(calibEloRef.current, secs, correct, skipped);
      const nextIdx = puzzleIndexRef.current + 1;

      if (nextIdx >= TOTAL_PUZZLES) {
        setFinalElo(newElo);
        setCalibElo(newElo);
        calibEloRef.current = newElo;
        try {
          localStorage.setItem("ctt_calibration_rating", String(newElo));
        } catch { /* ignore */ }
        setPhase("reveal");
      } else {
        setCalibElo(newElo);
        calibEloRef.current = newElo;
        setPuzzleIndex(nextIdx);
        puzzleIndexRef.current = nextIdx;
        setPhase("transitioning");
        setTimeout(() => {
          setPhase("solving");
          loadPuzzle(newElo, usedIds.current);
        }, 350);
      }
    }, delay);
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
        // Auto-advance after 1.5 seconds on wrong move — don't leave user stuck
        setTimeout(() => advancePuzzle(false, false, elapsedRef.current), 1500);
        return false;
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
        setTimeout(() => advancePuzzle(!madeErrorRef.current, false, secs), 500);
        return true;
      }

      const oppMove = currentPuzzle.moves[nextMoveIdx];
      try {
        chess.move({
          from: oppMove.slice(0, 2),
          to: oppMove.slice(2, 4),
          ...(oppMove.length > 4 ? { promotion: oppMove[4] } : {}),
        });
      } catch {
        setCurrentFen(afterPlayer);
        setLastMove([from, to]);
        const secs = elapsedRef.current;
        setTimeout(() => advancePuzzle(!madeErrorRef.current, false, secs), 500);
        return true;
      }
      const afterOpp = chess.fen();
      setLastMove([oppMove.slice(0, 2) as string, oppMove.slice(2, 4) as string]);
      setCurrentFen(afterOpp);
      setMoveIndex(nextMoveIdx + 1);
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
      const games = await fetchRecentGames(plat, uname);
      if (games.length > 0) {
        const missed = analyzeGamesForQueue(games);
        if (missed.length > 0) {
          localStorage.setItem(CUSTOM_ANALYSIS_KEY, JSON.stringify({
            missedTactics: missed, platform: plat, username: uname, analyzedAt: new Date().toISOString(),
          }));
          const queue = missed.map((m, i) => ({ id: `custom_${i}`, fen: m.fen, theme: m.pattern, source: `${plat}:${uname}` }));
          localStorage.setItem(CUSTOM_QUEUE_KEY, JSON.stringify(queue));
        }
      }
    } catch {
      // Silent background task
    }
  }, []);

  async function handleConnect() {
    const uname = username.trim();
    if (!uname) return;
    setConnecting(true);
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
      setConnected(true);
      runBackgroundAnalysis(platform, uname);
    } catch {
      setConnectError("Connection failed. Check your username and try again.");
    } finally {
      setConnecting(false);
    }
  }

  // Timer bar — animates from full to empty over 90 seconds
  const barPct = Math.max(0, ((SKIP_VISIBLE_AT - elapsed) / SKIP_VISIBLE_AT) * 100);
  const barColor =
    elapsed < 30 ? "#4ade80" : elapsed < 60 ? "#fbbf24" : "#ef4444";

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

    // ── Sub-step: rating reveal ─────────────────────────────────────────────
    if (revealStep === "rating") {
      return (
        <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem", maxWidth: "480px", width: "100%" }}>
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
            <p style={{ color: "#64748b", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>
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
      const PRESET_GOALS = [5, 10, 20];

      function commitGoal(goal: number) {
        setSelectedGoal(goal);
        saveDailyTargetSettings({ dailyGoal: goal });
        setRevealStep("connect");
      }

      function handleCustomCommit() {
        const val = parseInt(customGoalInput, 10);
        if (!isNaN(val) && val >= 1 && val <= 100) {
          commitGoal(val);
        }
      }

      return (
        <div style={{ padding: "1.5rem 1rem 0.5rem" }}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <p style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "700", margin: "0 0 0.6rem" }}>
              How many puzzles can you commit to daily?
            </p>
            <p style={{ color: "#64748b", fontSize: "0.82rem", lineHeight: 1.6, margin: 0 }}>
              Players who set a daily goal complete 3x more puzzles
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1rem" }}>
            {PRESET_GOALS.map((g) => (
              <button
                key={g}
                onClick={() => commitGoal(g)}
                style={{
                  backgroundColor: selectedGoal === g ? "#0d2a1a" : "#0d1621",
                  border: `1px solid ${selectedGoal === g ? "#4ade80" : "#2e3a5c"}`,
                  borderRadius: "12px",
                  color: selectedGoal === g ? "#4ade80" : "#e2e8f0",
                  fontSize: "1rem",
                  fontWeight: "bold",
                  padding: "0.9rem",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textAlign: "center",
                }}
              >
                {g} puzzles / day
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

          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => { saveDailyTargetSettings({ dailyGoal: 10 }); setRevealStep("connect"); }}
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
          <p style={{ color: "#64748b", fontSize: "0.82rem", lineHeight: 1.6, margin: "0 0 1rem" }}>
            Players who connect their Chess.com account improve 2x faster — because your training targets your actual weaknesses, not just general patterns.
          </p>

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
                  backgroundColor: username.trim() && !connecting ? "#4ade80" : "#1a2535",
                  color: username.trim() && !connecting ? "#0f1a0a" : "#4a6a8a",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.7rem",
                  fontSize: "0.88rem",
                  fontWeight: "bold",
                  cursor: username.trim() && !connecting ? "pointer" : "not-allowed",
                  width: "100%",
                  marginBottom: "0.5rem",
                  transition: "background-color 0.15s",
                }}
              >
                {connecting
                  ? "Connecting…"
                  : platform === "chesscom"
                  ? "Connect Chess.com →"
                  : "Connect Lichess →"}
              </button>
            </>
          )}
        </div>

        {/* Start Training CTA */}
        <button
          onClick={() => onComplete(finalElo)}
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
          Start Training →
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

  // ── Loading / transition state ─────────────────────────────────────────────
  if (!currentPuzzle || phase === "transitioning") {
    return (
      <div style={{ textAlign: "center", padding: "4rem 1rem", color: "#64748b", fontSize: "0.9rem" }}>
        Loading…
      </div>
    );
  }

  // After applying opponent's first move, currentFen shows whose turn it is (the player's)
  const orientation = getOrientation(currentFen);
  const bw = boardWidth;

  // ── Solving screen ─────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <p style={{
          color: "#475569",
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          margin: "0 0 0.2rem",
        }}>
          Let&apos;s find your level
        </p>
        <p style={{ color: "#94a3b8", fontSize: "0.88rem", fontWeight: "600", margin: 0 }}>
          Puzzle {puzzleIndex + 1} of {TOTAL_PUZZLES}
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
          />
          {/* Result flash overlay */}
          {resultFlash && (
            <div style={{
              position: "absolute", inset: 0,
              backgroundColor: resultFlash === "correct" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "4px", pointerEvents: "none",
              fontSize: "2.5rem", fontWeight: "900",
              color: resultFlash === "correct" ? "#22c55e" : "#ef4444",
              textShadow: "0 2px 8px rgba(0,0,0,0.5)",
            }}>
              {resultFlash === "correct" ? "✓" : "✗"}
            </div>
          )}
        </div>
      </div>
      <p style={{
        fontSize: "0.85rem",
        color: "#94a3b8",
        textAlign: "center",
        margin: "0 0 0.5rem",
      }}>
          Find the best move for {orientation === "white" ? "White ♔" : "Black ♚"}
        </p>

      {/* Animated timer bar — green→yellow→red over 90 seconds */}
      <div style={{
        height: "4px",
        backgroundColor: "#0d1621",
        borderRadius: "2px",
        overflow: "hidden",
        marginTop: "0.75rem",
        marginBottom: "0.25rem",
      }}>
        <div style={{
          height: "100%",
          width: `${barPct}%`,
          backgroundColor: barColor,
          borderRadius: "2px",
          transition: "width 0.5s linear, background-color 0.5s ease",
        }} />
      </div>

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
