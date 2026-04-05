"use client";

import { useState, useEffect, useCallback } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";

const POSITIONS = [
  { 
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", 
    checks: ["f1f7"], 
    captures: ["f3e5", "c4f7"], 
    solution: "f3e5", 
    solutionNote: "Knight takes e5, winning a pawn" 
  },
  { 
    fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", 
    checks: ["a1a8"], 
    captures: [], 
    solution: "a1a8", 
    solutionNote: "Rook to a8, back rank checkmate" 
  },
  { 
    fen: "rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3", 
    checks: [], 
    captures: ["f3e5", "e4d5"], 
    solution: "f3e5", 
    solutionNote: "Knight takes e5, winning a pawn" 
  },
];

type Phase = "checks" | "captures" | "threats" | "solve" | "complete";

export default function CCTTrainer() {
  const [phase, setPhase] = useState<Phase>("checks");
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [foundMoves, setFoundMoves] = useState<string[]>([]);
  const [showMissed, setShowMissed] = useState(false);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [threatSquares, setThreatSquares] = useState<string[]>([]);
  const [chess] = useState(() => new Chess(POSITIONS[0].fen));
  const [stats, setStats] = useState({
    checksFound: 0,
    capturesFound: 0,
    threatsFound: 0,
    puzzlesSolved: 0,
  });
  const [boardWidth, setBoardWidth] = useState(480);

  const currentPuzzle = POSITIONS[puzzleIdx];
  const allChecks = currentPuzzle.checks;
  const allCaptures = currentPuzzle.captures;

  const resetForNewPuzzle = useCallback(() => {
    chess.load(currentPuzzle.fen);
    setFoundMoves([]);
    setShowMissed(false);
    setThreatSquares([]);
    setPhase("checks");
  }, [chess, currentPuzzle.fen]);

  useEffect(() => {
    resetForNewPuzzle();
    
    // Calculate board width for client-side
    const updateBoardWidth = () => {
      if (typeof window !== "undefined") {
        setBoardWidth(Math.min(480, window.innerWidth - 40));
      }
    };
    
    updateBoardWidth();
    window.addEventListener("resize", updateBoardWidth);
    return () => window.removeEventListener("resize", updateBoardWidth);
  }, [resetForNewPuzzle]);

  const handleMove = useCallback((from: string, to: string): boolean => {
    const moveUci = `${from}${to}`;
    
    // Try move without promotion first (for non-pawn moves)
    let move;
    try {
      move = chess.move({ from, to });
    } catch {
      // If that fails, try with queen promotion (for pawn promotion moves)
      try {
        move = chess.move({ from, to, promotion: "q" });
      } catch {
        return false;
      }
    }
    
    if (!move) return false;

    let isValid = false;
    let flashColor = "#ef4444";

    if (phase === "checks") {
      if (chess.isCheck() && !foundMoves.includes(moveUci)) {
        isValid = true;
        flashColor = "#4ade80";
        setFoundMoves(prev => [...prev, moveUci]);
        setStats(prev => ({ ...prev, checksFound: prev.checksFound + 1 }));
      }
    } else if (phase === "captures") {
      if (move.captured && !foundMoves.includes(moveUci)) {
        isValid = true;
        flashColor = "#4ade80";
        setFoundMoves(prev => [...prev, moveUci]);
        setStats(prev => ({ ...prev, capturesFound: prev.capturesFound + 1 }));
      }
    } else if (phase === "solve") {
      if (moveUci === currentPuzzle.solution) {
        isValid = true;
        flashColor = "#4ade80";
        setStats(prev => ({ ...prev, puzzlesSolved: prev.puzzlesSolved + 1 }));
        setTimeout(() => {
          if (puzzleIdx < POSITIONS.length - 1) {
            setPuzzleIdx(p => p + 1);
          } else {
            setPhase("complete");
          }
        }, 1500);
      }
    }

    setFlashColor(flashColor);
    setTimeout(() => setFlashColor(null), 500);

    chess.undo();
    return isValid;
  }, [chess, phase, foundMoves, currentPuzzle.solution, puzzleIdx]);

  const handleThreatTap = useCallback((square: string) => {
    if (phase !== "threats") return;

    const isAttacked = chess.isAttacked(square as any, chess.turn() === "w" ? "b" : "w");
    
    if (isAttacked && !threatSquares.includes(square)) {
      setThreatSquares(prev => [...prev, square]);
      setFlashColor("#4ade80");
      setStats(prev => ({ ...prev, threatsFound: prev.threatsFound + 1 }));
    } else if (!isAttacked) {
      setFlashColor("#ef4444");
    }
    
    setTimeout(() => setFlashColor(null), 500);
  }, [chess, phase, threatSquares]);

  const handleAdvancePhase = () => {
    if (phase === "checks") {
      setShowMissed(true);
      setTimeout(() => {
        setPhase("captures");
        setFoundMoves([]);
        setShowMissed(false);
      }, 2000);
    } else if (phase === "captures") {
      setShowMissed(true);
      setTimeout(() => {
        setPhase("threats");
        setFoundMoves([]);
        setShowMissed(false);
      }, 2000);
    } else if (phase === "threats") {
      setPhase("solve");
    }
  };

  const getPhaseInstructions = () => {
    switch (phase) {
      case "checks":
        return "Find all checks for the moving side. Drag pieces to give check.";
      case "captures":
        return "Find all captures for the moving side. Drag pieces to capture.";
      case "threats":
        return "Tap squares where the moving side's pieces are under attack.";
      case "solve":
        return "Find the best move in this position.";
      case "complete":
        return "Training complete! Review your stats below.";
      default:
        return "";
    }
  };

  const getHighlightSquares = () => {
    const highlights: Record<string, { background?: string; borderRadius?: string }> = {};
    
    if (showMissed) {
      if (phase === "checks") {
        allChecks.forEach(move => {
          if (!foundMoves.includes(move)) {
            const to = move.slice(2);
            highlights[to] = { background: "#ef4444", borderRadius: "50%" };
          }
        });
      } else if (phase === "captures") {
        allCaptures.forEach(move => {
          if (!foundMoves.includes(move)) {
            const to = move.slice(2);
            highlights[to] = { background: "#ef4444", borderRadius: "50%" };
          }
        });
      }
    }
    
    if (phase === "threats") {
      threatSquares.forEach(square => {
        highlights[square] = { background: "#4ade80", borderRadius: "50%" };
      });
    }
    
    return highlights;
  };

  const renderCompletionScreen = () => (
    <div style={{
      textAlign: "center",
      padding: "2rem",
      maxWidth: "600px",
      margin: "0 auto",
    }}>
      <h2 style={{ fontSize: "2rem", marginBottom: "1rem", color: "#f97316" }}>
        Training Complete! 🎉
      </h2>
      <div style={{
        backgroundColor: "#1a1f2e",
        borderRadius: "12px",
        padding: "2rem",
        marginBottom: "2rem",
      }}>
        <h3 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>Your Stats</h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          textAlign: "left",
        }}>
          <div>
            <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Checks Found</div>
            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#4ade80" }}>
              {stats.checksFound}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Captures Found</div>
            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#4ade80" }}>
              {stats.capturesFound}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Threats Identified</div>
            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#4ade80" }}>
              {stats.threatsFound}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Puzzles Solved</div>
            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#4ade80" }}>
              {stats.puzzlesSolved}/3
            </div>
          </div>
        </div>
      </div>
      <a
        href="/app/training"
        style={{
          display: "inline-block",
          backgroundColor: "#f97316",
          color: "white",
          padding: "0.75rem 1.5rem",
          borderRadius: "8px",
          textDecoration: "none",
          fontWeight: "bold",
          fontSize: "1.1rem",
          transition: "background-color 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#ea580c"}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = "#f97316"}
      >
        Start Training →
      </a>
    </div>
  );

  if (phase === "complete") {
    return renderCompletionScreen();
  }

  return (
    <div style={{
      maxWidth: "800px",
      margin: "0 auto",
      padding: "1rem",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "1.5rem",
        flexWrap: "wrap",
        gap: "1rem",
      }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
            CCT Trainer
          </h1>
          <p style={{ color: "#94a3b8" }}>
            Practice the Checks, Captures, Threats scanning habit
          </p>
        </div>
        <div style={{
          display: "flex",
          gap: "0.5rem",
          backgroundColor: "#1a1f2e",
          padding: "0.5rem",
          borderRadius: "8px",
        }}>
          {(["checks", "captures", "threats", "solve"] as Phase[]).map(p => (
            <div
              key={p}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                backgroundColor: phase === p ? "#f97316" : "transparent",
                color: phase === p ? "white" : "#94a3b8",
                fontWeight: phase === p ? "bold" : "normal",
                textTransform: "capitalize",
                fontSize: "0.9rem",
              }}
            >
              {p}
            </div>
          ))}
        </div>
      </div>

      <div style={{
        backgroundColor: "#1a1f2e",
        padding: "1.5rem",
        borderRadius: "12px",
        marginBottom: "1.5rem",
      }}>
        <div style={{
          fontSize: "1.1rem",
          fontWeight: "bold",
          marginBottom: "0.5rem",
          color: "#e2e8f0",
        }}>
          Puzzle {puzzleIdx + 1} of {POSITIONS.length}
        </div>
        <div style={{ color: "#94a3b8" }}>
          {getPhaseInstructions()}
        </div>
      </div>

      <div style={{
        position: "relative",
        marginBottom: "1.5rem",
        display: "flex",
        justifyContent: "center",
      }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: flashColor || "transparent",
            opacity: flashColor ? 0.3 : 0,
            transition: "opacity 0.3s",
            pointerEvents: "none",
            borderRadius: "8px",
          }}
        />
        <ChessBoard
          fen={currentPuzzle.fen}
          onMove={handleMove}
          draggable={phase !== "threats"}
          boardWidth={boardWidth}
          highlightSquares={getHighlightSquares()}
        />
        {phase === "threats" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: "none",
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const fileIndex = Math.floor((x / rect.width) * 8);
              const rankIndex = Math.floor((y / rect.height) * 8);
              if (fileIndex < 0 || fileIndex > 7 || rankIndex < 0 || rankIndex > 7) return;
              const file = String.fromCharCode(97 + fileIndex);
              const rank = String(8 - rankIndex);
              handleThreatTap(file + rank);
            }}
          />
        )}
      </div>

      <div style={{
        backgroundColor: "#1a1f2e",
        padding: "1.5rem",
        borderRadius: "12px",
        marginBottom: "1.5rem",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}>
          <div>
            <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "0.25rem" }}>
              Progress
            </div>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {POSITIONS.map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor: idx === puzzleIdx ? "#f97316" : 
                                   idx < puzzleIdx ? "#4ade80" : "#2e3a5c",
                  }}
                />
              ))}
            </div>
          </div>

          {phase !== "solve" && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {phase === "checks" && (
                <div style={{ color: "#94a3b8" }}>
                  Found {foundMoves.length} of {allChecks.length} checks
                </div>
              )}
              {phase === "captures" && (
                <div style={{ color: "#94a3b8" }}>
                  Found {foundMoves.length} of {allCaptures.length} captures
                </div>
              )}
              {phase === "threats" && (
                <div style={{ color: "#94a3b8" }}>
                  Identified {threatSquares.length} threats
                </div>
              )}
              <button
                onClick={handleAdvancePhase}
                style={{
                  backgroundColor: "#f97316",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#ea580c"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "#f97316"}
              >
                {phase === "checks" ? "No more checks" :
                 phase === "captures" ? "No more captures" :
                 "Done with threats"}
              </button>
            </div>
          )}

          {phase === "solve" && (
            <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              {showMissed ? currentPuzzle.solutionNote : "Find the best move"}
            </div>
          )}
        </div>
      </div>

      {phase === "solve" && showMissed && (
        <div style={{
          backgroundColor: "#1a1f2e",
          padding: "1rem",
          borderRadius: "12px",
          borderLeft: "4px solid #f97316",
        }}>
          <div style={{ fontWeight: "bold", color: "#f97316", marginBottom: "0.5rem" }}>
            Solution: {currentPuzzle.solution}
          </div>
          <div style={{ color: "#94a3b8" }}>
            {currentPuzzle.solutionNote}
          </div>
        </div>
      )}
    </div>
  );
}