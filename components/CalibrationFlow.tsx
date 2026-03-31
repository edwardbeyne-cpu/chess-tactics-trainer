"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";
import type { LichessCachedPuzzle } from "@/data/lichess-puzzles";

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
  return fen.split(" ")[1] === "w" ? "white" : "black";
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
  if (skipped) return Math.max(100, current - 75);
  if (!correct) return Math.max(100, current - 100);
  if (elapsedSecs < 15) return current + 250;
  if (elapsedSecs <= 60) return current + 150;
  return current + 75;
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
  const boardSize = useRef(400);

  calibEloRef.current = calibElo;
  puzzleIndexRef.current = puzzleIndex;
  madeErrorRef.current = madeError;
  elapsedRef.current = elapsed;
  phaseRef.current = phase;

  useEffect(() => {
    boardSize.current =
      typeof window !== "undefined" ? Math.min(440, window.innerWidth - 64) : 400;
  }, []);

  const loadPuzzle = useCallback((elo: number, used: Set<string>) => {
    const puzzle = selectPuzzle(elo, used);
    if (!puzzle) return;
    used.add(puzzle.id);
    setCurrentPuzzle(puzzle);
    setCurrentFen(puzzle.fen);
    setMoveIndex(0);
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
    const newElo = applyCalibStep(calibEloRef.current, secs, correct, skipped);
    const nextIdx = puzzleIndexRef.current + 1;

    if (nextIdx >= TOTAL_PUZZLES) {
      setFinalElo(newElo);
      setCalibElo(newElo);
      calibEloRef.current = newElo;
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

    return (
      <div style={{ padding: "1.5rem 1rem 0.5rem" }}>
        {/* Rating reveal */}
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>♟</div>
          <p style={{
            color: "#94a3b8",
            fontSize: "0.85rem",
            fontWeight: "600",
            margin: "0 0 0.2rem",
          }}>
            Your starting tactics rating:
          </p>
          <div style={{
            fontSize: "5rem",
            fontWeight: "900",
            color: "#4ade80",
            lineHeight: 1,
            margin: "0.4rem 0 0.2rem",
            textShadow: "0 0 48px rgba(74, 222, 128, 0.45)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}>
            {revealCount.toLocaleString()}
          </div>
          <div style={{
            display: "inline-block",
            backgroundColor: "rgba(255,255,255,0.05)",
            border: `1px solid ${tier.color}40`,
            borderRadius: "20px",
            padding: "0.2rem 0.75rem",
            fontSize: "0.78rem",
            color: tier.color,
            fontWeight: "600",
            marginBottom: "0.6rem",
          }}>
            {tier.label}
          </div>
          <p style={{ color: "#64748b", fontSize: "0.82rem", lineHeight: 1.6, margin: 0 }}>
            Based on your solve speed and accuracy across 10 puzzles
          </p>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #1e3a5c", marginBottom: "1.25rem" }} />

        {/* Connect step */}
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: "600", margin: "0 0 0.75rem", textAlign: "center" }}>
            Connect your Chess.com or Lichess account
          </p>
          <p style={{ color: "#475569", fontSize: "0.78rem", textAlign: "center", margin: "0 0 1rem", lineHeight: 1.5 }}>
            We&apos;ll analyze your games and build training around your actual weaknesses.
          </p>

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
                {connecting ? "Connecting…" : "Connect & Analyze →"}
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
              Skip — train without connecting
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

  const orientation = getOrientation(currentFen);
  const bw = boardSize.current;

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

        {/* Per-puzzle progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "0.35rem", marginTop: "0.55rem" }}>
          {Array.from({ length: TOTAL_PUZZLES }).map((_, i) => (
            <div
              key={i}
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor:
                  i < puzzleIndex ? "#22863a" : i === puzzleIndex ? "#60a5fa" : "#1e3a5c",
                transition: "background-color 0.3s",
              }}
            />
          ))}
        </div>
      </div>

      {/* Chess board */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.6rem" }}>
        <ChessBoard
          fen={currentFen}
          onMove={handleMove}
          lastMove={lastMove}
          boardWidth={bw}
          orientation={orientation}
        />
      </div>

      {/* Animated timer bar — green→yellow→red over 90 seconds */}
      <div style={{
        height: "4px",
        backgroundColor: "#0d1621",
        borderRadius: "2px",
        overflow: "hidden",
        marginBottom: "0.4rem",
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
