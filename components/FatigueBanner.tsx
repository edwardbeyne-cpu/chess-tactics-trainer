"use client";

import { useState } from "react";

interface FatigueBannerProps {
  onDismiss: () => void;
}

export default function FatigueBanner({ onDismiss }: FatigueBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    onDismiss();
  }

  return (
    <div style={{
      backgroundColor: "#1a1508",
      border: "1px solid #4a3a0a",
      borderRadius: "10px",
      padding: "0.85rem 1.1rem",
      marginBottom: "0.75rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.75rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
        <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>📉</span>
        <div style={{ color: "#f59e0b", fontSize: "0.85rem", lineHeight: 1.5 }}>
          Your accuracy has dropped 15% in the last 10 puzzles — might be a good stopping point
        </div>
      </div>
      <button
        onClick={handleDismiss}
        style={{
          background: "none",
          border: "none",
          color: "#78350f",
          cursor: "pointer",
          fontSize: "1.1rem",
          padding: "0.1rem 0.25rem",
          flexShrink: 0,
          lineHeight: 1,
        }}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
