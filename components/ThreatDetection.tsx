"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "@/components/ChessBoard";
import StockfishAnalysis from "@/components/StockfishAnalysis";
import { loadPuzzleSettings } from "@/components/PuzzleSettingsModal";
import {
  buildThreatDetectionSession,
  evaluateThreatDefenseMove,
  loadThreatDetectionProgress,
  recordThreatDetectionSession,
  THREAT_LABELS,
  type ThreatPuzzle,
} from "@/lib/threat-puzzles";

type Phase = "solve" | "feedback" | "summary";

export default function ThreatDetection() {
  const [session, setSession] = useState<ThreatPuzzle[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("solve");
  const [defenseFlags, setDefenseFlags] = useState<boolean[]>([]);
  const [defenseMessage, setDefenseMessage] = useState("");
  const [boardFen, setBoardFen] = useState("");
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [defenseHintUsed, setDefenseHintUsed] = useState(false);
  const [showThreatArrow, setShowThreatArrow] = useState(false);
  const [evaluatingDefense, setEvaluatingDefense] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const progress = useMemo(() => loadThreatDetectionProgress(), []);

  // Timer state
  const puzzleSettings = useMemo(() => loadPuzzleSettings(), []);
  const timerLimit = puzzleSettings.timeLimit > 0 ? puzzleSettings.timeLimit : 0;
  const [timeLeft, setTimeLeft] = useState(timerLimit);
  const [timerActive, setTimerActive] = useState(false);
  const timerExpiredRef = useRef(false);

  // Per-puzzle solve time tracking
  const puzzleStartRef = useRef<number>(Date.now());
  const [solveTimes, setSolveTimes] = useState<number[]>([]);

  useEffect(() => {
    buildThreatDetectionSession(10).then((next) => {
      setSession(next);
      setBoardFen(next[0]?.fen || "");
      setLastMove(undefined); // no last move — position is before the blunder
      setDefenseFlags(new Array(next.length).fill(false));
      setSolveTimes(new Array(next.length).fill(0));
      if (timerLimit > 0) { setTimeLeft(timerLimit); setTimerActive(true); }
      puzzleStartRef.current = Date.now();
    }).catch((err) => {
      console.error("[ThreatDetection] Failed to build session:", err);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const puzzle = session[idx];

  // Reset when puzzle advances
  useEffect(() => {
    if (!puzzle) return;
    setBoardFen(puzzle.fen);
    setLastMove(undefined); // no last move — position is before the blunder
    setDefenseMessage("");
    setPhase("solve");
    setDefenseHintUsed(false);
    setShowThreatArrow(false);
    setEvaluatingDefense(false);
    setShowAnalysis(false);
    timerExpiredRef.current = false;
    if (timerLimit > 0) { setTimeLeft(timerLimit); setTimerActive(true); }
    puzzleStartRef.current = Date.now();
  }, [idx, puzzle, timerLimit]);

  // Timer countdown
  useEffect(() => {
    if (!timerActive || timeLeft <= 0 || timerLimit === 0) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { setTimerActive(false); timerExpiredRef.current = true; return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerActive, timerLimit]);

  // Timer expired
  useEffect(() => {
    if (timeLeft !== 0 || !timerExpiredRef.current || phase !== "solve") return;
    timerExpiredRef.current = false;
    const nextDefFlags = [...defenseFlags];
    nextDefFlags[idx] = false;
    setDefenseFlags(nextDefFlags);
    setDefenseMessage("Time's up!");
    setPhase("feedback");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // The threat is now known directly from the puzzle — it's the tactic move that follows the blunder
  const threatContinuationMove = puzzle?.tacticMove ?? null;

  if (!puzzle) {
    return <div style={{ color: "#94a3b8", padding: "2rem", textAlign: "center" }}>Loading threat session...</div>;
  }

  const defendedCorrect = defenseFlags.filter(Boolean).length;
  const timerColor = timerLimit > 0
    ? (timeLeft / timerLimit <= 0.2 ? "#ef4444" : timeLeft / timerLimit <= 0.5 ? "#f59e0b" : "#4ade80")
    : "#4ade80";

  const goNext = () => {
    if (idx >= session.length - 1) {
      const nonZero = solveTimes.filter((t) => t > 0);
      recordThreatDetectionSession({
        completedAt: new Date().toISOString(),
        identifiedCorrect: defendedCorrect, // no separate identify step
        defendedCorrect,
        total: session.length,
        avgSolveTimeMs: nonZero.length > 0 ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length) : undefined,
      }, session, defenseFlags, defenseFlags);
      setPhase("summary");
      setTimerActive(false);
      return;
    }
    setIdx((n) => n + 1);
  };

  const handleDefenseMove = (from: string, to: string) => {
    if (evaluatingDefense) return false;
    const uci = `${from}${to}`;
    const chess = new Chess(boardFen);
    try { chess.move({ from, to, promotion: "q" }); } catch { return false; }
    setBoardFen(chess.fen());
    setLastMove([from, to]);
    setTimerActive(false);
    setEvaluatingDefense(true);
    const elapsed = Date.now() - puzzleStartRef.current;
    const nextTimes = [...solveTimes];
    nextTimes[idx] = elapsed;
    setSolveTimes(nextTimes);
    evaluateThreatDefenseMove(puzzle, uci).then((result) => {
      const nextDefFlags = [...defenseFlags];
      nextDefFlags[idx] = result.correct;
      setDefenseFlags(nextDefFlags);
      setDefenseMessage(result.explanation);
      setEvaluatingDefense(false);
      setPhase("feedback");
    });
    return true;
  };

  const handleRevealThreat = () => {
    setDefenseHintUsed(true);
    setShowThreatArrow(true); // show what the threat is — arrows appear on board
    // Stay in "solve" phase — user can still try to find the defense!
    // defenseFlags[idx] is already false by default, so no need to set it
  };

  // Arrows: yellow = the blunder move, red = the tactic that follows it
  // Show during both "solve" (after hint) and "feedback" phases
  const threatArrows = showThreatArrow
    ? [
        { from: puzzle.attackerMove.slice(0, 2), to: puzzle.attackerMove.slice(2, 4), brush: "yellow" },
        ...(threatContinuationMove
          ? [{ from: threatContinuationMove.slice(0, 2), to: threatContinuationMove.slice(2, 4), brush: "red" }]
          : []),
      ]
    : [];

  // ── Summary ───────────────────────────────────────────────────────────────

  if (phase === "summary") {
    const updatedProgress = loadThreatDetectionProgress();
    const nonZero = solveTimes.filter((t) => t > 0);
    const avgTime = nonZero.length > 0 ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length / 1000) : null;

    return (
      <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ backgroundColor: "#2a160d", border: "1px solid #fb923c", borderRadius: "16px", padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "2.25rem", marginBottom: "0.6rem" }}>⚠️</div>
          <div style={{ color: "#fb923c", fontSize: "1.4rem", fontWeight: 900, marginBottom: "0.4rem" }}>Threat Detection Complete</div>
          <div style={{ color: "#e2e8f0" }}>
            You found {defendedCorrect}/{session.length} defensive moves correctly.
            {avgTime !== null && <span> Average time: {avgTime}s</span>}
          </div>
        </div>

        <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "14px", padding: "1.25rem" }}>
          <div style={{ color: "#94a3b8", marginBottom: "0.75rem", fontWeight: 700 }}>Pattern breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {Object.entries(updatedProgress.byPattern ?? {})
              .filter(([, s]) => s.seen > 0)
              .sort(([, a], [, b]) => b.seen - a.seen)
              .map(([pattern, stats]) => {
                const pct = Math.round((stats.defended / stats.seen) * 100);
                const color = pct >= 70 ? "#4ade80" : pct >= 40 ? "#f59e0b" : "#ef4444";
                return (
                  <div key={pattern} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0.6rem", backgroundColor: "#0f0f1a", borderRadius: "8px" }}>
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{THREAT_LABELS[pattern] || pattern}</span>
                    <span style={{ color, fontSize: "0.85rem" }}>{stats.defended}/{stats.seen} ({pct}%)</span>
                  </div>
                );
              })}
          </div>
        </div>

        <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "14px", padding: "1.25rem" }}>
          <div style={{ color: "#94a3b8", marginBottom: "0.5rem", fontWeight: 700 }}>Overall progress</div>
          <div style={{ color: "#e2e8f0", lineHeight: 1.8 }}>
            Sessions played: {updatedProgress.sessionsPlayed}<br />
            Total threats seen: {updatedProgress.totalThreatsSeen}<br />
            Total defenses found: {updatedProgress.defenseCorrect}
          </div>
        </div>

        {(updatedProgress.sessionHistory ?? []).length > 1 && (
          <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "14px", padding: "1.25rem" }}>
            <div style={{ color: "#94a3b8", marginBottom: "0.75rem", fontWeight: 700 }}>Recent sessions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {[...(updatedProgress.sessionHistory ?? [])].reverse().slice(0, 10).map((s, i) => {
                const date = new Date(s.completedAt);
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0.6rem", backgroundColor: i === 0 ? "#1a1a3a" : "#0f0f1a", borderRadius: "6px", fontSize: "0.85rem" }}>
                    <span style={{ color: "#94a3b8" }}>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                    <span style={{ color: "#e2e8f0" }}>{s.defendedCorrect}/{s.total}</span>
                    {s.avgSolveTimeMs && <span style={{ color: "#64748b" }}>{Math.round(s.avgSolveTimeMs / 1000)}s avg</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button onClick={() => {
          buildThreatDetectionSession(10).then((next) => {
            setSession(next);
            setIdx(0);
            setDefenseFlags(new Array(next.length).fill(false));
            setSolveTimes(new Array(next.length).fill(0));
            setBoardFen(next[0]?.fen || "");
            setLastMove(undefined);
            setPhase("solve");
            puzzleStartRef.current = Date.now();
            if (timerLimit > 0) { setTimeLeft(timerLimit); setTimerActive(true); }
          });
        }} style={{ backgroundColor: "#fb923c", color: "#fff", border: "none", borderRadius: "10px", padding: "0.9rem 1.25rem", fontWeight: 800, cursor: "pointer" }}>
          Start Another Session →
        </button>
      </div>
    );
  }

  // ── Main puzzle UI ────────────────────────────────────────────────────────

  const sideToMove = puzzle.orientation === "white" ? "White to move" : "Black to move";

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: "1rem", overflow: "hidden", width: "100%" }}>

      {/* LEFT SIDEBAR — mirrors Training layout */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "220px", flexShrink: 0, paddingTop: "0.25rem" }}>

        {/* Defend panel — mirrors CCT panel */}
        <div style={{
          backgroundColor: "#0d1621",
          border: `1px solid ${phase === "feedback" ? (defenseFlags[idx] ? "#4ade80" : "#ef4444") : "#2e3a5c"}`,
          borderRadius: "8px", padding: "0.75rem",
          minHeight: "160px", display: "flex", flexDirection: "column", justifyContent: "flex-start",
          transition: "border-color 0.2s",
        }}>
          <div style={{ color: "#475569", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>
            ⚠️ Prevent the Threat
          </div>

          {phase === "solve" && !evaluatingDefense && (
            <>
              <div style={{ color: "#64748b", fontSize: "0.72rem", marginBottom: "0.6rem", lineHeight: 1.45 }}>
                Your opponent has a {THREAT_LABELS[puzzle.threatType] || puzzle.threatType} coming. Find a move that prevents it.
              </div>
              <button
                onClick={handleRevealThreat}
                disabled={defenseHintUsed}
                style={{
                  backgroundColor: "transparent", border: `1px solid ${defenseHintUsed ? "#f59e0b" : "#2e3a5c"}`,
                  borderRadius: "6px", padding: "0.45rem 0.6rem",
                  color: defenseHintUsed ? "#f59e0b" : "#475569", fontSize: "0.78rem",
                  cursor: defenseHintUsed ? "default" : "pointer",
                  textAlign: "left", width: "100%", marginTop: "auto",
                }}
              >
                {defenseHintUsed ? "🎯 Threat shown on board" : "💡 Show the threat"}
              </button>
            </>
          )}

          {phase === "solve" && evaluatingDefense && (
            <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginTop: "0.25rem" }}>Evaluating…</div>
          )}

          {phase === "feedback" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ color: defenseFlags[idx] ? "#4ade80" : "#ef4444", fontSize: "0.88rem", fontWeight: 700 }}>
                {defenseFlags[idx] ? "✓ Correct!" : "✗ Incorrect"}
              </div>
              <div style={{ color: "#94a3b8", fontSize: "0.75rem", lineHeight: 1.45 }}>{defenseMessage}</div>
              <div style={{ color: "#475569", fontSize: "0.72rem", lineHeight: 1.4, marginTop: "0.25rem" }}>
                Tactic: <span style={{ color: "#94a3b8" }}>{THREAT_LABELS[puzzle.threatType] || puzzle.threatType}</span>
              </div>
              <button
                onClick={() => setShowThreatArrow((v) => !v)}
                style={{
                  backgroundColor: "transparent", border: "1px solid #2e3a5c",
                  borderRadius: "6px", padding: "0.4rem 0.6rem",
                  color: showThreatArrow ? "#f87171" : "#475569",
                  fontSize: "0.75rem", cursor: "pointer", textAlign: "left", width: "100%", marginTop: "0.1rem",
                }}
              >
                🎯 {showThreatArrow ? "Hide threat" : "Show threat"}
              </button>
            </div>
          )}
        </div>

        {/* Analyze with Engine */}
        <button
          onClick={() => setShowAnalysis((v) => !v)}
          style={{
            backgroundColor: "transparent", border: "1px solid #2e3a5c",
            borderRadius: "6px", padding: "0.45rem 0.6rem",
            color: showAnalysis ? "#60a5fa" : "#475569",
            fontSize: "0.78rem", cursor: "pointer", textAlign: "left", width: "100%",
          }}
        >
          🔍 {showAnalysis ? "Hide Analysis" : "Analyze with Engine"}
        </button>

        {/* Timer */}
        {timerLimit > 0 && phase === "solve" && (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.4rem",
            backgroundColor: "#0f1621", border: `1px solid ${timerColor}`,
            borderRadius: "6px", padding: "0.4rem 0.6rem", transition: "border-color 0.3s",
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
        {timerLimit > 0 && phase !== "solve" && (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.4rem",
            backgroundColor: "#0f1621", border: "1px solid #2e3a5c",
            borderRadius: "6px", padding: "0.4rem 0.6rem",
          }}>
            <span style={{ fontSize: "0.75rem" }}>⏱</span>
            <span style={{ color: "#475569", fontSize: "1.1rem", fontWeight: "bold", fontFamily: "monospace" }}>{timeLeft}s</span>
          </div>
        )}

        {/* Puzzle info */}
        <div style={{ color: "#475569", fontSize: "0.75rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <div>Puzzle <span style={{ color: "#94a3b8" }}>{idx + 1} / {session.length}</span></div>
          {puzzle.rating > 0 && <div>Rating: <span style={{ color: "#94a3b8" }}>{puzzle.rating}</span></div>}
          <div>{sideToMove}</div>
        </div>

        {/* Next button in sidebar — only for correct answers (incorrect uses the board overlay) */}
        {phase === "feedback" && defenseFlags[idx] && (
          <button onClick={goNext} style={{
            backgroundColor: "#fb923c", color: "#fff", border: "none",
            borderRadius: "8px", padding: "0.65rem 1rem", fontWeight: 800,
            cursor: "pointer", fontSize: "0.85rem", width: "100%",
          }}>
            {idx >= session.length - 1 ? "Finish →" : "Next →"}
          </button>
        )}
      </div>

      {/* RIGHT COLUMN: board + overlay */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ position: "relative", width: 520, height: 520, overflow: "hidden" }}>
          <ChessBoard
            key={puzzle.id}
            fen={boardFen}
            onMove={phase === "solve" ? handleDefenseMove : undefined}
            draggable={phase === "solve" && !evaluatingDefense}
            orientation={puzzle.orientation}
            lastMove={lastMove}
            boardWidth={520}
            customArrows={threatArrows}
          />

          {/* Wrong Answer Overlay — matches Training style */}
          {phase === "feedback" && !defenseFlags[idx] && (
            <div style={{
              position: "absolute", inset: 0,
              backgroundColor: "rgba(10,15,26,0.93)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              borderRadius: "4px", padding: "1.5rem",
              gap: "0",
              zIndex: 50,
            }}>
              <div style={{ color: "#ef4444", fontSize: "1.5rem", fontWeight: "900", marginBottom: "0.25rem" }}>✗</div>
              <div style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "700", marginBottom: "0.15rem" }}>Missed this one</div>
              <div style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "1.25rem", textAlign: "center" }}>
                {defenseMessage}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", maxWidth: "220px" }}>
                <button
                  onClick={() => {
                    setBoardFen(puzzle.fen);
                    setLastMove(undefined);
                    setPhase("solve");
                    setDefenseMessage("");
                    setDefenseHintUsed(false);
                    setShowThreatArrow(false);
                    setEvaluatingDefense(false);
                    puzzleStartRef.current = Date.now();
                    if (timerLimit > 0) { setTimeLeft(timerLimit); setTimerActive(true); }
                  }}
                  style={{ backgroundColor: "#0a1f12", border: "1px solid #4ade80", borderRadius: "8px", padding: "0.55rem 1rem", color: "#4ade80", fontSize: "0.85rem", fontWeight: "600", cursor: "pointer" }}
                >
                  ↺ Retry Puzzle
                </button>
                <button
                  onClick={() => setShowAnalysis(true)}
                  style={{ backgroundColor: "#0f1a2e", border: "1px solid #60a5fa", borderRadius: "8px", padding: "0.55rem 1rem", color: "#60a5fa", fontSize: "0.85rem", fontWeight: "600", cursor: "pointer" }}
                >
                  🔍 Review with Engine
                </button>
                <button
                  onClick={goNext}
                  style={{ backgroundColor: "transparent", border: "1px solid #334155", borderRadius: "8px", padding: "0.55rem 1rem", color: "#94a3b8", fontSize: "0.85rem", fontWeight: "600", cursor: "pointer" }}
                >
                  → {idx >= session.length - 1 ? "Finish Session" : "Next Puzzle"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stockfish analysis modal */}
      {showAnalysis && (
        <StockfishAnalysis
          fen={puzzle.fen}
          orientation={puzzle.orientation}
          onClose={() => setShowAnalysis(false)}
        />
      )}
    </div>
  );
}
