"use client";

import { useState, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import {
  addPersonalPuzzles,
  getPGNImportUsage,
  incrementPGNImportUsage,
  getSubscriptionTier,
  type PersonalPuzzle,
} from "@/lib/storage";

// ─── Blunder / tactical detection helpers ──────────────────────────────────

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

function getPieceValue(pieceType: string): number {
  return PIECE_VALUES[pieceType.toLowerCase()] ?? 0;
}

/**
 * Check if any piece is en prise (can be captured for free) in a given Chess instance.
 * Returns array of {square, piece} for hanging pieces.
 */
function findHangingPieces(chess: Chess): Array<{ square: string; reason: string }> {
  const board = chess.board();
  const hanging: Array<{ square: string; reason: string }> = [];
  const turn = chess.turn(); // whose turn it is

  // Get all squares occupied by the side that just moved (opposite of turn)
  const justMoved = turn === "w" ? "b" : "w";

  for (const row of board) {
    for (const cell of row) {
      if (!cell || cell.color !== justMoved) continue;
      const square = cell.square;
      const pieceVal = getPieceValue(cell.type);
      if (pieceVal === 0) continue; // skip kings

      // Check if this piece can be captured
      const attackers = chess.attackers(square, turn);
      if (attackers.length === 0) continue;

      // Check if defenders exist
      const defenders = chess.attackers(square, justMoved);

      if (defenders.length === 0) {
        // Completely undefended — hanging piece
        hanging.push({ square, reason: `Hanging ${cell.type.toUpperCase()} on ${square} (undefended)` });
      } else {
        // Check if can be captured with material gain (SEE simplified)
        const lowestAttackerVal = Math.min(
          ...attackers.map((sq) => {
            const attacker = chess.get(sq);
            return attacker ? getPieceValue(attacker.type) : 99;
          })
        );
        const lowestDefenderVal = Math.min(
          ...defenders.map((sq) => {
            const def = chess.get(sq);
            return def ? getPieceValue(def.type) : 99;
          })
        );
        if (lowestAttackerVal < pieceVal && lowestAttackerVal < lowestDefenderVal) {
          hanging.push({ square, reason: `Piece on ${square} can be won for material` });
        }
      }
    }
  }

  return hanging;
}

/**
 * Detect a simple fork: one piece attacks two+ enemy pieces.
 */
function findForkPatterns(chess: Chess): Array<{ square: string; reason: string }> {
  const board = chess.board();
  const turn = chess.turn();
  const justMoved = turn === "w" ? "b" : "w";
  const forks: Array<{ square: string; reason: string }> = [];

  // For each piece of the side that just moved
  for (const row of board) {
    for (const cell of row) {
      if (!cell || cell.color !== justMoved) continue;
      // Count enemy pieces this piece attacks
      const attackedEnemies = chess
        .board()
        .flat()
        .filter((sq) => sq && sq.color === turn)
        .filter((sq) => chess.attackers(sq!.square, justMoved).includes(cell.square));

      if (attackedEnemies.length >= 2) {
        forks.push({
          square: cell.square,
          reason: `Fork opportunity: ${cell.type.toUpperCase()} attacks ${attackedEnemies.length} pieces`,
        });
      }
    }
  }
  return forks;
}

export interface AnalysisResult {
  flaggedPositions: PersonalPuzzle[];
  totalMoves: number;
  analyzed: number;
}

function analyzeGame(pgnText: string, source: string): PersonalPuzzle[] {
  const chess = new Chess();
  try {
    chess.loadPgn(pgnText);
  } catch {
    return [];
  }

  // Replay the game from the start
  const moves = chess.history({ verbose: true });
  const positions: PersonalPuzzle[] = [];

  // Reset and replay
  const replay = new Chess();
  try {
    replay.loadPgn(pgnText);
  } catch {
    return [];
  }

  // We need to replay step by step
  const replayChess = new Chess();
  
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    replayChess.move(move.san);

    // After each move, check for tactical patterns
    const hangingPieces = findHangingPieces(replayChess);
    const forks = findForkPatterns(replayChess);

    const allFlags = [...hangingPieces, ...forks];

    if (allFlags.length > 0) {
      const playerColor: "white" | "black" = move.color === "w" ? "white" : "black";
      positions.push({
        id: `pp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        fen: replayChess.fen(),
        moveNumber: Math.floor(i / 2) + 1,
        playerColor,
        pgn: pgnText.slice(0, 200), // truncate for storage
        source,
        flaggedReason: allFlags[0].reason,
        addedAt: new Date().toISOString(),
        solved: false,
      });
    }

    // Limit to 3 flagged positions per game to avoid spam
    if (positions.length >= 3) break;
  }

  return positions;
}

// ─── UI Components ──────────────────────────────────────────────────────────

interface UpgradePromptProps {
  onClose?: () => void;
}

function UpgradePrompt({ onClose }: UpgradePromptProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100%", height: "100%",
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#0f0f1a",
          borderRadius: "16px",
          border: "1px solid #2e3a5c",
          padding: "2rem",
          maxWidth: "480px",
          width: "90%",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
        <h2 style={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "1rem" }}>
          PGN Import — Paid Feature
        </h2>
        <p style={{ color: "#94a3b8", marginBottom: "1.5rem", lineHeight: 1.6 }}>
          Game import and blunder detection is available on the{" "}
          <strong style={{ color: "#4ade80" }}>Improver</strong> and{" "}
          <strong style={{ color: "#f59e0b" }}>Serious</strong> plans.
        </p>
        <ul style={{ textAlign: "left", color: "#94a3b8", fontSize: "0.9rem", marginBottom: "1.5rem", paddingLeft: "1.5rem" }}>
          <li><strong style={{ color: "#4ade80" }}>Improver:</strong> 1 game import per month</li>
          <li><strong style={{ color: "#f59e0b" }}>Serious:</strong> Unlimited game imports</li>
        </ul>
        <button
          onClick={() => { window.location.href = "/pricing"; }}
          style={{
            backgroundColor: "#4ade80",
            color: "#0f0f1a",
            padding: "0.75rem 2rem",
            borderRadius: "8px",
            border: "none",
            fontWeight: "bold",
            fontSize: "1rem",
            cursor: "pointer",
            width: "100%",
            marginBottom: "0.75rem",
          }}
        >
          View Plans
        </button>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

// ─── Main PGN Import Component ──────────────────────────────────────────────

export default function PGNImport() {
  const tier = getSubscriptionTier();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pgnText, setPgnText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ moves: number; found: number } | null>(null);
  const [results, setResults] = useState<PersonalPuzzle[] | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usage = getPGNImportUsage();
  const canImport = tier >= 2 || (tier >= 1 && usage.count < 1) || false;
  // Improver: 1/month, Serious: unlimited, Free: blocked

  function handleAttempt() {
    if (tier === 0) {
      setShowUpgrade(true);
      return false;
    }
    if (tier === 1 && usage.count >= 1) {
      setShowUpgrade(true);
      return false;
    }
    return true;
  }

  async function processContent(content: string, fname: string) {
    if (!handleAttempt()) return;

    setAnalyzing(true);
    setError(null);
    setResults(null);
    setAddedCount(null);
    setFilename(fname);

    try {
      // Split into individual games
      const games = splitPGNIntoGames(content);
      if (games.length === 0) {
        setError("No valid games found in the PGN.");
        return;
      }

      let totalMoves = 0;
      const allFlagged: PersonalPuzzle[] = [];

      for (let i = 0; i < games.length; i++) {
        const game = games[i];
        // Simulate progress update
        const chess = new Chess();
        try {
          chess.loadPgn(game);
          totalMoves += chess.history().length;
        } catch { /* skip */ }

        setProgress({ moves: totalMoves, found: allFlagged.length });

        // Small yield to allow re-render
        await new Promise((r) => setTimeout(r, 10));

        const flagged = analyzeGame(game, fname);
        allFlagged.push(...flagged);

        setProgress({ moves: totalMoves, found: allFlagged.length });
      }

      if (tier === 1) {
        incrementPGNImportUsage();
      }

      setResults(allFlagged);
    } catch (err) {
      setError(`Analysis error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    await processContent(content, file.name);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const content = await file.text();
    await processContent(content, file.name);
  }, [tier, usage]);

  async function handlePasteSubmit() {
    if (!pgnText.trim()) return;
    await processContent(pgnText.trim(), "pasted-game.pgn");
  }

  function handleAddToQueue(puzzle: PersonalPuzzle) {
    addPersonalPuzzles([puzzle]);
  }

  function handleAddAll() {
    if (!results) return;
    const count = addPersonalPuzzles(results);
    setAddedCount(count);
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      {showUpgrade && <UpgradePrompt onClose={() => setShowUpgrade(false)} />}

      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
          📂 PGN Import
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
          Upload your games to automatically detect tactical moments and add them to your practice queue.
        </p>

        {/* Tier/usage badge */}
        {tier === 0 && (
          <div style={{ marginTop: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.5rem", backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "8px", padding: "0.4rem 0.85rem" }}>
            <span style={{ color: "#ef4444", fontSize: "0.8rem" }}>🔒 Free plan — upgrade to import games</span>
          </div>
        )}
        {tier === 1 && (
          <div style={{ marginTop: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.5rem", backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "8px", padding: "0.4rem 0.85rem" }}>
            <span style={{ color: usage.count >= 1 ? "#ef4444" : "#4ade80", fontSize: "0.8rem" }}>
              {usage.count >= 1 ? "🔒" : "✅"} Improver: {usage.count} of 1 game used this month
            </span>
          </div>
        )}
        {tier >= 2 && (
          <div style={{ marginTop: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.5rem", backgroundColor: "#0a1f12", border: "1px solid #1a4a2a", borderRadius: "8px", padding: "0.4rem 0.85rem" }}>
            <span style={{ color: "#4ade80", fontSize: "0.8rem" }}>⭐ Serious — unlimited imports</span>
          </div>
        )}
      </div>

      {/* Upload Mode Toggle */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setPasteMode(false)}
          style={{
            backgroundColor: !pasteMode ? "#2e3a5c" : "transparent",
            color: !pasteMode ? "#e2e8f0" : "#64748b",
            border: "1px solid #2e3a5c",
            borderRadius: "8px",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          📁 Upload File
        </button>
        <button
          onClick={() => setPasteMode(true)}
          style={{
            backgroundColor: pasteMode ? "#2e3a5c" : "transparent",
            color: pasteMode ? "#e2e8f0" : "#64748b",
            border: "1px solid #2e3a5c",
            borderRadius: "8px",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          📋 Paste PGN
        </button>
      </div>

      {/* Upload Zone */}
      {!pasteMode ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => handleAttempt() && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? "#4ade80" : "#2e3a5c"}`,
            borderRadius: "12px",
            padding: "3rem 2rem",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: isDragging ? "#0a1f12" : "#1a1a2e",
            transition: "all 0.2s",
            marginBottom: "1.5rem",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pgn,.txt"
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />
          <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>📂</div>
          <div style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.4rem" }}>
            Click to upload or drag & drop your .pgn file
          </div>
          <div style={{ color: "#475569", fontSize: "0.8rem" }}>
            Chess.com · Lichess · Any PGN source
          </div>
          <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.5rem" }}>
            💡 Export from Chess.com: My Games → Download .pgn | Lichess: Profile → Export games
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: "1.5rem" }}>
          <textarea
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            placeholder={`Paste PGN text here, e.g.:\n\n[Event "Rated Blitz game"]\n[White "Magnus"]\n...\n\n1. e4 e5 2. Nf3 ...`}
            style={{
              width: "100%",
              height: "200px",
              backgroundColor: "#162030",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "1rem",
              color: "#e2e8f0",
              fontSize: "0.85rem",
              fontFamily: "monospace",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={handlePasteSubmit}
            disabled={!pgnText.trim() || analyzing}
            style={{
              marginTop: "0.75rem",
              backgroundColor: pgnText.trim() && !analyzing ? "#4ade80" : "#1a2535",
              color: pgnText.trim() && !analyzing ? "#0f0f1a" : "#4a6a8a",
              border: "none",
              borderRadius: "8px",
              padding: "0.6rem 1.5rem",
              cursor: pgnText.trim() && !analyzing ? "pointer" : "not-allowed",
              fontWeight: "bold",
              fontSize: "0.9rem",
            }}
          >
            Analyze PGN
          </button>
        </div>
      )}

      {/* Progress */}
      {analyzing && (
        <div style={{ backgroundColor: "#162030", border: "1px solid #2e3a5c", borderRadius: "8px", padding: "1.25rem", marginBottom: "1.5rem", textAlign: "center" }}>
          <div style={{ color: "#94a3b8", marginBottom: "0.5rem" }}>
            ♟ Analyzing {filename}...
          </div>
          {progress && (
            <div style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold" }}>
              Analyzed {progress.moves} moves — found {progress.found} tactical moment{progress.found !== 1 ? "s" : ""}
            </div>
          )}
          <div style={{ marginTop: "1rem", height: "4px", backgroundColor: "#2e3a5c", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ height: "100%", backgroundColor: "#4ade80", width: "60%", animation: "pulse 1s ease-in-out infinite" }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ backgroundColor: "#1a0a0a", border: "1px solid #ef444450", borderRadius: "8px", padding: "1rem", marginBottom: "1.5rem" }}>
          <span style={{ color: "#ef4444", fontSize: "0.9rem" }}>❌ {error}</span>
        </div>
      )}

      {/* Results */}
      {results !== null && !analyzing && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold" }}>
              {results.length === 0
                ? "No tactical moments detected"
                : `Found ${results.length} tactical moment${results.length !== 1 ? "s" : ""}`}
            </h2>
            {results.length > 0 && (
              <button
                onClick={handleAddAll}
                style={{
                  backgroundColor: "#4ade80",
                  color: "#0f0f1a",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.5rem 1rem",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "0.85rem",
                }}
              >
                Add All to Queue
              </button>
            )}
          </div>

          {addedCount !== null && (
            <div style={{ backgroundColor: "#0a1f12", border: "1px solid #1a4a2a", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1rem" }}>
              <span style={{ color: "#4ade80", fontSize: "0.9rem" }}>
                ✅ Added {addedCount} new puzzle{addedCount !== 1 ? "s" : ""} to your personal queue
              </span>
            </div>
          )}

          {results.length === 0 && (
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "1.5rem", textAlign: "center", color: "#64748b" }}>
              Your game was clean! No obvious hanging pieces or tactical patterns detected.
            </div>
          )}

          {results.map((puzzle) => (
            <div
              key={puzzle.id}
              style={{
                backgroundColor: "#1a1a2e",
                border: "1px solid #2e3a5c",
                borderRadius: "8px",
                padding: "1rem 1.25rem",
                marginBottom: "0.75rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ color: "#e2e8f0", fontSize: "0.95rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                  Move {puzzle.moveNumber} ({puzzle.playerColor === "white" ? "White" : "Black"} to play)
                </div>
                <div style={{ color: "#f59e0b", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                  ⚠️ {puzzle.flaggedReason}
                </div>
                <div style={{ color: "#475569", fontSize: "0.75rem", fontFamily: "monospace" }}>
                  {puzzle.fen.split(" ").slice(0, 4).join(" ")}...
                </div>
              </div>
              <button
                onClick={() => handleAddToQueue(puzzle)}
                style={{
                  backgroundColor: "#2e3a5c",
                  color: "#e2e8f0",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.5rem 0.85rem",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                + Add to Queue
              </button>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "8px", padding: "1rem 1.25rem", marginTop: "2rem", fontSize: "0.8rem", color: "#475569" }}>
        <strong style={{ color: "#64748b", display: "block", marginBottom: "0.4rem" }}>🔍 How blunder detection works</strong>
        The analyzer looks for positions where pieces are left en prise (can be captured for free),
        where a piece can be won via a material exchange, or where fork patterns exist.
        No Stockfish needed — this is a fast heuristic scan.
      </div>
    </div>
  );
}

// Helper (duplicated from Settings for independence)
function splitPGNIntoGames(pgn: string): string[] {
  const lines = pgn.split("\n");
  const games: string[] = [];
  let currentGame: string[] = [];
  let inMoves = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      if (inMoves && currentGame.length > 0) {
        games.push(currentGame.join("\n"));
        currentGame = [];
        inMoves = false;
      }
    } else if (trimmed.length > 0) {
      inMoves = true;
    }
    currentGame.push(line);
    if (inMoves && (trimmed.endsWith("1-0") || trimmed.endsWith("0-1") || trimmed.endsWith("1/2-1/2") || trimmed === "*")) {
      games.push(currentGame.join("\n"));
      currentGame = [];
      inMoves = false;
    }
  }
  if (currentGame.length > 0 && currentGame.some((l) => l.trim())) {
    games.push(currentGame.join("\n"));
  }
  return games;
}
