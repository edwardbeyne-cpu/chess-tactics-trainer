"use client";

import { useMemo } from "react";
import { getAchievements } from "@/lib/storage";

export default function Achievements() {
  const achievements = useMemo(() => getAchievements(), []);
  const earned = achievements.filter((a) => a.earnedAt !== null);
  const total = achievements.length;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", margin: 0 }}>
          🏆 Achievements
        </h1>
        <span style={{ color: "#4ade80", fontSize: "0.95rem" }}>
          {earned.length} / {total} unlocked
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.82rem" }}>
          <span style={{ color: "#94a3b8" }}>Collection progress</span>
          <span style={{ color: "#ffd700", fontWeight: "bold" }}>{Math.round((earned.length / total) * 100)}%</span>
        </div>
        <div style={{ backgroundColor: "#0d1621", borderRadius: "6px", height: "10px", overflow: "hidden" }}>
          <div style={{
            width: `${(earned.length / total) * 100}%`,
            height: "100%",
            background: "linear-gradient(90deg, #ffd700, #f59e0b)",
            borderRadius: "6px",
            transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {/* Badge grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
        {achievements.map((ach) => {
          const isEarned = ach.earnedAt !== null;
          return (
            <div
              key={ach.id}
              style={{
                backgroundColor: isEarned ? "#1a1a2e" : "#0f1219",
                border: `1px solid ${isEarned ? "#ffd70050" : "#1e2a3a"}`,
                borderRadius: "12px",
                padding: "1.25rem",
                opacity: isEarned ? 1 : 0.55,
                transition: "opacity 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <span style={{
                  fontSize: "2.2rem",
                  filter: isEarned ? "none" : "grayscale(100%)",
                  transition: "filter 0.2s",
                }}>
                  {ach.emoji}
                </span>
                <div>
                  <div style={{ color: isEarned ? "#ffd700" : "#64748b", fontWeight: "bold", fontSize: "0.95rem" }}>
                    {ach.name}
                  </div>
                  {isEarned && ach.earnedAt && (
                    <div style={{ color: "#475569", fontSize: "0.68rem" }}>
                      Earned {new Date(ach.earnedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  )}
                </div>
                {isEarned && (
                  <span style={{
                    marginLeft: "auto",
                    backgroundColor: "#0a1f12",
                    color: "#4ade80",
                    border: "1px solid #1a4a2a",
                    borderRadius: "5px",
                    padding: "0.15rem 0.45rem",
                    fontSize: "0.65rem",
                    fontWeight: "bold",
                  }}>
                    ✓ EARNED
                  </span>
                )}
              </div>
              <p style={{ color: isEarned ? "#94a3b8" : "#475569", fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>
                {ach.description}
              </p>
            </div>
          );
        })}
      </div>

      {earned.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#475569" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎯</div>
          <div style={{ color: "#94a3b8", fontSize: "1rem" }}>No achievements yet — start solving puzzles!</div>
          <div style={{ color: "#475569", fontSize: "0.85rem", marginTop: "0.5rem" }}>
            Your first achievement triggers on your very first solve.
          </div>
        </div>
      )}
    </div>
  );
}
