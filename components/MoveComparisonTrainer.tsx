"use client";

import { useState, useEffect, useCallback } from "react";
import { Chess } from "chess.js";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";
import ChessBoard from "./ChessBoard";
import {
  recordMoveComparisonEntry,
  getMoveComparisonStats,
} from "@/lib/storage";

// ── Types ──────────────────────────────────────────────────────────────────

interface MoveOption {
  uci: string;      // e.g. "e2e4"
  from: string;
  to: string;
  label: "A" | "B" | "C";
  rank: number;     // 1 = best, 2 = second, 3 = worst
  description: string;
  quality: "Best" | "Good" | "Playable";
}

interface ComparisonPosition {
  puzzleId: string;
  fen: string;         // position the user sees
  playerColor: "w" | "b";
  options: MoveOption[];
  rating: number;
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

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pieceAt(fen: string, sq: string): string | null {
  try {
    const chess = new Chess(fen);
    const piece = chess.get(sq as Parameters<typeof chess.get>[0]);
    if (!piece) return null;
    const name = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }[piece.type] ?? piece.type;
    return name;
  } catch {
    return null;
  }
}

function describeMove(fen: string, uci: string, rank: number, themes: string[]): { description: string; quality: "Best" | "Good" | "Playable" } {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from, to, promotion: "q" });
    const isCapture = move?.captured !== undefined;
    const isCheck = chess.inCheck();
    const themeStr = themes.join(" ").toLowerCase();

    if (rank === 1) {
      let desc = "Best: ";
      if (isCapture && isCheck) desc += "captures and gives check — wins material immediately";
      else if (isCheck) desc += "gives check — forces a strong response from the opponent";
      else if (isCapture) {
        const capturedMap: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" };
        const captured = capturedMap[move.captured ?? "p"] ?? "piece";
        if (themeStr.includes("fork")) desc += `fork — captures ${captured} while attacking another piece`;
        else if (themeStr.includes("pin")) desc += `captures ${captured} exploiting the pin`;
        else if (themeStr.includes("skewer")) desc += `skewer — wins material after forcing the king/queen to move`;
        else desc += `captures ${captured} for a material gain`;
      } else if (themeStr.includes("fork")) desc += "fork — attacks two pieces simultaneously";
      else if (themeStr.includes("discovered")) desc += "discovered attack — unleashes a hidden attacker";
      else desc += "strongest move — gains the most advantage";
      return { description: desc, quality: "Best" };
    } else if (rank === 2) {
      let desc = "Good: ";
      if (isCapture) desc += "wins material but misses the most efficient continuation";
      else if (isCheck) desc += "gives check but allows the opponent a better defense";
      else desc += "maintains pressure but misses a more immediate gain";
      return { description: desc, quality: "Good" };
    } else {
      let desc = "Playable: ";
      if (isCapture) desc += "captures a piece but allows a strong reply";
      else desc += "safe but passive — no immediate advantage gained";
      return { description: desc, quality: "Playable" };
    }
  } catch {
    const quality: "Best" | "Good" | "Playable" = rank === 1 ? "Best" : rank === 2 ? "Good" : "Playable";
    return { description: rank === 1 ? "Best: the strongest move in this position" : rank === 2 ? "Good: a solid move but not the best" : "Playable: safe but not optimal", quality };
  }
}

/** Build 3 move options: correct move (rank 1) + 2 plausible alternatives */
function buildMoveOptions(fen: string, correctUci: string, themes: string[]): MoveOption[] | null {
  try {
    const chess = new Chess(fen);
    const allMoves = chess.moves({ verbose: true });
    if (allMoves.length < 3) return null;

    // Correct move
    const correctFrom = correctUci.slice(0, 2);
    const correctTo = correctUci.slice(2, 4);

    // Find 2 alternatives: prefer captures or checks, then other moves
    const others = allMoves.filter(m => !(m.from === correctFrom && m.to === correctTo));
    
    // Prioritize interesting alternatives (checks, captures, nearby squares)
    const scored = others.map(m => {
      let score = 0;
      if (m.captured) score += 3;
      if (m.flags.includes("c")) score += 2; // check
      // Prefer moves with pieces that are similar to the solution piece
      const solPiece = allMoves.find(mv => mv.from === correctFrom)?.piece;
      if (m.piece === solPiece) score += 1;
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score + (Math.random() - 0.5) * 0.5);
    
    const alt1 = scored[0]?.m;
    // Pick alt2 from a different from-square if possible
    const alt2Candidates = scored.filter(s => s.m.from !== (alt1?.from ?? "")).slice(0, 5);
    const alt2 = (alt2Candidates[0] || scored[1])?.m;

    if (!alt1 || !alt2) return null;

    const { description: desc1, quality: q1 } = describeMove(fen, correctUci, 1, themes);
    const { description: desc2, quality: q2 } = describeMove(fen, `${alt1.from}${alt1.to}`, 2, themes);
    const { description: desc3, quality: q3 } = describeMove(fen, `${alt2.from}${alt2.to}`, 3, themes);

    const rawOptions: Array<{ uci: string; rank: number; description: string; quality: "Best" | "Good" | "Playable" }> = [
      { uci: correctUci, rank: 1, description: desc1, quality: q1 },
      { uci: `${alt1.from}${alt1.to}`, rank: 2, description: desc2, quality: q2 },
      { uci: `${alt2.from}${alt2.to}`, rank: 3, description: desc3, quality: q3 },
    ];

    const shuffled = shuffleArray(rawOptions);
    return shuffled.map((opt, i) => ({
      ...opt,
      from: opt.uci.slice(0, 2),
      to: opt.uci.slice(2, 4),
      label: (["A", "B", "C"] as const)[i],
    }));
  } catch {
    return null;
  }
}

function samplePositions(count: number): ComparisonPosition[] {
  const positions: ComparisonPosition[] = [];
  const usedIds = new Set<string>();
  const allThemes = Object.keys(cachedPuzzlesByTheme);
  const shuffledThemes = shuffleArray(allThemes);

  for (const theme of shuffledThemes) {
    if (positions.length >= count) break;
    const puzzles = cachedPuzzlesByTheme[theme];
    const shuffled = shuffleArray(puzzles);

    for (const puzzle of shuffled) {
      if (positions.length >= count) break;
      if (usedIds.has(puzzle.id)) continue;
      if (puzzle.moves.length < 2) continue;

      // Apply first move (opponent) to get position user sees
      const oppMove = puzzle.moves[0];
      const playFen = applyMove(puzzle.fen, oppMove);
      if (!playFen) continue;

      const correctMove = puzzle.moves[1]; // user's first move
      const opts = buildMoveOptions(playFen, correctMove, puzzle.themes);
      if (!opts) continue;

      // Determine player color from playFen
      const playerColor: "w" | "b" = playFen.split(" ")[1] as "w" | "b";

      positions.push({
        puzzleId: puzzle.id,
        fen: playFen,
        playerColor,
        options: opts,
        rating: puzzle.rating,
      });
      usedIds.add(puzzle.id);
    }
  }

  return positions;
}

// ── Main Component ─────────────────────────────────────────────────────────

const SESSION_SIZE = 10;

type SessionState = "idle" | "playing" | "complete";

export default function MoveComparisonTrainer() {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [positions, setPositions] = useState<ComparisonPosition[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<MoveOption | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionScore, setSessionScore] = useState(0);
  const [sessionAnswers, setSessionAnswers] = useState<Array<{ rank: number; score: number }>>([]);
  const [highlightSquares, setHighlightSquares] = useState<Record<string, { background: string }>>({});
  const [stats, setStats] = useState<ReturnType<typeof getMoveComparisonStats> | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setStats(getMoveComparisonStats());
  }, []);

  function startSession() {
    const pos = samplePositions(SESSION_SIZE);
    setPositions(pos);
    setCurrentIndex(0);
    setSelected(null);
    setRevealed(false);
    setSessionScore(0);
    setSessionAnswers([]);
    setHighlightSquares({});
    setSessionState("playing");
  }

  function handleSelect(option: MoveOption) {
    if (revealed) return;
    setSelected(option);
    setRevealed(true);

    const pts = option.rank === 1 ? 2 : option.rank === 2 ? 1 : 0;

    // Highlight all options on the board
    const currentPos = positions[currentIndex];
    const highlights: Record<string, { background: string }> = {};
    for (const opt of currentPos.options) {
      const color = opt.rank === 1 ? "rgba(74,222,128,0.45)" : opt.rank === 2 ? "rgba(251,191,36,0.35)" : "rgba(239,68,68,0.35)";
      highlights[opt.from] = { background: color };
      highlights[opt.to] = { background: color };
    }
    setHighlightSquares(highlights);

    const score = sessionScore + pts;
    const answers = [...sessionAnswers, { rank: option.rank, score: pts }];
    setSessionScore(score);
    setSessionAnswers(answers);

    // Record to storage
    recordMoveComparisonEntry({
      puzzleId: currentPos.puzzleId,
      pickedRank: option.rank,
      score: pts,
      date: new Date().toISOString().slice(0, 10),
    });
  }

  function handleNext() {
    const next = currentIndex + 1;
    if (next >= positions.length) {
      setSessionState("complete");
      setStats(getMoveComparisonStats());
    } else {
      setCurrentIndex(next);
      setSelected(null);
      setRevealed(false);
      setHighlightSquares({});
    }
  }

  const currentPos = positions[currentIndex];
  const maxScore = sessionAnswers.length * 2;

  const qualityColor: Record<string, string> = {
    Best: "#4ade80",
    Good: "#f59e0b",
    Playable: "#94a3b8",
  };

  // ── Idle State ─────────────────────────────────────────────────────────

  if (sessionState === "idle") {
    return (
      <div style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #2e3a5c",
        borderRadius: "12px",
        padding: "1.25rem",
        marginBottom: "1.5rem",
      }}>
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => setExpanded(e => !e)}
        >
          <div>
            <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem" }}>
              ⚖️ Move Comparison — Evaluate, Don&apos;t Just Spot
            </div>
            <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.2rem" }}>
              3 plausible moves, 10 positions — pick the best
            </div>
          </div>
          <span style={{ color: "#64748b", fontSize: "1.1rem" }}>{expanded ? "▲" : "▼"}</span>
        </div>

        {expanded && (
          <div style={{ marginTop: "1rem" }}>
            {stats && stats.totalSessions > 0 && (
              <div style={{
                backgroundColor: "#0d1b2e",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                display: "flex",
                gap: "1.5rem",
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "1.1rem" }}>{stats.evaluationScore}</div>
                  <div style={{ color: "#64748b", fontSize: "0.7rem" }}>Eval Score</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#7ab8e8", fontWeight: "bold", fontSize: "1.1rem" }}>{stats.bestPickPct}%</div>
                  <div style={{ color: "#64748b", fontSize: "0.7rem" }}>Best Pick Rate</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#94a3b8", fontWeight: "bold", fontSize: "1.1rem" }}>{stats.totalSessions}</div>
                  <div style={{ color: "#64748b", fontSize: "0.7rem" }}>Positions</div>
                </div>
              </div>
            )}

            <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginBottom: "1rem", lineHeight: 1.6 }}>
              Each position shows 3 plausible moves. All are reasonable — but one is clearly best.
              Scoring: Best = 2pts · Second best = 1pt · Worst = 0pts
            </div>
            <button
              onClick={startSession}
              style={{
                width: "100%",
                backgroundColor: "#2e75b6",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "0.8rem",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "0.95rem",
              }}
            >
              Start Session (10 positions)
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Complete State ─────────────────────────────────────────────────────

  if (sessionState === "complete") {
    const percent = maxScore > 0 ? Math.round((sessionScore / maxScore) * 100) : 0;
    const bestCount = sessionAnswers.filter(a => a.rank === 1).length;

    return (
      <div style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #2e3a5c",
        borderRadius: "12px",
        padding: "1.5rem",
        marginBottom: "1.5rem",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚖️</div>
        <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1.1rem", marginBottom: "0.25rem" }}>
          Session Complete
        </div>
        <div style={{ color: "#4ade80", fontSize: "2rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
          {sessionScore}/{maxScore}
        </div>
        <div style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "1.25rem" }}>
          {bestCount}/10 best moves found · {percent}% accuracy
        </div>
        {percent >= 80 && <div style={{ color: "#4ade80", fontSize: "0.85rem", marginBottom: "1rem" }}>🎯 Excellent evaluation! You&apos;re reading positions deeply.</div>}
        {percent >= 50 && percent < 80 && <div style={{ color: "#f59e0b", fontSize: "0.85rem", marginBottom: "1rem" }}>📈 Good start — keep practicing to sharpen your evaluation.</div>}
        {percent < 50 && <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "1rem" }}>💡 Focus on asking: what&apos;s the most forcing move available?</div>}
        <button
          onClick={startSession}
          style={{
            backgroundColor: "#2e75b6",
            color: "white",
            border: "none",
            borderRadius: "10px",
            padding: "0.75rem 2rem",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "0.9rem",
          }}
        >
          Play Again
        </button>
        <button
          onClick={() => setSessionState("idle")}
          style={{
            backgroundColor: "transparent",
            color: "#64748b",
            border: "none",
            borderRadius: "10px",
            padding: "0.75rem 1.5rem",
            cursor: "pointer",
            fontSize: "0.85rem",
            marginLeft: "0.75rem",
          }}
        >
          Done
        </button>
      </div>
    );
  }

  // ── Playing State ─────────────────────────────────────────────────────

  if (!currentPos) return null;

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "12px",
      padding: "1.25rem",
      marginBottom: "1.5rem",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.9rem" }}>⚖️ Move Comparison</div>
          <div style={{ color: "#64748b", fontSize: "0.72rem" }}>
            {currentIndex + 1}/{positions.length} · Score: {sessionScore}
          </div>
        </div>
        <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
          Rating ~{currentPos.rating}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: "3px", backgroundColor: "#1e2a3a", borderRadius: "2px", marginBottom: "1rem" }}>
        <div style={{
          height: "100%",
          backgroundColor: "#2e75b6",
          width: `${((currentIndex) / positions.length) * 100}%`,
          transition: "width 0.3s",
        }} />
      </div>

      {/* Board */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
        <ChessBoard
          fen={currentPos.fen}
          orientation={currentPos.playerColor === "w" ? "white" : "black"}
          boardWidth={Math.min(320, typeof window !== "undefined" ? window.innerWidth - 80 : 320)}
          highlightSquares={highlightSquares}
          draggable={false}
        />
      </div>

      {/* Move options */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
        {currentPos.options.map((option) => {
          const isSelected = selected?.label === option.label;
          const borderColor = !revealed
            ? isSelected ? "#2e75b6" : "#1e2a3a"
            : option.rank === 1 ? "#4ade80" : option.rank === 2 ? "#f59e0b" : "#3a1e1e";
          const bg = !revealed
            ? isSelected ? "rgba(46,117,182,0.15)" : "transparent"
            : option.rank === 1 ? "rgba(74,222,128,0.1)" : option.rank === 2 ? "rgba(251,191,36,0.08)" : "rgba(239,68,68,0.08)";

          return (
            <button
              key={option.label}
              onClick={() => handleSelect(option)}
              disabled={revealed}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.7rem 0.9rem",
                borderRadius: "8px",
                border: `1px solid ${borderColor}`,
                backgroundColor: bg,
                cursor: revealed ? "default" : "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              {/* Label badge */}
              <div style={{
                width: "26px",
                height: "26px",
                borderRadius: "6px",
                backgroundColor: !revealed ? "#1e2a3a" : option.rank === 1 ? "#4ade80" : option.rank === 2 ? "#f59e0b" : "#ef4444",
                color: !revealed ? "#94a3b8" : option.rank === 1 ? "#0f2a16" : option.rank === 2 ? "#2a1f0a" : "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                fontSize: "0.85rem",
                flexShrink: 0,
              }}>
                {option.label}
              </div>
              <div>
                <div style={{ color: "#e2e8f0", fontSize: "0.85rem", fontWeight: "600" }}>
                  {option.from.toUpperCase()} → {option.to.toUpperCase()}
                  {isSelected && !revealed && <span style={{ color: "#7ab8e8", marginLeft: "0.4rem" }}>←</span>}
                </div>
                {revealed && (
                  <div style={{ color: qualityColor[option.quality] ?? "#94a3b8", fontSize: "0.75rem", marginTop: "0.2rem", lineHeight: 1.4 }}>
                    {option.description}
                  </div>
                )}
              </div>
              {revealed && isSelected && (
                <div style={{
                  marginLeft: "auto",
                  color: option.rank === 1 ? "#4ade80" : option.rank === 2 ? "#f59e0b" : "#ef4444",
                  fontWeight: "bold",
                  fontSize: "0.9rem",
                  flexShrink: 0,
                }}>
                  +{option.rank === 1 ? 2 : option.rank === 2 ? 1 : 0}pts
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Next button */}
      {revealed && (
        <button
          onClick={handleNext}
          style={{
            width: "100%",
            backgroundColor: "#2e75b6",
            color: "white",
            border: "none",
            borderRadius: "10px",
            padding: "0.75rem",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "0.9rem",
          }}
        >
          {currentIndex + 1 < positions.length ? "Next Position →" : "See Results"}
        </button>
      )}
    </div>
  );
}
