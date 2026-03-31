"use client";

import { useState } from "react";

interface ThinkingFrameworkOverlayProps {
  onComplete: (allChecked: boolean) => void;
}

const CHECKS = [
  { id: "checks", emoji: "♟️", label: "Checks", desc: "Can you give check? Can the opponent?" },
  { id: "captures", emoji: "⚔️", label: "Captures", desc: "Any pieces hanging? Any trades available?" },
  { id: "threats", emoji: "👁️", label: "Threats", desc: "What is the opponent threatening? What are you threatening?" },
];

export default function ThinkingFrameworkOverlay({ onComplete }: ThinkingFrameworkOverlayProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allChecked = CHECKS.every(c => checked[c.id]);

  function toggle(id: string) {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    if (CHECKS.every(c => next[c.id])) {
      // All checked — fade out after a short delay
      setTimeout(() => onComplete(true), 600);
    }
  }

  return (
    <div
      style={{
        backgroundColor: "#0d1b2e",
        border: "1px solid #2e3a5c",
        borderRadius: "12px",
        padding: "1rem 1.1rem",
        marginBottom: "0.75rem",
        transition: "opacity 0.4s",
        opacity: allChecked ? 0 : 1,
        pointerEvents: allChecked ? "none" : "auto",
      }}
    >
      <div style={{
        color: "#94a3b8",
        fontSize: "0.7rem",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "0.65rem",
      }}>
        🧠 Before you move, check:
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {CHECKS.map((c) => {
          const isChecked = !!checked[c.id];
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.7rem",
                background: "none",
                border: `1px solid ${isChecked ? "#2e75b6" : "#1e2a3a"}`,
                borderRadius: "8px",
                padding: "0.5rem 0.75rem",
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 0.15s, background 0.15s",
                backgroundColor: isChecked ? "rgba(46,117,182,0.12)" : "transparent",
              }}
            >
              {/* Checkbox visual */}
              <div style={{
                width: "18px",
                height: "18px",
                borderRadius: "4px",
                border: `2px solid ${isChecked ? "#2e75b6" : "#3a4a5c"}`,
                backgroundColor: isChecked ? "#2e75b6" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.15s, border-color 0.15s",
              }}>
                {isChecked && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div>
                <div style={{
                  color: isChecked ? "#7ab8e8" : "#e2e8f0",
                  fontSize: "0.85rem",
                  fontWeight: "600",
                  lineHeight: 1.2,
                }}>
                  {c.emoji} {c.label}
                </div>
                <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: "0.1rem" }}>
                  {c.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!allChecked && (
        <div style={{
          color: "#475569",
          fontSize: "0.68rem",
          marginTop: "0.6rem",
          textAlign: "center",
        }}>
          Check all three to unlock the board
        </div>
      )}
    </div>
  );
}
