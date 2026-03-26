"use client";

import { useState } from "react";
import { markSocialProofShown } from "@/lib/socialProof";

/**
 * Sprint 8 — Social Proof Banner
 *
 * Subtle dismissible banner shown below the puzzle board.
 * Design rules:
 * 1. Never use "blocked" or "restricted"
 * 2. Show what they'd get, not what they're missing
 * 3. Free trial CTA on every prompt
 * 4. One CTA per prompt
 * 5. Dismiss always visible
 * 6. Max one per session (caller checks isSocialProofSuppressed)
 */

interface SocialProofBannerProps {
  type: "fifth-puzzle" | "failed-puzzle";
  onDismiss: () => void;
  onUpgrade?: () => void;
}

const CONTENT = {
  "fifth-puzzle": {
    icon: "🚀",
    message: "Improver users solve 40% more puzzles per session.",
    cta: "Unlock unlimited puzzles →",
    sub: null as string | null,
  },
  "failed-puzzle": {
    icon: "🧠",
    message: "Without spaced repetition, you'll forget this pattern within 24 hours.",
    cta: "Start 30-day free trial",
    sub: "Improver users retain 80% of difficult puzzles after 30 days.",
  },
};

export default function SocialProofBanner({ type, onDismiss, onUpgrade }: SocialProofBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const content = CONTENT[type];

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    markSocialProofShown();
    onDismiss();
  }

  function handleUpgrade() {
    markSocialProofShown();
    onUpgrade?.();
  }

  return (
    <div
      style={{
        backgroundColor: "#0f1a2e",
        border: "1px solid #1e3a5c",
        borderRadius: "10px",
        padding: "0.85rem 1rem",
        marginTop: "0.75rem",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        position: "relative",
      }}
      role="complementary"
      aria-label="Upgrade suggestion"
    >
      {/* Dismiss button — always visible, top-right */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute",
          top: "0.5rem",
          right: "0.5rem",
          background: "none",
          border: "none",
          color: "#475569",
          cursor: "pointer",
          fontSize: "0.85rem",
          lineHeight: 1,
          padding: "0.1rem 0.3rem",
        }}
      >
        ✕
      </button>

      <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>{content.icon}</span>

      <div style={{ flex: 1, paddingRight: "1rem" }}>
        <p style={{ color: "#94a3b8", fontSize: "0.82rem", margin: 0, marginBottom: content.sub ? "0.3rem" : "0.5rem", lineHeight: 1.5 }}>
          {content.message}
        </p>
        {content.sub && (
          <p style={{ color: "#64748b", fontSize: "0.76rem", margin: 0, marginBottom: "0.5rem", lineHeight: 1.5 }}>
            {content.sub}
          </p>
        )}
        <button
          onClick={handleUpgrade}
          style={{
            backgroundColor: "transparent",
            border: "1px solid #4ade80",
            color: "#4ade80",
            borderRadius: "6px",
            padding: "0.3rem 0.75rem",
            fontSize: "0.78rem",
            fontWeight: "bold",
            cursor: "pointer",
            display: "inline-block",
          }}
        >
          {content.cta}
        </button>
      </div>
    </div>
  );
}
