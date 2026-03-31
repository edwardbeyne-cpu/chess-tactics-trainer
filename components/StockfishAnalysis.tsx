"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";

interface AnalysisLine {
  multipv: number;
  depth: number;
  score: { type: "cp" | "mate"; value: number };
  moves: string[]; // UCI
  sanMoves: string[]; // SAN
}

function uciMovesToSan(startFen: string, uciMoves: string[]): string[] {
  try {
    const game = new Chess(startFen);
    const sans: string[] = [];
    for (const uci of uciMoves) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length === 5 ? uci[4] : undefined;
      try {
        const move = game.move({ from, to, ...(promotion ? { promotion } : {}) });
        if (move) sans.push(move.san);
        else break;
      } catch {
        break;
      }
    }
    return sans;
  } catch {
    return [];
  }
}

function scoreToWhiteCp(score: { type: "cp" | "mate"; value: number }, isBlackToMove: boolean): number {
  if (score.type === "mate") {
    const mateForMovingSide = score.value > 0;
    const whiteWins = (!isBlackToMove && mateForMovingSide) || (isBlackToMove && !mateForMovingSide);
    return whiteWins ? 9999 : -9999;
  }
  return isBlackToMove ? -score.value : score.value;
}

function formatScore(score: { type: "cp" | "mate"; value: number }, isBlackToMove: boolean): string {
  const whiteCp = scoreToWhiteCp(score, isBlackToMove);
  if (score.type === "mate") {
    const n = Math.abs(score.value);
    return whiteCp > 0 ? `M${n}` : `-M${n}`;
  }
  const pawn = (Math.abs(whiteCp) / 100).toFixed(1);
  return whiteCp >= 0 ? `+${pawn}` : `-${pawn}`;
}

function evalBarWhitePct(score: { type: "cp" | "mate"; value: number }, isBlackToMove: boolean): number {
  const whiteCp = scoreToWhiteCp(score, isBlackToMove);
  if (Math.abs(whiteCp) >= 9000) return whiteCp > 0 ? 96 : 4;
  return 50 + 45 * Math.tanh(whiteCp / 400);
}

export default function StockfishAnalysis({
  fen,
  orientation,
  onClose,
}: {
  fen: string;
  orientation: "white" | "black";
  onClose: () => void;
}) {
  const [analyzing, setAnalyzing] = useState(true);
  const [lines, setLines] = useState<AnalysisLine[]>([]);
  const [boardFen, setBoardFen] = useState(fen);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const workerRef = useRef<Worker | null>(null);
  const linesRef = useRef<Map<number, AnalysisLine>>(new Map());

  const isBlackToMove = fen.includes(" b ");
  const topScore = lines[0]?.score ?? { type: "cp" as const, value: 0 };
  const whitePct = evalBarWhitePct(topScore, isBlackToMove);
  const scoreLabel = lines[0] ? formatScore(lines[0].score, isBlackToMove) : "0.0";

  useEffect(() => {
    // Create inline blob worker to avoid needing a public file
    const workerCode = `
importScripts('https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js');
try {
  var engine = STOCKFISH();
  engine.onmessage = function(line) {
    self.postMessage(typeof line === 'object' ? line.data : line);
  };
  self.onmessage = function(e) {
    engine.postMessage(e.data);
  };
} catch(err) {
  self.postMessage('error: ' + err.message);
}
`;
    let worker: Worker;
    try {
      const blob = new Blob([workerCode], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setAnalyzing(false);
      return;
    }

    workerRef.current = worker;
    linesRef.current = new Map();

    worker.onmessage = (e) => {
      const line = e.data as string;
      if (typeof line !== "string") return;
      if (line.startsWith("error")) {
        setAnalyzing(false);
        return;
      }

      if (line.startsWith("info") && line.includes("score") && line.includes(" pv ")) {
        const depthMatch = /\bdepth (\d+)/.exec(line);
        const multipvMatch = /\bmultipv (\d+)/.exec(line);
        const cpMatch = /\bscore cp (-?\d+)/.exec(line);
        const mateMatch = /\bscore mate (-?\d+)/.exec(line);
        const pvMatch = / pv (.+)/.exec(line);

        const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
        if (depth < 8) return;

        const multipv = multipvMatch ? parseInt(multipvMatch[1]) : 1;
        const pvMoves = pvMatch ? pvMatch[1].trim().split(/\s+/).slice(0, 12) : [];

        let score: { type: "cp" | "mate"; value: number };
        if (mateMatch) {
          score = { type: "mate", value: parseInt(mateMatch[1]) };
        } else if (cpMatch) {
          score = { type: "cp", value: parseInt(cpMatch[1]) };
        } else return;

        const sanMoves = uciMovesToSan(fen, pvMoves);
        const entry: AnalysisLine = { multipv, depth, score, moves: pvMoves, sanMoves };
        linesRef.current.set(multipv, entry);

        const sorted = Array.from(linesRef.current.values()).sort((a, b) => a.multipv - b.multipv);
        setLines([...sorted]);
      }

      if (line.startsWith("bestmove")) {
        setAnalyzing(false);
      }
    };

    worker.postMessage("uci");
    worker.postMessage("setoption name MultiPV value 3");
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage("go depth 18");

    return () => {
      try { worker.postMessage("stop"); } catch { /* ignore */ }
      try { worker.terminate(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMoveClick = useCallback((lineIdx: number, moveIdx: number) => {
    const line = lines[lineIdx];
    if (!line || moveIdx >= line.moves.length) return;
    try {
      const game = new Chess(fen);
      for (let i = 0; i <= moveIdx; i++) {
        const uci = line.moves[i];
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length === 5 ? uci[4] : undefined;
        game.move({ from, to, ...(promotion ? { promotion } : {}) });
      }
      const lastUci = line.moves[moveIdx];
      setBoardFen(game.fen());
      setLastMove([lastUci.slice(0, 2), lastUci.slice(2, 4)] as [string, string]);
    } catch { /* ignore */ }
  }, [lines, fen]);

  const resetBoard = () => {
    setBoardFen(fen);
    setLastMove(undefined);
  };

  // Annotate full move numbers in SAN lines
  function renderMoves(line: AnalysisLine) {
    const startFen = fen;
    const isBlack = startFen.includes(" b ");
    const startFullmove = parseInt(startFen.split(" ")[5] ?? "1");

    return line.sanMoves.slice(0, 10).map((san, idx) => {
      const moveNumber = Math.floor((idx + (isBlack ? 1 : 0)) / 2) + startFullmove;
      const showNumber = idx === 0 || idx % 2 === (isBlack ? 1 : 0);
      return (
        <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: "0.1rem" }}>
          {showNumber && (
            <span style={{ color: "#475569", fontSize: "0.8rem", marginRight: "0.1rem" }}>
              {moveNumber}{idx === 0 && isBlack ? "..." : "."}
            </span>
          )}
          <button
            onClick={() => handleMoveClick(lines.indexOf(line), idx)}
            style={{
              background: "none",
              border: "none",
              color: "#93c5fd",
              cursor: "pointer",
              fontSize: "0.88rem",
              padding: "0.1rem 0.3rem",
              borderRadius: "3px",
              fontFamily: "inherit",
              fontWeight: "500",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#1e3a5f"; e.currentTarget.style.color = "#bfdbfe"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#93c5fd"; }}
          >
            {san}
          </button>
        </span>
      );
    });
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2000, padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: "#13172a",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        padding: "1.5rem",
        maxWidth: "860px",
        width: "100%",
        maxHeight: "92vh",
        overflow: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ color: "#a78bfa", fontSize: "1.2rem" }}>♟</span>
            <span style={{ color: "#e2e8f0", fontWeight: "700", fontSize: "1.1rem" }}>Stockfish Analysis</span>
            {analyzing && (
              <span style={{ color: "#64748b", fontSize: "0.78rem", backgroundColor: "#1a1f35", border: "1px solid #2e3a5c", borderRadius: "999px", padding: "0.2rem 0.65rem" }}>
                Analyzing...
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "1.5rem", lineHeight: 1, padding: "0.2rem 0.4rem" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}
          >
            ×
          </button>
        </div>

        {/* Main layout: board + eval bar + lines */}
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {/* Left: eval bar + board */}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexShrink: 0 }}>
            {/* Vertical eval bar */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
              <span style={{ color: "#64748b", fontSize: "0.65rem" }}>B</span>
              <div style={{
                width: "14px",
                height: "380px",
                borderRadius: "6px",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                border: "1px solid #1e2a3a",
                position: "relative",
              }}>
                {/* Black portion (top) */}
                <div style={{
                  backgroundColor: "#1a1a1a",
                  height: `${100 - whitePct}%`,
                  transition: "height 0.6s ease",
                  minHeight: "4px",
                }} />
                {/* White portion (bottom) */}
                <div style={{
                  backgroundColor: "#22c55e",
                  flex: 1,
                  transition: "height 0.6s ease",
                  minHeight: "4px",
                }} />
              </div>
              <span style={{ color: "#64748b", fontSize: "0.65rem" }}>W</span>
            </div>

            {/* Chess board */}
            <div>
              <ChessBoard
                fen={boardFen}
                orientation={orientation}
                lastMove={lastMove}
                draggable={false}
                boardWidth={380}
              />
              <div style={{ display: "flex", justifyContent: "center", marginTop: "0.5rem" }}>
                <button
                  onClick={resetBoard}
                  style={{
                    backgroundColor: "#1e2a3a",
                    color: "#64748b",
                    border: "1px solid #2e3a5c",
                    borderRadius: "6px",
                    padding: "0.3rem 0.75rem",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#e2e8f0"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}
                >
                  Reset Board
                </button>
              </div>
            </div>
          </div>

          {/* Right: engine lines */}
          <div style={{ flex: 1, minWidth: "220px", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Eval score display */}
            <div style={{
              backgroundColor: "#111827",
              border: "1px solid #1e2a3a",
              borderRadius: "10px",
              padding: "0.75rem 1rem",
              display: "flex",
              alignItems: "baseline",
              gap: "0.5rem",
            }}>
              <span style={{
                color: scoreLabel.startsWith("-") ? "#ef4444" : scoreLabel.startsWith("M") ? "#ef4444" : "#4ade80",
                fontWeight: "bold",
                fontSize: "2rem",
                fontFamily: "monospace",
                lineHeight: 1,
              }}>
                {scoreLabel}
              </span>
              <span style={{ color: "#475569", fontSize: "0.8rem" }}>
                {lines[0] ? `depth ${lines[0].depth}` : (analyzing ? "calculating..." : "")}
              </span>
            </div>

            {/* 3 engine lines */}
            {lines.length === 0 && analyzing && (
              <div style={{ color: "#475569", fontSize: "0.85rem", padding: "1rem 0" }}>
                Loading Stockfish engine...
              </div>
            )}

            {lines.map((line, lineIdx) => {
              const lineScore = formatScore(line.score, isBlackToMove);
              const scoreColor = lineScore.startsWith("-") ? "#ef4444" : lineScore.startsWith("M") ? "#f59e0b" : "#4ade80";
              return (
                <div key={lineIdx} style={{
                  backgroundColor: "#111827",
                  borderRadius: "10px",
                  padding: "0.85rem 1rem",
                  border: "1px solid #1e2a3a",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                    <span style={{
                      backgroundColor: lineIdx === 0 ? "#1e3a1a" : "#1a1f35",
                      color: lineIdx === 0 ? "#4ade80" : "#64748b",
                      borderRadius: "4px",
                      padding: "0.1rem 0.4rem",
                      fontSize: "0.7rem",
                      fontWeight: "bold",
                    }}>
                      {lineIdx + 1}
                    </span>
                    <span style={{ color: scoreColor, fontWeight: "bold", fontSize: "0.95rem", fontFamily: "monospace" }}>
                      {lineScore}
                    </span>
                    <span style={{ color: "#334155", fontSize: "0.72rem" }}>d{line.depth}</span>
                    {analyzing && lineIdx === 0 && (
                      <span style={{ color: "#334155", fontSize: "0.72rem" }}>...</span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.1rem", lineHeight: "1.8" }}>
                    {renderMoves(line)}
                  </div>
                </div>
              );
            })}

            {analyzing && (
              <div style={{ color: "#334155", fontSize: "0.75rem", textAlign: "center" }}>
                Analyzing at depth 18, multipv 3...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
