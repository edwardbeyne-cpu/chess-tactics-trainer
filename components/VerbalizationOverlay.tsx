"use client";

import { useEffect, useState } from "react";
import { recordVerbalization, type VerbalizedPattern } from "@/lib/storage";

const PATTERNS: Array<{ label: string; pattern: VerbalizedPattern; emoji: string }> = [
  { label: "Fork", pattern: "Fork", emoji: "🍴" },
  { label: "Pin", pattern: "Pin", emoji: "📌" },
  { label: "Skewer", pattern: "Skewer", emoji: "🗡️" },
  { label: "Discovered Attack", pattern: "Discovered Attack", emoji: "🔍" },
  { label: "Back Rank", pattern: "Back Rank", emoji: "🏰" },
  { label: "Other", pattern: "Other", emoji: "♟️" },
];

interface VerbalizationOverlayProps {
  puzzleId: string;
  actualPattern: string;
  onDone: () => void;
}

export default function VerbalizationOverlay({
  puzzleId,
  actualPattern,
  onDone,
}: VerbalizationOverlayProps) {
  const [dismissed, setDismissed] = useState(false);

  // Auto-dismiss after 4 seconds if not tapped
  useEffect(() => {
    if (dismissed) return;
    const timer = setTimeout(() => {
      // Record as "Other" (no guess) if auto-dismissed — don't record, just close
      onDone();
    }, 8000);
    return () => clearTimeout(timer);
  }, [dismissed, onDone]);

  function handleSelect(pattern: VerbalizedPattern) {
    setDismissed(true);
    recordVerbalization(puzzleId, actualPattern, pattern);
    onDone();
  }

  if (dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "100px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#0f1826",
        border: "1px solid #2e4a6a",
        borderRadius: "14px",
        padding: "0.85rem 1.1rem",
        zIndex: 1050,
        minWidth: "300px",
        maxWidth: "420px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.7)",
        animation: "slideIn 0.2s ease",
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          fontSize: "0.8rem",
          marginBottom: "0.65rem",
          textAlign: "center",
          fontWeight: "600",
        }}
      >
        What pattern did you see?{" "}
        <span style={{ color: "#475569", fontSize: "0.7rem", fontWeight: "normal" }}>
          (auto-dismisses in 8s)
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: "0.4rem",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {PATTERNS.map(({ label, pattern, emoji }) => (
          <button
            key={pattern}
            onClick={() => handleSelect(pattern)}
            style={{
              backgroundColor: "#111d2a",
              border: "1px solid #2e4a6a",
              borderRadius: "8px",
              padding: "0.45rem 0.65rem",
              color: "#e2e8f0",
              fontSize: "0.78rem",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.15rem",
              minWidth: "58px",
              transition: "background 0.1s, border-color 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#1e3a5c";
              e.currentTarget.style.borderColor = "#4a7aac";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#111d2a";
              e.currentTarget.style.borderColor = "#2e4a6a";
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>{emoji}</span>
            <span
              style={{
                color: "#94a3b8",
                fontSize: "0.65rem",
                lineHeight: 1.3,
                textAlign: "center",
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
