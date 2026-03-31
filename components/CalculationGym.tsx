"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";
import ChessBoard from "./ChessBoard";
import {
  saveCalcGymSession,
  getCalcGymSessions,
  getCalcGymStats,
  type CalcGymSession,
} from "@/lib/storage";

// ── Types ──────────────────────────────────────────────────────────────────

type DrillType = "Forced Mate" | "Win Material" | "Defensive";

interface CalcDrill {
  id: string;
  puzzleId: string;
  fen: string;          // position after opponent's first move (what user sees)
  rawFen: string;       // original FEN from DB
  solution: string[];   // solution moves from user's perspective (after applying opp first move)
  rawMoves: string[];   // all moves including opp first
  firstMove: string;    // correct first move (UCI)
  choices: string[];    // 3 destination squares (A/B/C)
  correctChoice: number; // index 0-2 of correct choice
  drillType: DrillType;
  rating: number;
  themes: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function applyMove(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return chess.fen();
  } catch {
    return null;
  }
}

function classifyDrillType(themes: string[], moves: string[]): DrillType {
  const t = themes.join(" ").toLowerCase();
  if (t.includes("mate")) return "Forced Mate";
  if (t.includes("defensive") || t.includes("defend")) return "Defensive";
  return "Win Material";
}

function getToSquare(uci: string): string {
  return uci.slice(2, 4);
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build 3 answer choices where one is correct, two are plausible distractors */
function buildChoices(fen: string, correctMove: string): { choices: string[]; correctIndex: number } {
  const correctTo = getToSquare(correctMove);
  try {
    const chess = new Chess(fen);
    const allMoves = chess.moves({ verbose: true });
    const otherTos: string[] = allMoves
      .map((m) => m.to as string)
      .filter((sq) => sq !== correctTo);
    // deduplicate
    const unique = [...new Set(otherTos)];
    const distractors: string[] = shuffleArray(unique).slice(0, 2);
    // If we don't have 2 distractors, use fallback squares
    const fallbacks: string[] = ["e4", "d5", "c3", "f6", "g7", "b4"];
    for (const fb of fallbacks) {
      if (distractors.length >= 2) break;
      if (!distractors.includes(fb) && fb !== correctTo) distractors.push(fb);
    }
    const all = shuffleArray([correctTo, ...distractors]);
    return { choices: all, correctIndex: all.indexOf(correctTo) };
  } catch {
    // fallback: just use the correct square + two generic distractors
    const choices = [correctTo, "e4", "d5"];
    return { choices, correctIndex: 0 };
  }
}

/** Sample puzzles for the Calculation Gym session.
 *  Uses puzzles with 4+ solution moves (after applying opp first move).
 */
function sampleCalcDrills(count: number): CalcDrill[] {
  const allThemes = Object.keys(cachedPuzzlesByTheme);
  const drills: CalcDrill[] = [];
  const usedIds = new Set<string>();

  // Shuffle themes for variety
  const shuffledThemes = shuffleArray(allThemes);

  for (const theme of shuffledThemes) {
    if (drills.length >= count) break;
    const puzzles = cachedPuzzlesByTheme[theme];
    if (!puzzles || puzzles.length === 0) continue;

    // Filter for puzzles with 5+ raw moves (means 4+ solution moves after applying first)
    const eligible = puzzles.filter((p) => p.moves.length >= 5 && !usedIds.has(p.id));
    if (eligible.length === 0) continue;

    const raw = eligible[Math.floor(Math.random() * eligible.length)];
    usedIds.add(raw.id);

    // Apply opponent's first move to get actual puzzle position
    const opponentMove = raw.moves[0];
    const afterOppFen = applyMove(raw.fen, opponentMove);
    if (!afterOppFen) continue;

    const solutionMoves = raw.moves.slice(1); // user's moves start here
    const firstMove = solutionMoves[0];
    if (!firstMove) continue;

    const { choices, correctIndex } = buildChoices(afterOppFen, firstMove);
    const drillType = classifyDrillType(raw.themes, raw.moves);

    drills.push({
      id: `cgym-${raw.id}`,
      puzzleId: raw.id,
      fen: afterOppFen,
      rawFen: raw.fen,
      solution: solutionMoves,
      rawMoves: raw.moves,
      firstMove,
      choices,
      correctChoice: correctIndex,
      drillType,
      rating: raw.rating,
      themes: raw.themes,
    });
  }

  return drills.slice(0, count);
}

// ── Session Result Screen ─────────────────────────────────────────────────

function SessionResult({
  score,
  total,
  timeMs,
  onRestart,
}: {
  score: number;
  total: number;
  timeMs: number;
  onRestart: () => void;
}) {
  const stats = getCalcGymStats();
  const pct = Math.round((score / total) * 100);
  const color = pct >= 70 ? "#4ade80" : pct >= 40 ? "#f59e0b" : "#ef4444";
  const mins = Math.floor(timeMs / 60000);
  const secs = Math.floor((timeMs % 60000) / 1000);

  return (
    <div
      style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        padding: "2rem",
        textAlign: "center",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>
        {pct >= 70 ? "🧠" : pct >= 40 ? "💪" : "📖"}
      </div>
      <div style={{ color: color, fontSize: "2.5rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
        {score}/{total}
      </div>
      <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "0.25rem" }}>
        {pct}% correct · {mins > 0 ? `${mins}m ` : ""}{secs}s
      </div>
      <div style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "1.5rem" }}>
        Calculation Score: {score}/{total}
      </div>

      {/* Trend chart (last 10 sessions) */}
      {stats.totalSessions > 1 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              color: "#475569",
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "0.6rem",
            }}
          >
            Calculation Score Trend
          </div>
          <div style={{ display: "flex", gap: "0.3rem", justifyContent: "center", alignItems: "flex-end", height: "40px" }}>
            {stats.trend.map((s, i) => {
              const h = Math.max(6, Math.round((s / total) * 40));
              const isLast = i === stats.trend.length - 1;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                  <div
                    style={{
                      width: "14px",
                      height: `${h}px`,
                      backgroundColor: isLast ? color : "#2e75b6",
                      borderRadius: "3px 3px 0 0",
                      opacity: isLast ? 1 : 0.6,
                    }}
                  />
                  <span style={{ color: "#475569", fontSize: "0.6rem" }}>{s}</span>
                </div>
              );
            })}
          </div>
          <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: "0.4rem" }}>
            Avg score: {stats.avgScore} / {total} across {stats.totalSessions} sessions
          </div>
        </div>
      )}

      <button
        onClick={onRestart}
        style={{
          backgroundColor: "#2e75b6",
          color: "white",
          border: "none",
          borderRadius: "10px",
          padding: "0.75rem 2rem",
          cursor: "pointer",
          fontWeight: "bold",
          fontSize: "0.95rem",
          width: "100%",
        }}
      >
        Start New Session
      </button>
    </div>
  );
}

// ── Single Drill View ──────────────────────────────────────────────────────

function DrillView({
  drill,
  drillNumber,
  totalDrills,
  onAnswer,
}: {
  drill: CalcDrill;
  drillNumber: number;
  totalDrills: number;
  onAnswer: (correct: boolean) => void;
}) {
  const [phase, setPhase] = useState<"think" | "chosen" | "reveal">("think");
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [animatedFen, setAnimatedFen] = useState<string>(drill.fen);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const choiceLabels = ["A", "B", "C"];

  useEffect(() => {
    setPhase("think");
    setSelectedChoice(null);
    setAnimatedFen(drill.fen);
    setLastMove(undefined);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
  }, [drill.id]);

  function handleChoiceSelect(idx: number) {
    if (phase !== "think") return;
    setSelectedChoice(idx);
    setPhase("chosen");
    const isCorrect = idx === drill.correctChoice;
    // Reveal full line after brief pause
    animTimerRef.current = setTimeout(() => {
      setPhase("reveal");
      animateSolution();
    }, 600);
    onAnswer(isCorrect);
  }

  function animateSolution() {
    let currentFen = drill.fen;
    const moves = drill.solution;
    moves.forEach((uci, i) => {
      animTimerRef.current = setTimeout(() => {
        const newFen = applyMove(currentFen, uci);
        if (newFen) {
          currentFen = newFen;
          setAnimatedFen(newFen);
          setLastMove([uci.slice(0, 2), uci.slice(2, 4)]);
        }
      }, (i + 1) * 700);
    });
  }

  const drillTypeColors: Record<DrillType, string> = {
    "Forced Mate": "#ef4444",
    "Win Material": "#f59e0b",
    "Defensive": "#a855f7",
  };
  const drillTypeIcons: Record<DrillType, string> = {
    "Forced Mate": "♔",
    "Win Material": "♟",
    "Defensive": "🛡️",
  };

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const boardWidth = isMobile ? Math.min(window.innerWidth - 32, 340) : 400;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          backgroundColor: "#1a1a2e",
          border: "1px solid #2e3a5c",
          borderRadius: "12px",
          padding: "0.9rem 1.1rem",
          marginBottom: "0.75rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              color: drillTypeColors[drill.drillType],
              backgroundColor: `${drillTypeColors[drill.drillType]}18`,
              border: `1px solid ${drillTypeColors[drill.drillType]}40`,
              borderRadius: "6px",
              padding: "0.2rem 0.55rem",
              fontSize: "0.78rem",
              fontWeight: "bold",
            }}
          >
            {drillTypeIcons[drill.drillType]} {drill.drillType}
          </span>
          <span style={{ color: "#64748b", fontSize: "0.78rem" }}>Rating: {drill.rating}</span>
        </div>
        <span style={{ color: "#64748b", fontSize: "0.78rem" }}>
          Drill {drillNumber} of {totalDrills}
        </span>
      </div>

      {/* Instruction */}
      <div
        style={{
          backgroundColor: "#111827",
          border: "1px solid #1e2a3a",
          borderRadius: "10px",
          padding: "0.7rem 1rem",
          marginBottom: "0.75rem",
          color: "#94a3b8",
          fontSize: "0.85rem",
          lineHeight: 1.6,
        }}
      >
        {phase === "think" ? (
          <>
            🧠 <strong style={{ color: "#e2e8f0" }}>Mentally calculate</strong> the best continuation
            (4+ moves deep). Then pick the destination square of the{" "}
            <strong style={{ color: "#4ade80" }}>first move</strong>.
          </>
        ) : phase === "chosen" ? (
          <span style={{ color: "#f59e0b" }}>Revealing solution line...</span>
        ) : (
          <span style={{ color: "#4ade80" }}>Full solution line revealed ↓</span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "auto 1fr",
          gap: "0.75rem",
          alignItems: "start",
        }}
      >
        {/* Board — no moving allowed, just view */}
        <ChessBoard
          key={drill.id}
          fen={animatedFen}
          orientation={drill.fen.includes(" b ") ? "black" : "white"}
          lastMove={lastMove}
          draggable={false}
          boardWidth={boardWidth}
        />

        {/* Choices panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div
            style={{
              color: "#475569",
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "0.2rem",
            }}
          >
            First move lands on:
          </div>
          {drill.choices.map((sq, idx) => {
            const isCorrect = idx === drill.correctChoice;
            const isSelected = idx === selectedChoice;
            let bg = "#0f1621";
            let border = "#2e3a5c";
            let color = "#e2e8f0";

            if (phase !== "think") {
              if (isCorrect) {
                bg = "#0a1f12";
                border = "#22c55e";
                color = "#4ade80";
              } else if (isSelected && !isCorrect) {
                bg = "#1f0a0a";
                border = "#ef4444";
                color = "#ef4444";
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleChoiceSelect(idx)}
                disabled={phase !== "think"}
                style={{
                  backgroundColor: bg,
                  border: `2px solid ${border}`,
                  borderRadius: "10px",
                  padding: "0.75rem 1rem",
                  color,
                  fontSize: "1rem",
                  fontWeight: "bold",
                  cursor: phase === "think" ? "pointer" : "not-allowed",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (phase === "think") {
                    e.currentTarget.style.backgroundColor = "#1e2a3a";
                    e.currentTarget.style.borderColor = "#4a7aac";
                  }
                }}
                onMouseLeave={(e) => {
                  if (phase === "think") {
                    e.currentTarget.style.backgroundColor = bg;
                    e.currentTarget.style.borderColor = border;
                  }
                }}
              >
                <span
                  style={{
                    backgroundColor: phase !== "think" && isCorrect ? "#22c55e" : "#1e2a3a",
                    borderRadius: "6px",
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.85rem",
                    flexShrink: 0,
                    color: phase !== "think" && isCorrect ? "#0a1f12" : "#94a3b8",
                    fontWeight: "bold",
                  }}
                >
                  {choiceLabels[idx]}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: "1.1rem", letterSpacing: "0.05em" }}>
                  {sq}
                </span>
                {phase !== "think" && isCorrect && (
                  <span style={{ marginLeft: "auto", fontSize: "1rem" }}>✓</span>
                )}
                {phase !== "think" && isSelected && !isCorrect && (
                  <span style={{ marginLeft: "auto", fontSize: "1rem" }}>✗</span>
                )}
              </button>
            );
          })}

          {/* Solution line (shown after reveal) */}
          {phase !== "think" && (
            <div
              style={{
                backgroundColor: "#0a1520",
                border: "1px solid #1e3a5c",
                borderRadius: "10px",
                padding: "0.75rem",
                marginTop: "0.25rem",
              }}
            >
              <div
                style={{
                  color: "#475569",
                  fontSize: "0.68rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "0.4rem",
                }}
              >
                Full line:
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.3rem",
                  alignItems: "center",
                }}
              >
                {drill.solution.map((uci, i) => (
                  <span
                    key={i}
                    style={{
                      color: i % 2 === 0 ? "#4ade80" : "#94a3b8",
                      backgroundColor: i % 2 === 0 ? "#0a1f12" : "transparent",
                      borderRadius: "4px",
                      padding: "0.1rem 0.35rem",
                      fontSize: "0.8rem",
                      fontFamily: "monospace",
                      fontWeight: i === 0 ? "bold" : "normal",
                      border: i === 0 ? "1px solid #22c55e40" : "none",
                    }}
                  >
                    {uci}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Calculation Gym ───────────────────────────────────────────────────

const SESSION_SIZE = 10;

type GymPhase = "idle" | "session" | "result";

export default function CalculationGym() {
  const [phase, setPhase] = useState<GymPhase>("idle");
  const [drills, setDrills] = useState<CalcDrill[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState<boolean[]>([]);
  const [waitingForNext, setWaitingForNext] = useState(false);
  const sessionStartRef = useRef<number>(0);
  const stats = getCalcGymStats();

  function startSession() {
    const newDrills = sampleCalcDrills(SESSION_SIZE);
    if (newDrills.length === 0) return;
    setDrills(newDrills);
    setCurrentIdx(0);
    setScores([]);
    setWaitingForNext(false);
    sessionStartRef.current = Date.now();
    setPhase("session");
  }

  const handleAnswer = useCallback(
    (correct: boolean) => {
      setScores((prev) => {
        const next = [...prev, correct];
        setWaitingForNext(true);
        return next;
      });
    },
    []
  );

  function handleNext() {
    if (currentIdx + 1 >= drills.length) {
      // End of session
      const timeMs = Date.now() - sessionStartRef.current;
      const correctCount = scores.filter(Boolean).length;
      const session: CalcGymSession = {
        id: `session-${Date.now()}`,
        date: new Date().toISOString(),
        score: correctCount,
        total: SESSION_SIZE,
        timeMs,
      };
      saveCalcGymSession(session);
      setPhase("result");
    } else {
      setCurrentIdx((i) => i + 1);
      setWaitingForNext(false);
    }
  }

  const correctSoFar = scores.filter(Boolean).length;

  // ── Idle state ──────────────────────────────────────────────────────────

  if (phase === "idle") {
    return (
      <div
        style={{
          backgroundColor: "#12192a",
          border: "1px solid #1e3a5c",
          borderRadius: "14px",
          padding: "1.5rem",
          marginTop: "2rem",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <span style={{ fontSize: "1.5rem" }}>🧠</span>
          <div>
            <h2
              style={{
                color: "#e2e8f0",
                fontSize: "1.15rem",
                fontWeight: "bold",
                margin: 0,
              }}
            >
              Calculation Gym
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.8rem", margin: "0.15rem 0 0" }}>
              Train deep calculation — no moving pieces, just think
            </p>
          </div>
        </div>

        {/* Description */}
        <div
          style={{
            backgroundColor: "#0a1520",
            border: "1px solid #1e3a5c",
            borderRadius: "10px",
            padding: "0.85rem 1rem",
            marginBottom: "1.25rem",
            color: "#94a3b8",
            fontSize: "0.84rem",
            lineHeight: 1.65,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div>♔ <strong style={{ color: "#ef4444" }}>Forced Mate</strong> — find mate in 2 or 3</div>
            <div>♟ <strong style={{ color: "#f59e0b" }}>Win Material</strong> — find the line that wins a piece</div>
            <div>🛡️ <strong style={{ color: "#a855f7" }}>Defensive</strong> — find the only move that doesn&apos;t lose</div>
            <div style={{ marginTop: "0.25rem", color: "#64748b", fontSize: "0.78rem" }}>
              Session = 10 drills · Pick the destination square of the best first move
            </div>
          </div>
        </div>

        {/* Stats row */}
        {stats.totalSessions > 0 && (
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginBottom: "1.25rem",
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Sessions", value: String(stats.totalSessions) },
              { label: "Avg Score", value: `${stats.avgScore}/${SESSION_SIZE}` },
              {
                label: "Best",
                value: `${Math.max(...getCalcGymSessions().map((s) => s.score))}/${SESSION_SIZE}`,
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  backgroundColor: "#0a1520",
                  border: "1px solid #1e3a5c",
                  borderRadius: "8px",
                  padding: "0.5rem 0.85rem",
                  flex: 1,
                  minWidth: "80px",
                }}
              >
                <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "1rem" }}>{value}</div>
                <div style={{ color: "#475569", fontSize: "0.7rem" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={startSession}
          style={{
            backgroundColor: "#2e75b6",
            color: "white",
            border: "none",
            borderRadius: "10px",
            padding: "0.85rem 2rem",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "1rem",
            width: "100%",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#3a8fd6")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#2e75b6")}
        >
          Start Session →
        </button>
      </div>
    );
  }

  // ── Result state ────────────────────────────────────────────────────────

  if (phase === "result") {
    const finalScore = scores.filter(Boolean).length;
    const timeMs = Date.now() - sessionStartRef.current;
    return (
      <div
        style={{
          backgroundColor: "#12192a",
          border: "1px solid #1e3a5c",
          borderRadius: "14px",
          padding: "1.5rem",
          marginTop: "2rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <span style={{ fontSize: "1.5rem" }}>🧠</span>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.15rem", fontWeight: "bold", margin: 0 }}>
            Calculation Gym — Session Complete
          </h2>
        </div>
        <SessionResult
          score={finalScore}
          total={SESSION_SIZE}
          timeMs={timeMs}
          onRestart={() => {
            setPhase("idle");
          }}
        />
      </div>
    );
  }

  // ── Active session ──────────────────────────────────────────────────────

  const drill = drills[currentIdx];
  if (!drill) return null;

  return (
    <div
      style={{
        backgroundColor: "#12192a",
        border: "1px solid #1e3a5c",
        borderRadius: "14px",
        padding: "1.5rem",
        marginTop: "2rem",
      }}
    >
      {/* Session header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.25rem" }}>🧠</span>
          <span style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem" }}>Calculation Gym</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.9rem" }}>
            {correctSoFar} correct
          </span>
          <span style={{ color: "#64748b", fontSize: "0.82rem" }}>
            {currentIdx + 1} / {SESSION_SIZE}
          </span>
          {/* Mini progress dots */}
          <div style={{ display: "flex", gap: "4px" }}>
            {Array.from({ length: SESSION_SIZE }).map((_, i) => {
              const answered = i < scores.length;
              const correct = answered && scores[i];
              return (
                <div
                  key={i}
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: !answered
                      ? i === currentIdx
                        ? "#2e75b6"
                        : "#1e2a3a"
                      : correct
                      ? "#4ade80"
                      : "#ef4444",
                    border: i === currentIdx && !answered ? "1px solid #4a9adc" : "none",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Drill */}
      <DrillView
        drill={drill}
        drillNumber={currentIdx + 1}
        totalDrills={SESSION_SIZE}
        onAnswer={handleAnswer}
      />

      {/* Next button — appears after answering */}
      {waitingForNext && (
        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <button
            onClick={handleNext}
            style={{
              backgroundColor: "#166534",
              color: "#86efac",
              border: "1px solid #15803d",
              borderRadius: "10px",
              padding: "0.75rem 2.5rem",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.95rem",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1a7a3e")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#166534")}
          >
            {currentIdx + 1 >= SESSION_SIZE ? "See Results →" : "Next Drill →"}
          </button>
        </div>
      )}
    </div>
  );
}
