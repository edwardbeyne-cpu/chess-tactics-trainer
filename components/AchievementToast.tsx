"use client";

import { useEffect } from "react";
import type { Achievement } from "@/lib/storage";

interface AchievementToastProps {
  achievement: Achievement;
  onDone: () => void;
}

export default function AchievementToast({ achievement, onDone }: AchievementToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        backgroundColor: "#1a1a2e",
        border: "2px solid #ffd700",
        borderRadius: "14px",
        padding: "1rem 1.25rem",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        cursor: "pointer",
        maxWidth: "320px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        animation: "slideUpIn 0.4s ease",
      }}
    >
      <span style={{ fontSize: "2.5rem", flexShrink: 0 }}>{achievement.emoji}</span>
      <div>
        <div style={{ color: "#ffd700", fontWeight: "bold", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.1rem" }}>
          Achievement Unlocked!
        </div>
        <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem" }}>
          {achievement.name}
        </div>
        <div style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
          {achievement.description}
        </div>
      </div>
    </div>
  );
}
