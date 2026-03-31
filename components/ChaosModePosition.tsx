"use client";

import { useState, useEffect } from "react";
import ChessBoard from "./ChessBoard";
import { updateComposureRating } from "@/lib/storage";

export type ChaosPositionType = "quiet" | "defensive";

interface MoveChoice {
  label: "A" | "B" | "C";
  uci: string;
  description: string;
  isCorrect: boolean;
  isGreedy: boolean;
}

interface ChaosModePositionProps {
  puzzleId: string;
  fen: string;
  orientation: "white" | "black";
  positionType: ChaosPositionType;
  choices: MoveChoice[];
  boardWidth: number;
  onResult: (wasCorrect: boolean) => void;
  onNext: () => void;
}

export default function ChaosModePosition({
  puzzleId,
  fen,
  orientation,
  positionType,
  choices,
  boardWidth,
  onResult,
  onNext,
}: ChaosModePositionProps) {
  const [selected, setSelected] = useState<"A" | "B" | "C" | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setSelected(null);
    setRevealed(false);
  }, [puzzleId]);

  function handlePick(label: "A" | "B" | "C") {
    if (revealed) return;
    setSelected(label);
    setRevealed(true);
    const choice = choices.find((c) => c.label === label);
    const wasCorrect = choice?.isCorrect ?? false;
    updateComposureRating(wasCorrect);
    onResult(wasCorrect);
  }

  const title =
    positionType === "quiet"
      ? "🤫 Quiet Position"
      : "🛡️ Defensive Position";

  const subtitle =
    positionType === "quiet"
      ? "No tactic here — find the safest, best move"
      : "You're under pressure — avoid losing material";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: boardWidth < 480 ? "1fr" : "auto 1fr",
        gap: boardWidth < 480 ? "0.75rem" : "1.5rem",
        alignItems: "start",
      }}
    >
      <div>
        {/* Header */}
        <div
          style={{
            backgroundColor: "#1a1a2e",
            border: "1px solid #7c3aed",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            marginBottom: "0.75rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.25rem",
            }}
          >
            <span
              style={{
                backgroundColor: "#4c1d95",
                color: "#c4b5fd",
                fontSize: "0.7rem",
                fontWeight: "bold",
                padding: "0.15rem 0.5rem",
                borderRadius: "6px",
                letterSpacing: "0.06em",
              }}
            >
              🌀 CHAOS MODE
            </span>
          </div>
          <div
            style={{
              color: "#e2e8f0",
              fontSize: "1rem",
              fontWeight: "bold",
              marginBottom: "0.2rem",
            }}
          >
            {title}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>{subtitle}</div>
        </div>

        <ChessBoard
          key={puzzleId}
          fen={fen}
          orientation={orientation}
          onMove={() => false}
          draggable={false}
          boardWidth={boardWidth}
        />
      </div>

      {/* Right panel: move choices */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div
          style={{
            backgroundColor: "#1a1a2e",
            border: "1px solid #2e3a5c",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
          }}
        >
          <div
            style={{
              color: "#e2e8f0",
              fontSize: "0.82rem",
              fontWeight: "700",
              marginBottom: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Choose the best move
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {choices.map((choice) => {
              const isPicked = selected === choice.label;
              const isCorrect = choice.isCorrect;
              const isGreedy = choice.isGreedy;

              let bg = "#0f1621";
              let border = "#2e3a5c";
              let color = "#e2e8f0";

              if (revealed) {
                if (isCorrect) {
                  bg = "#0a1f12";
                  border = "#15803d";
                  color = "#4ade80";
                } else if (isPicked && !isCorrect) {
                  bg = "#1f0a0a";
                  border = "#7f1d1d";
                  color = "#f87171";
                } else {
                  bg = "#0f1621";
                  border = "#1e2a3a";
                  color = "#475569";
                }
              }

              return (
                <button
                  key={choice.label}
                  onClick={() => handlePick(choice.label)}
                  disabled={revealed}
                  style={{
                    backgroundColor: bg,
                    border: `1px solid ${border}`,
                    borderRadius: "10px",
                    padding: "0.8rem 1rem",
                    cursor: revealed ? "default" : "pointer",
                    textAlign: "left",
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!revealed) {
                      e.currentTarget.style.backgroundColor = "#1e2a3a";
                      e.currentTarget.style.borderColor = "#4a6a8a";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!revealed) {
                      e.currentTarget.style.backgroundColor = bg;
                      e.currentTarget.style.borderColor = border;
                    }
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.2rem",
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: revealed ? (isCorrect ? "#15803d" : isPicked ? "#7f1d1d" : "#1e2a3a") : "#1e2a3a",
                        color: revealed ? (isCorrect ? "#4ade80" : isPicked ? "#f87171" : "#475569") : "#94a3b8",
                        fontWeight: "bold",
                        fontSize: "0.78rem",
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {choice.label}
                    </span>
                    <span style={{ color, fontSize: "0.85rem", fontWeight: "600" }}>
                      {revealed && isCorrect ? "✓ " : revealed && isPicked && !isCorrect ? "✗ " : ""}
                      {choice.description.split(" — ")[0]}
                    </span>
                    {revealed && isGreedy && !isCorrect && (
                      <span
                        style={{
                          backgroundColor: "#7f1d1d",
                          color: "#fca5a5",
                          fontSize: "0.65rem",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "4px",
                          fontWeight: "bold",
                        }}
                      >
                        Greedy trap
                      </span>
                    )}
                  </div>
                  {revealed && (
                    <div style={{ color: "#64748b", fontSize: "0.76rem", paddingLeft: "1.75rem" }}>
                      {isCorrect
                        ? choice.description.includes(" — ")
                          ? choice.description.split(" — ")[1]
                          : "Best move — solid and safe"
                        : isGreedy
                        ? "No tactic here — the greedy move loses material"
                        : choice.description.includes(" — ")
                        ? choice.description.split(" — ")[1]
                        : "Not the best option"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Next button after reveal */}
        {revealed && (
          <button
            onClick={onNext}
            style={{
              backgroundColor: "#166534",
              color: "#86efac",
              border: "1px solid #15803d",
              borderRadius: "8px",
              padding: "0.7rem",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.9rem",
            }}
          >
            Next Puzzle →
          </button>
        )}
      </div>
    </div>
  );
}
