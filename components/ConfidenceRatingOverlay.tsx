"use client";

import { useEffect, useState } from "react";
import { recordConfidenceEntry, type ConfidenceLevel } from "@/lib/storage";

const CONFIDENCE_OPTIONS: Array<{
  level: ConfidenceLevel;
  emoji: string;
  label: string;
  color: string;
  bg: string;
  border: string;
}> = [
  { level: "low", emoji: "😰", label: "Not sure", color: "#f87171", bg: "#1f0a0a", border: "#7f1d1d" },
  { level: "medium", emoji: "🤔", label: "Somewhat confident", color: "#fbbf24", bg: "#1a1200", border: "#78350f" },
  { level: "high", emoji: "💪", label: "Very confident", color: "#4ade80", bg: "#0a1f12", border: "#14532d" },
];

const AUTO_DISMISS_MS = 8000;

export default function ConfidenceRatingOverlay({
  puzzleId,
  wasCorrect,
  onDone,
}: {
  puzzleId: string;
  wasCorrect: boolean;
  onDone: (confidence: ConfidenceLevel) => void;
}) {
  const [timeLeft, setTimeLeft] = useState(AUTO_DISMISS_MS / 1000);

  useEffect(() => {
    const tick = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(tick);
          recordConfidenceEntry({
            puzzleId,
            confidence: "medium",
            wasCorrect,
            date: new Date().toISOString().slice(0, 10),
          });
          onDone("medium");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [puzzleId, wasCorrect, onDone]);

  function handlePick(level: ConfidenceLevel) {
    recordConfidenceEntry({
      puzzleId,
      confidence: level,
      wasCorrect,
      date: new Date().toISOString().slice(0, 10),
    });
    onDone(level);
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "110px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#1a1a2e",
        border: "1px solid #2e3a5c",
        borderRadius: "14px",
        padding: "1rem 1.25rem",
        zIndex: 1100,
        minWidth: "300px",
        maxWidth: "400px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        animation: "slideIn 0.2s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.75rem",
        }}
      >
        <div style={{ color: "#e2e8f0", fontSize: "0.88rem", fontWeight: "600" }}>
          How confident were you?
        </div>
        <div
          style={{
            color: "#475569",
            fontSize: "0.72rem",
            backgroundColor: "#0f1621",
            border: "1px solid #1e2a3a",
            borderRadius: "6px",
            padding: "0.15rem 0.4rem",
          }}
        >
          auto in {timeLeft}s
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        {CONFIDENCE_OPTIONS.map(({ level, emoji, label, color, bg, border }) => (
          <button
            key={level}
            onClick={() => handlePick(level)}
            style={{
              flex: 1,
              backgroundColor: bg,
              border: `1px solid ${border}`,
              borderRadius: "10px",
              padding: "0.65rem 0.4rem",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.3rem",
              transition: "transform 0.1s, opacity 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.04)";
              e.currentTarget.style.opacity = "0.95";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.opacity = "1";
            }}
          >
            <span style={{ fontSize: "1.4rem" }}>{emoji}</span>
            <span
              style={{
                color,
                fontSize: "0.7rem",
                fontWeight: "600",
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
