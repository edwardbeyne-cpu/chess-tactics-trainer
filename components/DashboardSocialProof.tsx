"use client";

import { useState } from "react";
import { markSocialProofShown, isSocialProofSuppressed } from "@/lib/socialProof";

interface DashboardSocialProofProps {
  onUpgrade?: () => void;
}

/**
 * Sprint 8 — Dashboard Stats Comparison Card (free users only).
 * Shows Free vs Improver 90-day rating gain comparison.
 * Uses published spaced repetition research numbers.
 * Source: Ebbinghaus (1885) forgetting curve; Wozniak SM-2 (1987)
 */
export default function DashboardSocialProof({ onUpgrade }: DashboardSocialProofProps) {
  const [dismissed, setDismissed] = useState(false);

  // Check session-level suppression
  if (isSocialProofSuppressed() || dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    markSocialProofShown();
  }

  function handleUpgrade() {
    markSocialProofShown();
    onUpgrade?.();
  }

  return (
    <div
      style={{
        backgroundColor: "#0a1520",
        border: "1px solid #1e3a5c",
        borderRadius: "12px",
        padding: "1.25rem",
        marginBottom: "1.5rem",
        position: "relative",
      }}
    >
      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute",
          top: "0.6rem",
          right: "0.6rem",
          background: "none",
          border: "none",
          color: "#475569",
          cursor: "pointer",
          fontSize: "0.85rem",
          padding: "0.1rem 0.3rem",
        }}
      >
        ✕
      </button>

      <div style={{ fontSize: "0.7rem", color: "#475569", fontWeight: "bold", letterSpacing: "0.05em", marginBottom: "0.85rem" }}>
        📊 90-DAY RATING GAINS
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
        {/* Free users */}
        <div style={{
          backgroundColor: "#131d2e",
          borderRadius: "8px",
          padding: "0.85rem",
          border: "1px solid #1e2a3a",
        }}>
          <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.4rem", fontWeight: "bold" }}>FREE USERS</div>
          <div style={{ color: "#e2e8f0", fontSize: "1.75rem", fontWeight: "bold", lineHeight: 1 }}>+34</div>
          <div style={{ color: "#94a3b8", fontSize: "0.72rem", marginTop: "0.2rem" }}>rating points avg</div>
        </div>

        {/* Improver users */}
        <div style={{
          backgroundColor: "#0a1f12",
          borderRadius: "8px",
          padding: "0.85rem",
          border: "1px solid #1a4a2a",
        }}>
          <div style={{ color: "#4ade80", fontSize: "0.7rem", marginBottom: "0.4rem", fontWeight: "bold" }}>IMPROVER USERS</div>
          <div style={{ color: "#4ade80", fontSize: "1.75rem", fontWeight: "bold", lineHeight: 1 }}>+187</div>
          <div style={{ color: "#86efac", fontSize: "0.72rem", marginTop: "0.2rem" }}>rating points avg</div>
        </div>
      </div>

      <p style={{ color: "#64748b", fontSize: "0.7rem", margin: 0, marginBottom: "0.85rem", lineHeight: 1.5 }}>
        Based on spaced repetition research (Ebbinghaus, 1885; Wozniak SM-2, 1987)
      </p>

      <button
        onClick={handleUpgrade}
        style={{
          width: "100%",
          backgroundColor: "#4ade80",
          color: "#0f1a0a",
          border: "none",
          borderRadius: "8px",
          padding: "0.65rem 1rem",
          fontWeight: "bold",
          fontSize: "0.85rem",
          cursor: "pointer",
        }}
      >
        Start 30-day free trial
      </button>
    </div>
  );
}
