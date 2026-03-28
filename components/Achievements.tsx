"use client";

import { useMemo, useState } from "react";
import { getNewAchievements } from "@/lib/storage";

const CATEGORY_LABELS: Record<string, string> = {
  rating: "⭐ Rating Milestones",
  pattern: "🎯 Pattern Mastery",
  consistency: "🔥 Consistency",
  review: "🔁 Review",
  improvement: "📈 Improvement",
};

const CATEGORY_MAP: Record<string, string> = {
  first_steps: "rating",
  improving: "rating",
  solid: "rating",
  strong: "rating",
  expert: "rating",
  master: "rating",
  century_climb: "rating",
  pattern_beginner: "pattern",
  pattern_student: "pattern",
  pattern_master: "pattern",
  sharp_eye: "pattern",
  three_in_a_row: "consistency",
  week_warrior: "consistency",
  habit_formed: "consistency",
  clean_slate: "review",
  second_chance: "review",
  weekly_climber: "improvement",
  personal_best: "improvement",
};

export default function Achievements() {
  const achievements = useMemo(() => getNewAchievements(), []);
  const earned = achievements.filter((a) => a.earned);
  const total = achievements.length;

  const [filter, setFilter] = useState<"all" | "earned" | "locked">("all");

  // Group by category
  const categories = useMemo(() => {
    const grouped: Record<string, typeof achievements> = {};
    for (const ach of achievements) {
      const cat = CATEGORY_MAP[ach.id] ?? "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ach);
    }
    return grouped;
  }, [achievements]);

  const filtered = (list: typeof achievements) => {
    if (filter === "earned") return list.filter((a) => a.earned);
    if (filter === "locked") return list.filter((a) => !a.earned);
    return list;
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", margin: 0 }}>
          🏆 Achievements
        </h1>
        <span style={{ color: "#4ade80", fontSize: "0.95rem" }}>
          {earned.length} / {total} earned
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

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {(["all", "earned", "locked"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              backgroundColor: filter === f ? "#4ade80" : "transparent",
              color: filter === f ? "#0f0f1a" : "#64748b",
              border: filter === f ? "1px solid #4ade80" : "1px solid #2e3a5c",
              borderRadius: "6px",
              padding: "0.4rem 1rem",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: filter === f ? "bold" : "normal",
              textTransform: "capitalize",
            }}
          >
            {f === "all" ? `All (${total})` : f === "earned" ? `Earned (${earned.length})` : `Locked (${total - earned.length})`}
          </button>
        ))}
      </div>

      {/* Category sections */}
      {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
        const list = filtered(categories[cat] ?? []);
        if (list.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: "2rem" }}>
            <div style={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {list.map((ach) => (
                <div
                  key={ach.id}
                  style={{
                    backgroundColor: ach.earned ? "#1a1a2e" : "#0f1219",
                    border: `1px solid ${ach.earned ? "#ffd70050" : "#1e2a3a"}`,
                    borderRadius: "12px",
                    padding: "1.25rem",
                    opacity: ach.earned ? 1 : 0.55,
                    transition: "opacity 0.2s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                    <span style={{
                      fontSize: "2.2rem",
                      filter: ach.earned ? "none" : "grayscale(100%)",
                    }}>
                      {ach.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: ach.earned ? "#ffd700" : "#64748b", fontWeight: "bold", fontSize: "0.95rem" }}>
                        {ach.name}
                      </div>
                      {ach.earned && ach.earnedDate && (
                        <div style={{ color: "#475569", fontSize: "0.68rem" }}>
                          Earned {new Date(ach.earnedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      )}
                    </div>
                    {ach.earned && (
                      <span style={{
                        backgroundColor: "#0a1f12",
                        color: "#4ade80",
                        border: "1px solid #1a4a2a",
                        borderRadius: "5px",
                        padding: "0.15rem 0.45rem",
                        fontSize: "0.65rem",
                        fontWeight: "bold",
                        whiteSpace: "nowrap",
                      }}>
                        ✓ EARNED
                      </span>
                    )}
                  </div>
                  <p style={{ color: ach.earned ? "#94a3b8" : "#475569", fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>
                    {ach.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {earned.length === 0 && filter !== "locked" && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#475569" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎯</div>
          <div style={{ color: "#94a3b8", fontSize: "1rem" }}>No achievements yet — start solving puzzles!</div>
          <div style={{ color: "#475569", fontSize: "0.85rem", marginTop: "0.5rem" }}>
            Solve puzzles, build streaks, and master patterns to earn badges.
          </div>
        </div>
      )}
    </div>
  );
}
