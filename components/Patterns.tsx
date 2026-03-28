"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import patterns, { type Pattern } from "@/data/patterns";
import { HelpModal, HelpBulletList } from "./HelpModal";
import {
  getPatternCurriculumSummary,
  type PatternCurriculumSummary,
} from "@/lib/storage";
import { cachedPuzzlesByTheme, PATTERN_PUZZLE_COUNTS } from "@/data/lichess-puzzles";

// ── Theme key mapping: pattern name → lichess theme key ──────────────────

const PATTERN_THEME_KEY: Record<string, string> = {
  "Fork": "fork",
  "Pin": "pin",
  "Skewer": "skewer",
  "Discovered Attack": "discoveredAttack",
  "Back Rank Mate": "backRankMate",
  "Smothered Mate": "smotheredMate",
  "Double Check": "doubleCheck",
  "Overloading": "overloading",
  "Deflection": "deflection",
  "Interference": "interference",
  "Zugzwang": "zugzwang",
  "Attraction": "attraction",
  "Clearance": "clearance",
  "Trapped Piece": "trappedPiece",
  "Discovered Check": "discoveredCheck",
  "Kingside Attack": "kingsideAttack",
  "Queenside Attack": "queensideAttack",
};

function getThemeKey(patternName: string): string {
  return PATTERN_THEME_KEY[patternName] ?? patternName.toLowerCase().replace(/\s+/g, '');
}

// ── Color helpers ─────────────────────────────────────────────────────────

const TIER_COLORS: Record<number, { accent: string; bg: string; border: string; label: string }> = {
  1: { accent: "#22c55e", bg: "#0a1f12", border: "#1a4a2a", label: "Basic" },
  2: { accent: "#f59e0b", bg: "#1a1508", border: "#4a3a0a", label: "Intermediate" },
  3: { accent: "#a855f7", bg: "#150e1f", border: "#3a1f5a", label: "Advanced" },
};

function statusColor(status: PatternCurriculumSummary["status"]): string {
  if (status === "mastered") return "#4ade80";
  if (status === "in_progress") return "#f59e0b";
  return "#64748b";
}

function statusLabel(status: PatternCurriculumSummary["status"]): string {
  if (status === "mastered") return "✅ Mastered";
  if (status === "in_progress") return "📖 In Progress";
  return "⬜ Unstarted";
}

// ── Curriculum Pattern Card ────────────────────────────────────────────────

function CurriculumPatternCard({
  pattern,
  summary,
  onClick,
}: {
  pattern: Pattern;
  summary: PatternCurriculumSummary;
  onClick: () => void;
}) {
  const colors = TIER_COLORS[pattern.tier];
  const progressPct = summary.totalPuzzles > 0
    ? Math.round((summary.completed / summary.totalPuzzles) * 100)
    : 0;

  const isMastered = summary.status === "mastered";

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: "#1a1a2e",
        border: `1px solid ${isMastered ? colors.accent : "#2e3a5c"}`,
        borderRadius: "12px",
        padding: "1.25rem",
        cursor: "pointer",
        transition: "border-color 0.2s, transform 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = colors.accent)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = isMastered ? colors.accent : "#2e3a5c")}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
          <span style={{ fontSize: "1.5rem" }}>{pattern.icon}</span>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem" }}>
            {pattern.name}
          </div>
        </div>
        {/* Status indicator */}
        <span style={{
          color: statusColor(summary.status),
          fontSize: "0.72rem",
          fontWeight: "bold",
          backgroundColor: `${statusColor(summary.status)}15`,
          border: `1px solid ${statusColor(summary.status)}40`,
          borderRadius: "5px",
          padding: "0.2rem 0.5rem",
          whiteSpace: "nowrap",
        }}>
          {statusLabel(summary.status)}
        </span>
      </div>

      {/* ELO rating */}
      <div style={{ marginBottom: "0.5rem" }}>
        <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
          ELO: <strong style={{ color: "#e2e8f0" }}>{summary.patternRating.toLocaleString()}</strong>
        </span>
      </div>

      {/* Progress: X / totalPuzzles */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
        <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
          Progress: <strong style={{ color: "#e2e8f0" }}>{summary.completed} / {summary.totalPuzzles}</strong>
        </span>
        <span style={{ color: "#64748b", fontSize: "0.72rem" }}>{progressPct}%</span>
      </div>

      {/* Progress bar */}
      <div style={{ backgroundColor: "#0d1621", borderRadius: "4px", height: "6px", overflow: "hidden", marginBottom: "0.5rem" }}>
        <div style={{
          width: `${progressPct}%`,
          height: "100%",
          backgroundColor: isMastered ? colors.accent : "#2e75b6",
          borderRadius: "4px",
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* Due for review badge */}
      {summary.dueForReview > 0 && (
        <div>
          <span style={{
            color: "#f59e0b",
            fontSize: "0.7rem",
            backgroundColor: "#1a1508",
            border: "1px solid #4a3a0a",
            borderRadius: "4px",
            padding: "0.15rem 0.4rem",
          }}>
            📅 {summary.dueForReview} due for review
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main Patterns Component ───────────────────────────────────────────────

export default function Patterns() {
  const router = useRouter();

  // Compute summaries for each pattern
  const summaries = useMemo(() => {
    const result: Record<string, PatternCurriculumSummary> = {};
    for (const p of patterns) {
      const themeKey = getThemeKey(p.name);
      const totalPuzzles = PATTERN_PUZZLE_COUNTS[themeKey] ?? (cachedPuzzlesByTheme[themeKey]?.length ?? 0);
      result[p.name] = getPatternCurriculumSummary(themeKey, totalPuzzles || 200);
    }
    return result;
  }, []);



  // Overall stats
  const totalCompleted = Object.values(summaries).reduce((s, x) => s + x.completed, 0);
  const totalPossible = Object.values(summaries).reduce((s, x) => s + x.totalPuzzles, 0);
  const masteredCount = Object.values(summaries).filter(x => x.status === "mastered").length;

  // Group by tier
  const byTier: Record<number, Pattern[]> = { 1: [], 2: [], 3: [] };
  for (const p of patterns) {
    byTier[p.tier]?.push(p);
  }

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <h1 style={{ color: "#e2e8f0", fontSize: "1.6rem", fontWeight: "bold", margin: 0 }}>
            ♟ Tactics Curriculum
          </h1>
          <HelpModal title="How Drill Tactics Works">
            <HelpBulletList items={[
              "Choose a tactical pattern to focus on (Fork, Pin, Skewer, etc.)",
              "You'll work through up to 200 puzzles for that pattern, starting easy and getting progressively harder",
              "Your rating for that specific pattern updates as you solve puzzles",
              "Solve puzzles correctly to move up — miss them and they go into your Review queue",
              "The goal is to internalize each pattern until it becomes instinct",
              "Work one pattern at a time until you feel strong, then move to the next",
            ]} />
          </HelpModal>
        </div>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
          Master tactical patterns one by one — 200 puzzles per pattern, sorted from easiest to hardest.
        </p>

        {/* Overall progress bar */}
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
              Overall: <strong style={{ color: "#e2e8f0" }}>{totalCompleted.toLocaleString()} / {totalPossible.toLocaleString()}</strong> puzzles
            </span>
            <span style={{ color: "#4ade80", fontSize: "0.85rem" }}>
              🏆 {masteredCount} patterns mastered
            </span>
          </div>
          <div style={{ backgroundColor: "#0d1621", borderRadius: "6px", height: "10px", overflow: "hidden" }}>
            <div style={{
              width: `${totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0}%`,
              height: "100%",
              backgroundColor: "#2e75b6",
              borderRadius: "6px",
            }} />
          </div>
        </div>
      </div>

      {/* Pattern sections by tier — clean list, no lockout gates */}
      {[1, 2, 3].map((tier) => {
        const tierColors = TIER_COLORS[tier];
        const tierPatterns = byTier[tier];

        return (
          <div key={tier} style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <span style={{
                color: tierColors.accent,
                backgroundColor: tierColors.bg,
                border: `1px solid ${tierColors.border}`,
                borderRadius: "6px",
                padding: "0.3rem 0.75rem",
                fontSize: "0.8rem",
                fontWeight: "bold",
              }}>
                {tier === 1 ? "Tier 1 — Basic Tactics" : tier === 2 ? "Tier 2 — Intermediate" : "Tier 3 — Advanced"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
              {tierPatterns.map((p) => {
                const summary = summaries[p.name];
                return (
                  <CurriculumPatternCard
                    key={p.name}
                    pattern={p}
                    summary={summary}
                    onClick={() => {
                      const themeKey = getThemeKey(p.name);
                      router.push(`/app/patterns/${themeKey}`);
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

    </div>
  );
}
