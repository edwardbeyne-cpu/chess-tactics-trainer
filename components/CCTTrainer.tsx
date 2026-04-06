"use client";

import { useState, useEffect, useCallback } from "react";
import { Chess } from "chess.js";
import { saveCCTFirstSessionComplete } from "@/lib/storage";
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

  useEffect(() => {
    if (phase === "complete") {
      saveCCTFirstSessionComplete(true);
    }
  }, [phase]);

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
        console.log(`CCT: Illegal move ${moveUci}`);
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
      maxWidth: "600px",
      margin: "0 auto",
      padding: "2rem 1rem",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      <div style={{
        backgroundColor: "#0f172a",
        borderRadius: "16px",
        padding: "2.5rem",
        border: "1px solid #1e293b",
        width: "100%",
        marginBottom: "2rem",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            backgroundColor: "#f97316",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "1.5rem",
            fontWeight: "600",
          }}>
            ✓
          </div>
          <div>
            <h2 style={{ 
              fontSize: "1.75rem", 
              fontWeight: "700", 
              color: "#f1f5f9",
              marginBottom: "0.25rem",
              letterSpacing: "-0.025em"
            }}>
              Training Complete
            </h2>
            <p style={{ 
              color: "#94a3b8", 
              fontSize: "0.95rem"
            }}>
              You've practiced the CCT scanning habit
            </p>
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1.5rem",
          marginBottom: "2rem",
        }}>
          <div style={{
            backgroundColor: "#1a1f2e",
            borderRadius: "12px",
            padding: "1.25rem",
            border: "1px solid #2e3a5c",
          }}>
            <div style={{ 
              color: "#94a3b8", 
              fontSize: "0.85rem",
              fontWeight: "500",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              Checks Found
            </div>
            <div style={{ 
              fontSize: "2rem", 
              fontWeight: "700", 
              color: "#4ade80",
              lineHeight: 1
            }}>
              {stats.checksFound}
            </div>
          </div>
          
          <div style={{
            backgroundColor: "#1a1f2e",
            borderRadius: "12px",
            padding: "1.25rem",
            border: "1px solid #2e3a5c",
          }}>
            <div style={{ 
              color: "#94a3b8", 
              fontSize: "0.85rem",
              fontWeight: "500",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              Captures Found
            </div>
            <div style={{ 
              fontSize: "2rem", 
              fontWeight: "700", 
              color: "#4ade80",
              lineHeight: 1
            }}>
              {stats.capturesFound}
            </div>
          </div>
          
          <div style={{
            backgroundColor: "#1a1f2e",
            borderRadius: "12px",
            padding: "1.25rem",
            border: "1px solid #2e3a5c",
          }}>
            <div style={{ 
              color: "#94a3b8", 
              fontSize: "0.85rem",
              fontWeight: "500",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              Threats Identified
            </div>
            <div style={{ 
              fontSize: "2rem", 
              fontWeight: "700", 
              color: "#4ade80",
              lineHeight: 1
            }}>
              {stats.threatsFound}
            </div>
          </div>
          
          <div style={{
            backgroundColor: "#1a1f2e",
            borderRadius: "12px",
            padding: "1.25rem",
            border: "1px solid #2e3a5c",
          }}>
            <div style={{ 
              color: "#94a3b8", 
              fontSize: "0.85rem",
              fontWeight: "500",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              Puzzles Solved
            </div>
            <div style={{ 
              fontSize: "2rem", 
              fontWeight: "700", 
              color: "#4ade80",
              lineHeight: 1
            }}>
              {stats.puzzlesSolved}<span style={{ fontSize: "1rem", color: "#64748b", marginLeft: "0.25rem" }}>/3</span>
            </div>
          </div>
        </div>

        <a
          href="/app/training"
          style={{
            display: "inline-block",
            backgroundColor: "#f97316",
            color: "white",
            padding: "0.875rem 2rem",
            borderRadius: "10px",
            textDecoration: "none",
            fontWeight: "600",
            fontSize: "1rem",
            transition: "all 0.2s",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(249, 115, 22, 0.3)",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = "#ea580c";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 16px rgba(249, 115, 22, 0.4)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = "#f97316";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(249, 115, 22, 0.3)";
          }}
        >
          Continue to Training →
        </a>
      </div>
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
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
    }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ 
          fontSize: "1.75rem", 
          fontWeight: "800", 
          marginBottom: "0.25rem",
          color: "#f1f5f9",
          letterSpacing: "-0.025em"
        }}>
          CCT Trainer
        </h1>
        <p style={{ 
          color: "#94a3b8", 
          fontSize: "0.95rem",
          marginBottom: "1rem"
        }}>
          Build the Checks, Captures, Threats scanning habit
        </p>
        
        {/* Premium segmented control for mode selector (visual indicator only) */}
        <div style={{
          display: "flex",
          backgroundColor: "#1a1f2e",
          padding: "0.25rem",
          borderRadius: "10px",
          border: "1px solid #2e3a5c",
          overflow: "hidden",
          maxWidth: "100%",
        }}>
          {(["checks", "captures", "threats", "solve"] as Phase[]).map(p => (
            <div
              key={p}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                backgroundColor: phase === p ? "#f97316" : "transparent",
                color: phase === p ? "white" : "#94a3b8",
                fontWeight: phase === p ? "600" : "400",
                textTransform: "capitalize",
                fontSize: "0.85rem",
                transition: "all 0.2s",
                flex: 1,
                textAlign: "center",
                whiteSpace: "nowrap",
                minWidth: 0, // Allows text truncation on small screens
              }}
            >
              {p}
            </div>
          ))}
        </div>
      </div>

      {/* Coaching cue / instruction area */}
      <div style={{ 
        marginBottom: "1rem",
        padding: "0.75rem",
        backgroundColor: "#0f172a",
        borderRadius: "8px",
        borderLeft: "3px solid #f97316",
      }}>
        <div style={{
          fontSize: "0.8rem",
          fontWeight: "600",
          color: "#f97316",
          marginBottom: "0.25rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em"
        }}>
          Puzzle {puzzleIdx + 1} of {POSITIONS.length} • {phase.charAt(0).toUpperCase() + phase.slice(1)}
        </div>
        <div style={{ 
          color: "#e2e8f0", 
          fontSize: "1rem",
          fontWeight: "500",
          lineHeight: 1.4
        }}>
          {getPhaseInstructions()}
        </div>
      </div>

      {/* Board as hero */}
      <div style={{
        position: "relative",
        marginBottom: "1.5rem",
        display: "flex",
        justifyContent: "center",
        flex: 1,
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
          mode="identification"
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

      {/* Integrated bottom strip */}
      <div style={{
        backgroundColor: "#0f172a",
        padding: "1rem",
        borderRadius: "12px",
        border: "1px solid #1e293b",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        marginTop: "auto",
      }}>
        {/* Left: Progress and status */}
        <div style={{ 
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flex: "1 1 200px", // Grow, shrink, min width 200px
        }}>
          {/* Progress dots */}
          <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
            {POSITIONS.map((_, idx) => (
              <div
                key={idx}
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: idx === puzzleIdx ? "#f97316" : 
                                 idx < puzzleIdx ? "#4ade80" : "#334155",
                  transition: "background-color 0.2s",
                }}
              />
            ))}
          </div>
          
          {/* Status */}
          {phase !== "solve" && (
            <div style={{ 
              color: "#e2e8f0", 
              fontSize: "0.95rem",
              fontWeight: "500",
              minWidth: "140px",
            }}>
              {phase === "checks" && (
                <>Found <span style={{ color: "#4ade80", fontWeight: "600" }}>{foundMoves.length}</span> of {allChecks.length} checks</>
              )}
              {phase === "captures" && (
                <>Found <span style={{ color: "#4ade80", fontWeight: "600" }}>{foundMoves.length}</span> of {allCaptures.length} captures</>
              )}
              {phase === "threats" && (
                <>Found <span style={{ color: "#4ade80", fontWeight: "600" }}>{threatSquares.length}</span> threats</>
              )}
            </div>
          )}
          {phase === "solve" && (
            <div style={{ color: "#94a3b8", fontSize: "0.95rem", minWidth: "140px" }}>
              {showMissed ? currentPuzzle.solutionNote : "Find the best move"}
            </div>
          )}
        </div>

        {/* Right: Action button */}
        {phase !== "solve" && (
          <button
            onClick={handleAdvancePhase}
            style={{
              backgroundColor: "#f97316",
              color: "white",
              border: "none",
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "0.95rem",
              cursor: "pointer",
              transition: "all 0.2s",
              flexShrink: 0,
              minWidth: "140px",
              boxShadow: "0 2px 4px rgba(249, 115, 22, 0.2)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = "#ea580c";
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(249, 115, 22, 0.3)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = "#f97316";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(249, 115, 22, 0.2)";
            }}
          >
            {phase === "checks" ? "No more checks" :
             phase === "captures" ? "No more captures" :
             "Done with threats"}
          </button>
        )}
      </div>

      {/* Solution box (when showMissed is true) */}
      {phase === "solve" && showMissed && (
        <div style={{
          marginTop: "1rem",
          padding: "1rem",
          backgroundColor: "#0f172a",
          borderRadius: "8px",
          border: "1px solid #1e293b",
        }}>
          <div style={{ 
            fontWeight: "600", 
            color: "#f97316", 
            marginBottom: "0.5rem",
            fontSize: "0.95rem"
          }}>
            Solution: {currentPuzzle.solution}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            {currentPuzzle.solutionNote}
          </div>
        </div>
      )}
    </div>
  );
}