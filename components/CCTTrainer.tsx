"use client";

import { useState, useEffect, useCallback } from "react";
import { Chess } from "chess.js";
import { saveCCTFirstSessionComplete, getCCTTrainerFirstVisit, saveCCTTrainerFirstVisit } from "@/lib/storage";
import ChessBoard from "./ChessBoard";
import Link from "next/link";

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
  const [boardWidth, setBoardWidth] = useState(560);
  const [showFirstVisitTooltip, setShowFirstVisitTooltip] = useState(false);

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
    // Reset when puzzle changes
    const timer = setTimeout(() => {
      resetForNewPuzzle();
    }, 0);
    return () => clearTimeout(timer);
  }, [puzzleIdx, resetForNewPuzzle]);

  useEffect(() => {
    // Calculate board width for client-side - larger board for better presence
    const updateBoardWidth = () => {
      if (typeof window !== "undefined") {
        const isMobile = window.innerWidth < 768;
        setBoardWidth(isMobile ? Math.min(560, window.innerWidth - 32) : Math.min(640, window.innerWidth - 64));
      }
    };
    
    updateBoardWidth();
    window.addEventListener("resize", updateBoardWidth);
    
    // Check for first visit
    if (typeof window !== "undefined") {
      const hasVisitedBefore = getCCTTrainerFirstVisit();
      if (!hasVisitedBefore) {
        setTimeout(() => {
          setShowFirstVisitTooltip(true);
        }, 100);
        saveCCTTrainerFirstVisit(true);
      }
    }
    
    return () => window.removeEventListener("resize", updateBoardWidth);
  }, []);

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

  // Phase instructions are now inline in the instruction card

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
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "#10b981",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "1.75rem",
            fontWeight: "600",
            boxShadow: "0 4px 16px rgba(16, 185, 129, 0.3)",
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
              You&apos;ve practiced the CCT scanning habit
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

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1.25rem" }}>
          <div style={{ color: "#64748b", fontSize: "0.85rem", textAlign: "center", marginBottom: "0.5rem" }}>
            Ready to apply CCT to real tactics?
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/app/puzzles?pattern=fork&index=1"
              style={{
                display: "inline-block",
                backgroundColor: "#10b981",
                color: "white",
                padding: "1rem 2rem",
                borderRadius: "10px",
                textDecoration: "none",
                fontWeight: "600",
                fontSize: "1rem",
                transition: "all 0.2s",
                boxShadow: "0 4px 16px rgba(16, 185, 129, 0.3)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = "#059669";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(16, 185, 129, 0.4)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = "#10b981";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(16, 185, 129, 0.3)";
              }}
            >
              Start with Fork →
            </Link>
            <Link
              href="/app/patterns"
              style={{
                display: "inline-block",
                backgroundColor: "#1a1a2e",
                color: "#94a3b8",
                border: "1px solid #2e3a5c",
                padding: "0.875rem 1.5rem",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: "600",
                fontSize: "0.9rem",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = "#1f2040";
                e.currentTarget.style.borderColor = "#f97316";
                e.currentTarget.style.color = "#e2e8f0";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = "#1a1a2e";
                e.currentTarget.style.borderColor = "#2e3a5c";
                e.currentTarget.style.color = "#94a3b8";
              }}
            >
              Browse All Patterns
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  if (phase === "complete") {
    return renderCompletionScreen();
  }

  return (
    <div style={{
      maxWidth: "720px",
      margin: "0 auto",
      padding: "0.75rem 1rem 1.25rem",
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
    }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ 
          fontSize: "2rem", 
          fontWeight: "800", 
          marginBottom: "0.25rem",
          color: "#f1f5f9",
          letterSpacing: "-0.025em"
        }}>
          Scan Before You Move
        </h1>
        <p style={{ 
          color: "#f97316", 
          fontSize: "1.1rem",
          fontWeight: "600",
          marginBottom: "0.5rem"
        }}>
          The #1 habit that separates improving players from stuck ones
        </p>
        <p style={{ 
          color: "#94a3b8", 
          fontSize: "0.95rem",
          marginBottom: "1.25rem",
          backgroundColor: "#1a1f2e",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid #2e3a5c"
        }}>
          <span style={{ color: "#ef4444", fontWeight: "600" }}>C</span>an I give <span style={{ color: "#ef4444", fontWeight: "600" }}>C</span>heck? • <span style={{ color: "#3b82f6", fontWeight: "600" }}>C</span>an I <span style={{ color: "#3b82f6", fontWeight: "600" }}>C</span>apture anything? • Is my piece under <span style={{ color: "#eab308", fontWeight: "600" }}>T</span>hreat?
        </p>
        
        {/* Step progress stepper */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          marginBottom: "0.5rem",
        }}>
          <div style={{
            position: "absolute",
            top: "12px",
            left: "40px",
            right: "40px",
            height: "2px",
            backgroundColor: "#334155",
            zIndex: 1,
          }} />
          {[
            { id: "checks", label: "Checks", color: "#ef4444", number: 1 },
            { id: "captures", label: "Captures", color: "#3b82f6", number: 2 },
            { id: "threats", label: "Threats", color: "#eab308", number: 3 },
            { id: "solve", label: "Solve", color: "#10b981", number: 4 }
          ].map((step, idx) => {
            const isActive = phase === step.id;
            const isCompleted = ["checks", "captures", "threats", "solve"].indexOf(phase) > idx;
            return (
              <div key={step.id} style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                zIndex: 2,
              }}>
                <div style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: isActive || isCompleted ? step.color : "#334155",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "600",
                  fontSize: "0.85rem",
                  marginBottom: "0.5rem",
                  border: isActive ? "2px solid white" : "none",
                  boxShadow: isActive ? `0 0 0 3px ${step.color}40` : "none",
                  transition: "all 0.2s",
                }}>
                  {isCompleted ? "✓" : step.number}
                </div>
                <div style={{
                  fontSize: "0.8rem",
                  fontWeight: isActive ? "600" : "400",
                  color: isActive ? step.color : "#94a3b8",
                  textAlign: "center",
                  textTransform: "capitalize",
                }}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Coaching cue / instruction area */}
      <div style={{ 
        marginBottom: "1rem",
        padding: "1rem",
        backgroundColor: "#0f172a",
        borderRadius: "12px",
        borderLeft: `4px solid ${phase === "checks" ? "#ef4444" : phase === "captures" ? "#3b82f6" : phase === "threats" ? "#eab308" : "#10b981"}`,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
      }}>
        <div style={{ 
          color: "#e2e8f0", 
          fontSize: "1.1rem",
          fontWeight: "600",
          lineHeight: 1.4,
          marginBottom: "0.5rem"
        }}>
          {phase === "checks" ? "Step 1: Find all Checks" :
           phase === "captures" ? "Step 2: Find all Captures" :
           phase === "threats" ? "Step 3: Identify all Threats" :
           "Step 4: Find the Best Move"}
        </div>
        <div style={{ 
          color: "#94a3b8", 
          fontSize: "0.95rem",
          fontWeight: "500",
          lineHeight: 1.5,
          marginBottom: "0.5rem"
        }}>
          {phase === "checks" ? "Click every square where White can give check. Hit 'Done' when finished." :
           phase === "captures" ? "Click every square where White can capture an opponent's piece." :
           phase === "threats" ? "Tap the White pieces that Black is attacking right now." :
           "Now play the single best move in the position."}
        </div>
        <div style={{ 
          color: "#64748b", 
          fontSize: "0.85rem",
          fontWeight: "500",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>White to move</span>
          <span>Puzzle {puzzleIdx + 1} of {POSITIONS.length}</span>
        </div>
      </div>

      {/* Board as hero - larger and centered */}
      <div style={{
        position: "relative",
        marginBottom: "1.5rem",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: boardWidth + 40,
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
        padding: "0.9rem 1rem",
        borderRadius: "12px",
        border: "1px solid #1e293b",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "0.9rem",
      }}>
        {/* Left: Progress and status */}
        <div style={{ 
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flex: "1 1 200px", // Grow, shrink, min width 200px
        }}>
          {/* Progress dots */}
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            {POSITIONS.map((_, idx) => (
              <div
                key={idx}
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  backgroundColor: idx === puzzleIdx ? (phase === "checks" ? "#ef4444" : phase === "captures" ? "#3b82f6" : phase === "threats" ? "#eab308" : "#10b981") : 
                                 idx < puzzleIdx ? "#4ade80" : "#334155",
                  transition: "background-color 0.2s",
                  border: idx === puzzleIdx ? "2px solid white" : "none",
                  boxShadow: idx === puzzleIdx ? "0 0 0 2px rgba(255, 255, 255, 0.3)" : "none",
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
                <>Checks found: <span style={{ color: "#4ade80", fontWeight: "600" }}>{foundMoves.length}</span> / {allChecks.length}</>
              )}
              {phase === "captures" && (
                <>Captures found: <span style={{ color: "#4ade80", fontWeight: "600" }}>{foundMoves.length}</span> / {allCaptures.length}</>
              )}
              {phase === "threats" && (
                <>Threats found: <span style={{ color: "#4ade80", fontWeight: "600" }}>{threatSquares.length}</span></>
)}
        
        {/* First visit tooltip */}
        {showFirstVisitTooltip && phase === "checks" && (
          <div style={{
            position: "absolute",
            top: "50%",
            right: "20px",
            transform: "translateY(-50%)",
            backgroundColor: "#0f172a",
            border: "2px solid #ef4444",
            borderRadius: "12px",
            padding: "1rem",
            width: "260px",
            zIndex: 10,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
          }}>
            <div style={{
              position: "absolute",
              right: "100%",
              top: "50%",
              transform: "translateY(-50%)",
              width: 0,
              height: 0,
              borderTop: "12px solid transparent",
              borderBottom: "12px solid transparent",
              borderRight: "12px solid #ef4444",
            }} />
            <div style={{ 
              color: "#ef4444", 
              fontWeight: "600", 
              fontSize: "0.9rem",
              marginBottom: "0.5rem"
            }}>
              Tip for beginners
            </div>
            <div style={{ 
              color: "#e2e8f0", 
              fontSize: "0.95rem",
              lineHeight: 1.5,
              marginBottom: "1rem"
            }}>
              A <span style={{ color: "#ef4444", fontWeight: "600" }}>check</span> is any move that attacks the enemy king. Look for pieces that could move to threaten the black king.
            </div>
            <button
              onClick={() => setShowFirstVisitTooltip(false)}
              style={{
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                fontWeight: "600",
                fontSize: "0.85rem",
                cursor: "pointer",
                width: "100%",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = "#dc2626";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = "#ef4444";
              }}
            >
              Got it — let&apos;s practice
            </button>
          </div>
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
              backgroundColor: phase === "checks" ? "#ef4444" : phase === "captures" ? "#3b82f6" : "#eab308",
              color: "white",
              border: "none",
              padding: "0.875rem 1.75rem",
              borderRadius: "10px",
              fontWeight: "600",
              fontSize: "1rem",
              cursor: "pointer",
              transition: "all 0.2s",
              flexShrink: 0,
              minWidth: "160px",
              boxShadow: phase === "checks" ? "0 4px 12px rgba(239, 68, 68, 0.3)" : 
                         phase === "captures" ? "0 4px 12px rgba(59, 130, 246, 0.3)" :
                         "0 4px 12px rgba(234, 179, 8, 0.3)",
            }}
            onMouseEnter={e => {
              const hoverColor = phase === "checks" ? "#dc2626" : phase === "captures" ? "#2563eb" : "#ca8a04";
              e.currentTarget.style.backgroundColor = hoverColor;
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = phase === "checks" ? "0 6px 16px rgba(239, 68, 68, 0.4)" : 
                                               phase === "captures" ? "0 6px 16px rgba(59, 130, 246, 0.4)" :
                                               "0 6px 16px rgba(234, 179, 8, 0.4)";
            }}
            onMouseLeave={e => {
              const originalColor = phase === "checks" ? "#ef4444" : phase === "captures" ? "#3b82f6" : "#eab308";
              e.currentTarget.style.backgroundColor = originalColor;
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = phase === "checks" ? "0 4px 12px rgba(239, 68, 68, 0.3)" : 
                                               phase === "captures" ? "0 4px 12px rgba(59, 130, 246, 0.3)" :
                                               "0 4px 12px rgba(234, 179, 8, 0.3)";
            }}
          >
            {phase === "checks" ? (foundMoves.length > 0 ? "Done — Next →" : "None exist — Next →") :
             phase === "captures" ? (foundMoves.length > 0 ? "Done — Next →" : "None exist — Next →") :
             "Done — Next →"}
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