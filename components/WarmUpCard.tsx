"use client";

import { useState } from "react";
import { setWarmedUpToday } from "@/lib/storage";

interface WarmUpCardProps {
  onStartWarmUp: () => void;
  onSkip: () => void;
}

export default function WarmUpCard({ onStartWarmUp, onSkip }: WarmUpCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function handleStartWarmUp() {
    setDismissed(true);
    onStartWarmUp();
  }

  function handleSkip() {
    setWarmedUpToday();
    setDismissed(true);
    onSkip();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
      <button
        onClick={handleStartWarmUp}
        title="3 easy unrated puzzles to tune your board vision"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          backgroundColor: "#1a2535",
          border: "1px solid #2e3a5c",
          borderRadius: "999px",
          color: "#94a3b8",
          fontSize: "0.72rem",
          padding: "0.2rem 0.6rem",
          cursor: "pointer",
          whiteSpace: "nowrap",
          lineHeight: 1.4,
        }}
      >
        🧠 Warm up? <span style={{ color: "#64748b" }}>3 easy puzzles</span>
      </button>
      <button
        onClick={handleSkip}
        aria-label="Skip warm-up"
        style={{
          background: "none",
          border: "none",
          color: "#334155",
          fontSize: "0.68rem",
          cursor: "pointer",
          padding: "0.1rem 0.2rem",
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
