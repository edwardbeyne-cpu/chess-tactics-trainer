"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Chess } from "chess.js";

const ChessBoard = dynamic(() => import("@/components/ChessBoard"), { ssr: false });

// Fork puzzle ~1200 rating — white to move, Re1-e6 wins material via fork threat
const DEMO_PUZZLE = {
  fen: "5rk1/pp4p1/4pn1p/2Pp2q1/1P6/P4QP1/5PP1/1B2R1K1 w - - 0 26",
  correctFrom: "e1",
  correctTo: "e6",
  orientation: "white" as const,
};

export default function TryAPuzzle() {
  const [status, setStatus] = useState<"idle" | "solved" | "wrong">("idle");
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [currentFen, setCurrentFen] = useState(DEMO_PUZZLE.fen);
  const [showHint, setShowHint] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (status !== "idle") { 
      setShowHint(false); 
      setShowTooltip(false);
      return; 
    }
    const hintTimer = setTimeout(() => setShowHint(true), 2000);
    const tooltipTimer = setTimeout(() => setShowTooltip(true), 2000);
    return () => {
      clearTimeout(hintTimer);
      clearTimeout(tooltipTimer);
    };
  }, [status]);

  function handleMove(from: string, to: string): boolean {
    if (status === "solved") return false;
    if (from === DEMO_PUZZLE.correctFrom && to === DEMO_PUZZLE.correctTo) {
      const chess = new Chess(DEMO_PUZZLE.fen);
      chess.move({ from, to });
      setCurrentFen(chess.fen());
      setLastMove([from, to]);
      setStatus("solved");
      return true;
    }
    setStatus("wrong");
    setTimeout(() => setStatus("idle"), 1500);
    return false;
  }

  return (
    <section style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 2rem 4rem" }}>
      <style jsx>{`
        @keyframes pulseGlow {
          0% { box-shadow: inset 0 0 0 0 rgba(245, 158, 11, 0.7); }
          70% { box-shadow: inset 0 0 0 4px rgba(245, 158, 11, 0); }
          100% { box-shadow: inset 0 0 0 0 rgba(245, 158, 11, 0); }
        }
      `}</style>
      <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.75rem", fontWeight: "bold", margin: "0 0 0.5rem" }}>
          Try a puzzle right now
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.95rem", margin: 0 }}>
          No sign-up needed — just find the best move
        </p>
      </div>

      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
      }}>
        {/* Tooltip */}
        {showTooltip && status === "idle" && (
          <div style={{
            backgroundColor: "#1a1508",
            border: "1px solid #f59e0b",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            color: "#f59e0b",
            fontSize: "0.85rem",
            fontWeight: "600",
            opacity: 0,
            animation: "fadeIn 0.3s ease forwards",
            position: "relative",
            marginBottom: "0.5rem",
          }}>
            💡 Try moving the Rook
          </div>
        )}

        {/* Board */}
        <div style={{
          backgroundColor: "#13132b",
          border: `2px solid ${status === "solved" ? "#4ade80" : status === "wrong" ? "#ef4444" : "#2e3a5c"}`,
          borderRadius: "16px",
          padding: "1rem",
          transition: "border-color 0.2s",
          position: "relative",
        }}>
          <div style={{
            position: "relative",
            borderRadius: "8px",
            overflow: "hidden",
          }}>
            {showHint && status === "idle" && (
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 1,
              }}>
                {/* Calculate position for e1 square (assuming standard board layout) */}
                <div style={{
                  position: "absolute",
                  width: "12.5%",  // 1/8 of board
                  height: "12.5%", // 1/8 of board
                  top: "87.5%",    // e1 is on 1st rank (bottom for white)
                  left: "62.5%",   // e file is 5th file (0-indexed 4/7 = 57.14%, but using 62.5% for visual centering)
                  border: "2px solid #f59e0b",
                  borderRadius: "2px",
                  animation: "pulseGlow 1.5s infinite",
                  boxShadow: "inset 0 0 0 2px #f59e0b",
                }} />
              </div>
            )}
            <ChessBoard
              fen={currentFen}
              onMove={handleMove}
              lastMove={lastMove}
              draggable={status !== "solved" && status !== "wrong"}
              boardWidth={Math.min(380, typeof window !== "undefined" ? window.innerWidth - 64 : 380)}
              orientation={DEMO_PUZZLE.orientation}
              showCoordinates={false}
            />
          </div>
        </div>

        {/* Feedback */}
        {status === "solved" && (
          <div style={{
            backgroundColor: "#0d2218",
            border: "1px solid #4ade80",
            borderRadius: "14px",
            padding: "1.5rem 2rem",
            textAlign: "center",
            maxWidth: "420px",
            width: "100%",
          }}>
            <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>✓</div>
            <div style={{ color: "#4ade80", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "0.4rem" }}>
              Correct! You found the fork.
            </div>
            <div style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1.25rem", lineHeight: 1.6 }}>
              Re6 forks the knight on f6 and applies decisive pressure. The rook can&apos;t be captured — white wins material.
            </div>
            <Link
              href="/app/calibration"
              style={{
                display: "inline-block",
                backgroundColor: "#4ade80",
                color: "#0f0f1a",
                padding: "0.75rem 1.75rem",
                borderRadius: "10px",
                textDecoration: "none",
                fontWeight: "bold",
                fontSize: "0.95rem",
              }}
            >
              Train more patterns →
            </Link>
          </div>
        )}

        {status === "wrong" && (
          <div style={{
            color: "#ef4444",
            fontSize: "0.9rem",
            fontWeight: "600",
            padding: "0.75rem 1.5rem",
            backgroundColor: "#1a0a0a",
            border: "1px solid #ef4444",
            borderRadius: "10px",
          }}>
            Not quite — try again. Think about what the rook can attack.
          </div>
        )}

        {status === "idle" && (
          <div style={{
            color: showHint ? "#94a3b8" : "#475569",
            fontSize: showHint ? "0.95rem" : "0.85rem",
            textAlign: "center",
            fontWeight: showHint ? "600" : "normal",
            transition: "all 0.4s ease",
          }}>
            {showHint ? "← Drag a piece to solve" : "White to move — find the fork"}
          </div>
        )}
      </div>
    </section>
  );
}
