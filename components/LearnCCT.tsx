"use client";

import { useState, useEffect, useCallback } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./ChessBoard";
import { saveCCTOnboardingComplete } from "@/lib/storage";

type TutorialPhase = "intro" | "checks" | "captures" | "threats";
type PuzzleType = "check" | "capture" | "threat";

const MICRO_TUTORIAL_CARDS = [
  {
    title: "What is CCT?",
    content: "Checks, Captures, Threats is a 3-step scan to find forcing moves before you move.",
    color: "#f97316"
  },
  {
    title: "Why it works",
    content: "Forcing moves create immediate threats that your opponent must respond to.",
    color: "#3b82f6"
  },
  {
    title: "The habit",
    content: "Scan Checks, then Captures, then Threats every move to find more tactics.",
    color: "#10b981"
  }
];

const TEACHING_PUZZLES = [
  {
    id: 1,
    type: "check" as PuzzleType,
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    solution: "d1h5",
    solutionNote: "Queen to h5 gives check to the black king",
    feedback: "That was a Check!",
    explanation: "Checks are moves that put the opponent's king in immediate danger. Always look for checks first."
  },
  {
    id: 2,
    type: "capture" as PuzzleType,
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    solution: "f3e5",
    solutionNote: "Knight takes the pawn on e5",
    feedback: "That was a Capture!",
    explanation: "Captures are moves that take opponent's pieces for free or with advantage. Look for captures second."
  },
  {
    id: 3,
    type: "threat" as PuzzleType,
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    solution: "d1f3",
    solutionNote: "Queen to f3, threatening mate on f7",
    feedback: "That was a Threat!",
    explanation: "Threats are moves that create strong future attacks. Look for threats third in the scan."
  }
];

export default function LearnCCT({ onComplete }: { onComplete: () => void }) {
  const [tutorialPhase, setTutorialPhase] = useState<TutorialPhase>("intro");
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [chess] = useState(() => new Chess(TEACHING_PUZZLES[0].fen));
  const [boardWidth, setBoardWidth] = useState(400);
  
  const currentPuzzle = TEACHING_PUZZLES[currentPuzzleIndex];

  useEffect(() => {
    // Calculate board width for client-side
    const updateBoardWidth = () => {
      if (typeof window !== "undefined") {
        setBoardWidth(Math.min(400, window.innerWidth - 40));
      }
    };
    
    updateBoardWidth();
    window.addEventListener("resize", updateBoardWidth);
    return () => window.removeEventListener("resize", updateBoardWidth);
  }, []);

  const handleCardNext = () => {
    if (currentCardIndex < MICRO_TUTORIAL_CARDS.length - 1) {
      setCurrentCardIndex(prev => prev + 1);
    } else {
      setTutorialPhase("checks");
    }
  };

  const handleCardSkip = () => {
    setTutorialPhase("checks");
  };

  const handleMove = useCallback((from: string, to: string): boolean => {
    const moveUci = `${from}${to}`;
    
    // Try move without promotion first
    let move;
    try {
      move = chess.move({ from, to });
    } catch {
      // If that fails, try with queen promotion
      try {
        move = chess.move({ from, to, promotion: "q" });
      } catch {
        return false;
      }
    }
    
    if (!move) return false;

    const isValid = moveUci === currentPuzzle.solution;
    const color = isValid ? "#4ade80" : "#ef4444";
    
    setFlashColor(color);
    setTimeout(() => setFlashColor(null), 500);

    if (isValid) {
      setShowFeedback(true);
      setTimeout(() => {
        setShowFeedback(false);
        if (currentPuzzleIndex < TEACHING_PUZZLES.length - 1) {
          setCurrentPuzzleIndex(prev => prev + 1);
          chess.load(TEACHING_PUZZLES[currentPuzzleIndex + 1].fen);
        } else {
          saveCCTOnboardingComplete(true);
          setTimeout(() => {
            onComplete();
          }, 1500);
        }
      }, 2000);
    }

    chess.undo();
    return isValid;
  }, [chess, currentPuzzle.solution, currentPuzzleIndex, onComplete]);

  const getCurrentPhaseInstructions = () => {
    if (tutorialPhase === "intro") {
      return "Learn CCT in 3 quick steps";
    }
    return `Puzzle ${currentPuzzleIndex + 1} of 3: Find the ${currentPuzzle.type}`;
  };

  const getCurrentPhaseDescription = () => {
    if (tutorialPhase === "intro") {
      return "Swipe through these cards to understand the CCT framework";
    }
    return `White to move. Find the ${currentPuzzle.type}.`;
  };

  // Intro tutorial screen
  if (tutorialPhase === "intro") {
    const currentCard = MICRO_TUTORIAL_CARDS[currentCardIndex];
    
    return (
      <div style={{
        maxWidth: "500px",
        margin: "0 auto",
        padding: "1.5rem 1rem",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0a0a0f",
        color: "#f1f5f9",
      }}>
        <div style={{ marginBottom: "2rem" }}>
          <div style={{
            fontSize: "0.8rem",
            fontWeight: "700",
            color: "#64748b",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "0.5rem"
          }}>
            Learn CCT · {currentCardIndex + 1}/{MICRO_TUTORIAL_CARDS.length}
          </div>
          <h1 style={{
            fontSize: "1.75rem",
            fontWeight: "800",
            marginBottom: "0.5rem",
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
          }}>
            {getCurrentPhaseInstructions()}
          </h1>
          <p style={{
            color: "#94a3b8",
            fontSize: "1rem",
            lineHeight: 1.6,
          }}>
            {getCurrentPhaseDescription()}
          </p>
        </div>

        {/* Tutorial card */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}>
          <div style={{
            backgroundColor: currentCard.color + "20",
            borderLeft: `4px solid ${currentCard.color}`,
            borderRadius: "12px",
            padding: "2rem 1.5rem",
            width: "100%",
            maxWidth: "400px",
            textAlign: "center",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          }}>
            <div style={{
              fontSize: "1.5rem",
              fontWeight: "700",
              marginBottom: "1rem",
              color: currentCard.color,
            }}>
              {currentCard.title}
            </div>
            <div style={{
              color: "#e2e8f0",
              fontSize: "1.1rem",
              lineHeight: 1.5,
            }}>
              {currentCard.content}
            </div>
          </div>
          
          {/* Progress dots */}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "2rem" }}>
            {MICRO_TUTORIAL_CARDS.map((_, idx) => (
              <div
                key={idx}
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: idx === currentCardIndex ? currentCard.color : "#334155",
                  transition: "background-color 0.2s",
                }}
              />
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          marginTop: "2rem",
        }}>
          <button
            onClick={handleCardSkip}
            style={{
              color: "#64748b",
              backgroundColor: "transparent",
              border: "none",
              padding: "0.75rem 1.5rem",
              cursor: "pointer",
              fontSize: "0.95rem",
            }}
          >
            Skip tutorial
          </button>
          
          <button
            onClick={handleCardNext}
            style={{
              backgroundColor: currentCard.color,
              color: "white",
              border: "none",
              padding: "0.875rem 2rem",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "1rem",
              cursor: "pointer",
              transition: "all 0.2s",
              minWidth: "140px",
              boxShadow: `0 2px 4px ${currentCard.color}40`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = currentCard.color;
              e.currentTarget.style.opacity = "0.9";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = `0 4px 8px ${currentCard.color}60`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = currentCard.color;
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = `0 2px 4px ${currentCard.color}40`;
            }}
          >
            {currentCardIndex < MICRO_TUTORIAL_CARDS.length - 1 ? "Next" : "Start puzzles"}
          </button>
        </div>
      </div>
    );
  }

  // Teaching puzzles screen
  return (
    <div style={{
      maxWidth: "500px",
      margin: "0 auto",
      padding: "1.5rem 1rem",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#0a0a0f",
      color: "#f1f5f9",
    }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{
          fontSize: "0.8rem",
          fontWeight: "700",
          color: "#64748b",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "0.5rem"
        }}>
          Learn CCT · Puzzle {currentPuzzleIndex + 1}/{TEACHING_PUZZLES.length}
        </div>
        <h1 style={{
          fontSize: "1.5rem",
          fontWeight: "700",
          marginBottom: "0.5rem",
          letterSpacing: "-0.025em",
        }}>
          {getCurrentPhaseInstructions()}
        </h1>
        <p style={{
          color: "#94a3b8",
          fontSize: "0.95rem",
          lineHeight: 1.6,
        }}>
          {getCurrentPhaseDescription()}
        </p>
      </div>

      {/* Board */}
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
          draggable={true}
          boardWidth={boardWidth}
          highlightSquares={{}}
          mode="identification"
        />
      </div>

      {/* Feedback overlay */}
      {showFeedback && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "#0f172a",
            borderRadius: "16px",
            padding: "2.5rem",
            maxWidth: "400px",
            textAlign: "center",
            border: "1px solid #1e293b",
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
          }}>
            <div style={{
              fontSize: "2.5rem",
              fontWeight: "700",
              color: "#4ade80",
              marginBottom: "1.5rem",
            }}>
              ✓
            </div>
            <h2 style={{
              fontSize: "1.75rem",
              fontWeight: "700",
              color: "#f1f5f9",
              marginBottom: "1rem",
            }}>
              {currentPuzzle.feedback}
            </h2>
            <p style={{
              color: "#94a3b8",
              fontSize: "1rem",
              lineHeight: 1.5,
            }}>
              {currentPuzzle.explanation}
            </p>
            {currentPuzzleIndex < TEACHING_PUZZLES.length - 1 && (
              <div style={{
                color: "#64748b",
                fontSize: "0.9rem",
                marginTop: "1.5rem",
              }}>
                Next: {TEACHING_PUZZLES[currentPuzzleIndex + 1].type}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress indicator */}
      <div style={{
        backgroundColor: "#0f172a",
        borderRadius: "12px",
        padding: "1rem",
        border: "1px solid #1e293b",
        marginTop: "auto",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1rem",
        }}>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {TEACHING_PUZZLES.map((puzzle, idx) => (
              <div
                key={puzzle.id}
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: idx === currentPuzzleIndex ? "#f97316" : 
                                 idx < currentPuzzleIndex ? "#4ade80" : "#334155",
                }}
              />
            ))}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            {currentPuzzleIndex < TEACHING_PUZZLES.length - 1 
              ? `Next: ${TEACHING_PUZZLES[currentPuzzleIndex + 1].type}`
              : "Last puzzle!"
            }
          </div>
        </div>
        
        <div style={{
          fontSize: "0.85rem",
          color: "#64748b",
          textAlign: "center",
        }}>
          Remember: Scan in order — Checks, Captures, Threats
        </div>
      </div>
    </div>
  );
}