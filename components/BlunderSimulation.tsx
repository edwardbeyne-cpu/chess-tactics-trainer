"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Chess } from "chess.js";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";
import ChessBoard from "./ChessBoard";

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ctt_blunder_sim";

export interface BlunderSimStats {
  totalPositions: number;
  totalCorrect: number; // chose safe move
  sessions: BlunderSimSession[];
}

export interface BlunderSimSession {
  date: string;
  score: number;
  total: number;
  blunderPatterns: string[]; // patterns where user fell for blunder
}

function defaultStats(): BlunderSimStats {
  return { totalPositions: 0, totalCorrect: 0, sessions: [] };
}

function loadStats(): BlunderSimStats {
  if (typeof window === "undefined") return defaultStats();
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") ?? defaultStats();
  } catch {
    return defaultStats();
  }
}

function saveStats(stats: BlunderSimStats): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function getBlunderResistanceScore(): number {
  const stats = loadStats();
  if (stats.totalPositions === 0) return 0;
  return Math.round((stats.totalCorrect / stats.totalPositions) * 100);
}

// ── Types ──────────────────────────────────────────────────────────────────

interface BlunderPosition {
  id: string;
  fen: string;          // Position shown to user
  blunderMove: string;  // The greedy/materialistic blunder (UCI)
  safeMove: string;     // The correct / safe move (UCI)
  neutralMove: string;  // A neutral alternative (UCI)
  correctChoiceIndex: number; // which of the 3 options (0,1,2) is safe
  choices: string[];    // 3 option labels e.g. ["Nd5", "Qxe5", "Rc1"]
  blunderExplanation: string; // e.g. "Taking the pawn walks into a fork on e5"
  patternTag: string;   // e.g. "fork", "pin"
}

// ── Helpers ────────────────────────────────────────────────────────────────

function uciToSan(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return move?.san ?? null;
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

function applyMove(fen: string, uci: string): string | null {
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
    const candidates = moves.filter(m => {
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

const BLUNDER_EXPLANATIONS: Record<string, string[]> = {
  fork: [
    "Taking that piece walks into a knight fork — you'd lose material",
    "Capturing there allows a fork on the next move, winning your piece",
    "That greedy capture lets the opponent fork two pieces simultaneously",
  ],
  pin: [
    "That move unpins your piece and lets the opponent exploit the pin",
    "Capturing there abandons the pinned piece — the opponent takes for free",
    "Moving that way walks into an absolute pin against your king",
  ],
  skewer: [
    "That move allows a skewer — your king runs, opponent takes the piece behind",
    "Retreating there sets up a skewer on the back rank",
    "That capture aligns your rook with the king — allowing a skewer",
  ],
  backRankMate: [
    "Moving that piece exposes a back rank mate threat",
    "That greedy capture removes the back rank defender — checkmate follows",
    "Taking that pawn strips your king's escape square",
  ],
  deflection: [
    "That move deflects your defender — leaving a key square unprotected",
    "Capturing there deflects your piece from guarding the mating square",
  ],
  overloading: [
    "That move overloads your piece — it can't defend two targets at once",
    "Capturing there leaves a piece overloaded — the opponent exploits it",
  ],
  default: [
    "That greedy capture walks into a tactic — always check your opponent's responses",
    "Taking the material is tempting but creates a losing position",
    "That move looks good but allows a forcing combination",
    "The greedy capture ignores your opponent's tactical threat",
  ],
};

function getBlunderExplanation(themes: string[]): string {
  for (const theme of themes) {
    const explanations = BLUNDER_EXPLANATIONS[theme];
    if (explanations && explanations.length > 0) {
      return explanations[Math.floor(Math.random() * explanations.length)];
    }
  }
  const defaults = BLUNDER_EXPLANATIONS.default;
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// ── Position Sampler ───────────────────────────────────────────────────────

/**
 * From the puzzle database, build BlunderPosition objects.
 *
 * The puzzle structure is:
 *   FEN = position before opponent's first move
 *   moves[0] = opponent's move (creates the "blunder opportunity")
 *   moves[1] = correct first move (puzzle solution — the "safe move")
 *
 * We show the position AFTER moves[0] (what the user actually sees).
 * The "blunder" move is a plausible greedy capture from that position
 * that walks into the tactic (i.e., NOT the solution).
 * The "safe move" is moves[1] (the actual puzzle solution).
 */
function sampleBlunderPositions(count: number): BlunderPosition[] {
  const allThemes = Object.keys(cachedPuzzlesByTheme);
  const results: BlunderPosition[] = [];
  const usedIds = new Set<string>();

  // Try each theme
  const shuffledThemes = shuffleArray(allThemes);

  for (const theme of shuffledThemes) {
    if (results.length >= count) break;
    const puzzles = cachedPuzzlesByTheme[theme];
    if (!puzzles || puzzles.length === 0) continue;

    // Need at least 2 moves: opponent first move + user's correct move
    const eligible = puzzles.filter(p => p.moves.length >= 2 && !usedIds.has(p.id));
    if (eligible.length === 0) continue;

    const shuffledPuzzles = shuffleArray(eligible);
    for (const raw of shuffledPuzzles) {
      if (results.length >= count) break;
      if (usedIds.has(raw.id)) continue;

      // Position after opponent's first move
      const afterOppFen = applyMove(raw.fen, raw.moves[0]);
      if (!afterOppFen) continue;

      const safeMove = raw.moves[1]; // Correct puzzle solution
      const safeSan = uciToSan(afterOppFen, safeMove);
      if (!safeSan) continue;

      // Find a plausible "blunder" — a capture that's NOT the correct solution
      // Look for moves that capture something (greedy)
      let blunderMove: string | null = null;
      try {
        const chess = new Chess(afterOppFen);
        const allMoves = chess.moves({ verbose: true });
        // Prefer captures (greedy moves) that are not the correct answer
        const captures = allMoves.filter(m => {
          const uci = `${m.from}${m.to}`;
          return m.captured && uci !== safeMove.slice(0, 4);
        });
        if (captures.length > 0) {
          const pick = captures[Math.floor(Math.random() * captures.length)];
          blunderMove = `${pick.from}${pick.to}${pick.promotion ?? ""}`;
        }
      } catch {
        // skip
      }

      if (!blunderMove) continue;

      const blunderSan = uciToSan(afterOppFen, blunderMove);
      if (!blunderSan) continue;

      // Find a neutral third move
      const neutralMove = getRandomLegalMove(afterOppFen, [safeMove, blunderMove]);
      if (!neutralMove) continue;

      const neutralSan = uciToSan(afterOppFen, neutralMove);
      if (!neutralSan) continue;

      // Shuffle the 3 choices
      const rawChoices = [
        { san: safeSan, isSafe: true },
        { san: blunderSan, isSafe: false },
        { san: neutralSan, isSafe: false },
      ];
      const shuffled = shuffleArray(rawChoices);
      const correctIdx = shuffled.findIndex(c => c.isSafe);

      results.push({
        id: raw.id,
        fen: afterOppFen,
        blunderMove,
        safeMove,
        neutralMove,
        correctChoiceIndex: correctIdx,
        choices: shuffled.map(c => c.san),
        blunderExplanation: getBlunderExplanation(raw.themes),
        patternTag: raw.themes.find(t => !["short", "long", "middlegame", "endgame", "opening", "master", "masterVsMaster", "advantage", "crushing", "equality", "mate", "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5", "sacrifice"].includes(t)) ?? "tactics",
      });

      usedIds.add(raw.id);
    }
  }

  return results.slice(0, count);
}

// ── Session Result ─────────────────────────────────────────────────────────

const TIPS = [
  "Before capturing, always ask: what does my opponent do AFTER this?",
  "Material gain isn't free — check if the taker becomes a target.",
  "When a capture looks obvious, slow down — it's usually a trap.",
  "The 'free piece' is often the most expensive move you'll play.",
  "Calculate the response before you play the greedy move.",
  "Blunders feel right in the moment. Train yourself to pause.",
  "Most blunders are captures. Ask 'why is that piece there?' first.",
  "A strong player doesn't avoid tactics — they spot them before taking.",
];

function getTipForMissedPatterns(missedPatterns: string[]): string {
  if (missedPatterns.includes("fork")) {
    return "You fell for forks — before capturing, check if your opponent has a knight fork available.";
  }
  if (missedPatterns.includes("backRankMate") || missedPatterns.includes("back rank")) {
    return "Back rank awareness is key — always check if your opponent has a back rank threat before moving.";
  }
  if (missedPatterns.includes("pin")) {
    return "Pins are sneaky — when a piece is pinned, don't capture assuming it's safe to take.";
  }
  if (missedPatterns.includes("skewer")) {
    return "Watch for skewe rs — aligning your valuable pieces on a file or diagonal invites them.";
  }
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}

function SessionResult({
  score,
  total,
  missedPatterns,
  onRestart,
}: {
  score: number;
  total: number;
  missedPatterns: string[];
  onRestart: () => void;
}) {
  const overallScore = getBlunderResistanceScore();
  const pct = Math.round((score / total) * 100);
  const tip = getTipForMissedPatterns(missedPatterns);

  const color = pct >= 80 ? "#4ade80" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const label = pct >= 80 ? "Excellent blunder resistance!" : pct >= 50 ? "Good — keep sharpening" : "These positions cost rating — keep training";

  return (
    <div style={{ padding: "1.5rem", textAlign: "center" }}>
      {/* Session Score */}
      <div style={{
        backgroundColor: "#1a1a2e",
        border: `1px solid ${color}40`,
        borderRadius: "16px",
        padding: "1.5rem",
        marginBottom: "1rem",
      }}>
        <div style={{ fontSize: "2.5rem", fontWeight: "bold", color, marginBottom: "0.25rem" }}>
          {score}/{total}
        </div>
        <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem", marginBottom: "0.25rem" }}>
          {label}
        </div>
        <div style={{ color: "#64748b", fontSize: "0.82rem" }}>
          Session accuracy: {pct}%
        </div>
      </div>

      {/* Blunder Resistance Score */}
      <div style={{
        backgroundColor: "#0a1520",
        border: "1px solid #1e3a5c",
        borderRadius: "12px",
        padding: "1.25rem",
        marginBottom: "1rem",
      }}>
        <div style={{ color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
          Blunder Resistance Score
        </div>
        <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#60a5fa", marginBottom: "0.25rem" }}>
          {overallScore}%
        </div>
        <div style={{ color: "#64748b", fontSize: "0.78rem" }}>
          Across all sessions
        </div>

        {/* Mini bar */}
        <div style={{ marginTop: "0.75rem", backgroundColor: "#0d1621", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
          <div style={{
            width: `${overallScore}%`,
            height: "100%",
            backgroundColor: overallScore >= 80 ? "#4ade80" : overallScore >= 50 ? "#f59e0b" : "#ef4444",
            borderRadius: "4px",
            transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {/* Tip */}
      <div style={{
        backgroundColor: "#1a1508",
        border: "1px solid #4a3a0a",
        borderRadius: "10px",
        padding: "1rem 1.25rem",
        marginBottom: "1.25rem",
        textAlign: "left",
      }}>
        <div style={{ color: "#f59e0b", fontWeight: "bold", fontSize: "0.82rem", marginBottom: "0.35rem" }}>
          💡 Training Tip
        </div>
        <div style={{ color: "#94a3b8", fontSize: "0.84rem", lineHeight: 1.6 }}>
          {tip}
        </div>
      </div>

      <button
        onClick={onRestart}
        style={{
          backgroundColor: "#dc2626",
          color: "white",
          border: "none",
          borderRadius: "8px",
          padding: "0.75rem 2rem",
          fontSize: "0.9rem",
          fontWeight: "bold",
          cursor: "pointer",
          width: "100%",
        }}
      >
        New Session
      </button>
    </div>
  );
}

// ── Choice Button ──────────────────────────────────────────────────────────

function ChoiceButton({
  label,
  choice,
  revealed,
  isCorrect,
  isSelected,
  disabled,
  onClick,
}: {
  label: string;
  choice: string;
  revealed: boolean;
  isCorrect: boolean;
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  let bg = "#1a1a2e";
  let border = "#2e3a5c";
  let color = "#e2e8f0";

  if (revealed) {
    if (isCorrect) { bg = "#0a1f12"; border = "#4ade80"; color = "#4ade80"; }
    else if (isSelected && !isCorrect) { bg = "#1f0a0a"; border = "#ef4444"; color = "#ef4444"; }
    else { color = "#475569"; border = "#1e2a3c"; }
  } else if (isSelected) {
    bg = "#1e3a5c"; border = "#2e75b6";
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        backgroundColor: bg,
        border: `2px solid ${border}`,
        borderRadius: "10px",
        padding: "0.75rem 1rem",
        color,
        fontSize: "0.9rem",
        fontWeight: "bold",
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <span style={{
        backgroundColor: revealed && isCorrect ? "#4ade80" : revealed && isSelected && !isCorrect ? "#ef4444" : "#2e3a5c",
        color: revealed && (isCorrect || (isSelected && !isCorrect)) ? "#0f0f1a" : "#94a3b8",
        borderRadius: "6px",
        width: "26px",
        height: "26px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.78rem",
        fontWeight: "bold",
        flexShrink: 0,
        transition: "all 0.15s",
      }}>
        {label}
      </span>
      <span>{choice}</span>
      {revealed && isCorrect && <span style={{ marginLeft: "auto" }}>✅</span>}
      {revealed && isSelected && !isCorrect && <span style={{ marginLeft: "auto" }}>❌</span>}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

const SESSION_SIZE = 10;

export default function BlunderSimulation() {
  const [mode, setMode] = useState<"idle" | "session" | "result">("idle");
  const [positions, setPositions] = useState<BlunderPosition[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [missedPatterns, setMissedPatterns] = useState<string[]>([]);
  const [overallScore, setOverallScore] = useState(0);

  useEffect(() => {
    setOverallScore(getBlunderResistanceScore());
  }, []);

  const startSession = useCallback(() => {
    const sampled = sampleBlunderPositions(SESSION_SIZE);
    if (sampled.length < 3) {
      // Not enough positions — shouldn't happen with current data
      return;
    }
    setPositions(sampled);
    setCurrentIdx(0);
    setSelectedChoice(null);
    setRevealed(false);
    setScore(0);
    setMissedPatterns([]);
    setMode("session");
  }, []);

  const handleChoice = useCallback((idx: number) => {
    if (revealed || selectedChoice !== null) return;
    setSelectedChoice(idx);
    setRevealed(true);

    const pos = positions[currentIdx];
    if (idx === pos.correctChoiceIndex) {
      setScore(s => s + 1);
    } else {
      setMissedPatterns(prev => [...prev, pos.patternTag]);
    }
  }, [revealed, selectedChoice, positions, currentIdx]);

  const handleNext = useCallback(() => {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= positions.length) {
      // Session complete — save stats
      const newScore = score + (selectedChoice === positions[currentIdx].correctChoiceIndex ? 0 : 0); // score already counted
      const finalScore = score + (revealed && selectedChoice === positions[currentIdx]?.correctChoiceIndex ? 0 : 0);
      // Actually score was already incremented in handleChoice
      const stats = loadStats();
      stats.totalPositions += positions.length;
      stats.totalCorrect += score;
      stats.sessions.push({
        date: new Date().toISOString().slice(0, 10),
        score,
        total: positions.length,
        blunderPatterns: missedPatterns,
      });
      stats.sessions = stats.sessions.slice(-50); // keep last 50
      saveStats(stats);
      setOverallScore(getBlunderResistanceScore());
      setMode("result");
    } else {
      setCurrentIdx(nextIdx);
      setSelectedChoice(null);
      setRevealed(false);
    }
  }, [currentIdx, positions, score, missedPatterns, revealed, selectedChoice]);

  // ── Idle / Entry Card ──────────────────────────────────────────────────

  if (mode === "idle") {
    return (
      <div style={{
        backgroundColor: "#1a0a0a",
        border: "1px solid #4a1a1a",
        borderRadius: "16px",
        padding: "1.5rem",
        marginTop: "2rem",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "1.4rem" }}>💀</span>
              <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: 0 }}>
                Blunder Simulation
              </h2>
            </div>
            <p style={{ color: "#94a3b8", fontSize: "0.84rem", margin: 0, lineHeight: 1.6, maxWidth: "480px" }}>
              Stop making the moves that cost you rating. Real positions where players blundered — can you find the safe move instead of falling for the trap?
            </p>
          </div>
          {overallScore > 0 && (
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ color: "#475569", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.25rem" }}>
                Resistance Score
              </div>
              <div style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                color: overallScore >= 80 ? "#4ade80" : overallScore >= 50 ? "#f59e0b" : "#ef4444",
              }}>
                {overallScore}%
              </div>
            </div>
          )}
        </div>

        {/* How it works */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
          {[
            { icon: "♟️", text: "See a real position where a blunder was made" },
            { icon: "🎯", text: "Choose the SAFE move from 3 options" },
            { icon: "📊", text: "10 positions per session — track your Blunder Resistance Score" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ fontSize: "0.9rem", width: "20px", textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
              <span style={{ color: "#64748b", fontSize: "0.82rem" }}>{item.text}</span>
            </div>
          ))}
        </div>

        <button
          onClick={startSession}
          style={{
            backgroundColor: "#dc2626",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "0.75rem 1.5rem",
            fontSize: "0.9rem",
            fontWeight: "bold",
            cursor: "pointer",
            width: "100%",
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#b91c1c"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#dc2626"; }}
        >
          Start Session
        </button>
      </div>
    );
  }

  // ── Result Screen ──────────────────────────────────────────────────────

  if (mode === "result") {
    return (
      <div style={{
        backgroundColor: "#1a0a0a",
        border: "1px solid #4a1a1a",
        borderRadius: "16px",
        marginTop: "2rem",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "1rem 1.5rem 0.75rem",
          borderBottom: "1px solid #2e1a1a",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}>
          <span style={{ fontSize: "1.2rem" }}>💀</span>
          <span style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem" }}>Blunder Simulation — Results</span>
        </div>
        <SessionResult
          score={score}
          total={positions.length}
          missedPatterns={missedPatterns}
          onRestart={() => {
            setOverallScore(getBlunderResistanceScore());
            setMode("idle");
          }}
        />
      </div>
    );
  }

  // ── Active Session ─────────────────────────────────────────────────────

  const pos = positions[currentIdx];
  if (!pos) return null;

  const isCorrect = selectedChoice === pos.correctChoiceIndex;
  const choiceLabels = ["A", "B", "C"];

  return (
    <div style={{
      backgroundColor: "#1a0a0a",
      border: "1px solid #4a1a1a",
      borderRadius: "16px",
      marginTop: "2rem",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "0.75rem 1.25rem",
        borderBottom: "1px solid #2e1a1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.1rem" }}>💀</span>
          <span style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.9rem" }}>Blunder Simulation</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ color: "#64748b", fontSize: "0.82rem" }}>
            Position {currentIdx + 1} of {positions.length}
          </span>
          <span style={{ color: "#4ade80", fontSize: "0.82rem", fontWeight: "bold" }}>
            Score: {score}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ backgroundColor: "#0d0606", height: "4px" }}>
        <div style={{
          width: `${((currentIdx) / positions.length) * 100}%`,
          height: "100%",
          backgroundColor: "#dc2626",
          transition: "width 0.3s ease",
        }} />
      </div>

      <div style={{ padding: "1.25rem" }}>
        {/* Prompt */}
        <div style={{
          backgroundColor: "#0d0606",
          border: "1px solid #3a1a1a",
          borderRadius: "10px",
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          textAlign: "center",
        }}>
          <div style={{ color: "#ef4444", fontWeight: "bold", fontSize: "0.88rem", marginBottom: "0.2rem" }}>
            ⚠️ Blunder Alert — find the safe move
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
            One of these moves is a blunder that loses rating. Choose the correct / safe move.
          </div>
        </div>

        {/* Board + Choices layout */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Chess Board */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ width: "min(320px, 100%)" }}>
              <ChessBoard
                fen={pos.fen}
                draggable={false}
                boardWidth={320}
              />
            </div>
          </div>

          {/* Choices */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {pos.choices.map((choice, idx) => (
              <ChoiceButton
                key={idx}
                label={choiceLabels[idx]}
                choice={choice}
                revealed={revealed}
                isCorrect={idx === pos.correctChoiceIndex}
                isSelected={selectedChoice === idx}
                disabled={revealed}
                onClick={() => handleChoice(idx)}
              />
            ))}
          </div>
        </div>

        {/* Reveal feedback */}
        {revealed && (
          <div style={{
            marginTop: "1rem",
            padding: "1rem",
            backgroundColor: isCorrect ? "#0a1f12" : "#1f0a0a",
            border: `1px solid ${isCorrect ? "#4ade80" : "#ef4444"}40`,
            borderRadius: "10px",
          }}>
            {isCorrect ? (
              <>
                <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.9rem", marginBottom: "0.25rem" }}>
                  ✅ You chose the safe move!
                </div>
                <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
                  Excellent blunder resistance — that's how you protect your rating.
                </div>
              </>
            ) : (
              <>
                <div style={{ color: "#ef4444", fontWeight: "bold", fontSize: "0.9rem", marginBottom: "0.25rem" }}>
                  ❌ That's the blunder
                </div>
                <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginBottom: "0.25rem" }}>
                  {pos.blunderExplanation}
                </div>
                <div style={{ color: "#64748b", fontSize: "0.78rem", fontStyle: "italic" }}>
                  This is why players lose rating.
                </div>
              </>
            )}
          </div>
        )}

        {/* Next button */}
        {revealed && (
          <button
            onClick={handleNext}
            style={{
              marginTop: "1rem",
              width: "100%",
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "0.7rem",
              fontSize: "0.88rem",
              fontWeight: "bold",
              cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#b91c1c"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#dc2626"; }}
          >
            {currentIdx + 1 >= positions.length ? "See Results →" : "Next Position →"}
          </button>
        )}
      </div>
    </div>
  );
}
