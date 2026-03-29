"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import patterns, { type Pattern } from "@/data/patterns";
import { HelpModal, HelpBulletList } from "./HelpModal";
import {
  getPatternCurriculumSummary,
  getPatternTimeStats,
  getTimeStandard,
  saveTimeStandard,
  type PatternCurriculumSummary,
} from "@/lib/storage";
import {
  loadPuzzleSettings,
  savePuzzleSettings,
} from "@/components/PuzzleSettingsModal";
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
  metStandard,
  timeStandard,
  onClick,
}: {
  pattern: Pattern;
  summary: PatternCurriculumSummary;
  metStandard: number;
  timeStandard: number;
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
        borderRadius: "10px",
        padding: "0.9rem 1rem",
        cursor: "pointer",
        transition: "border-color 0.2s, background 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.accent; e.currentTarget.style.backgroundColor = "#1f2040"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = isMastered ? colors.accent : "#2e3a5c"; e.currentTarget.style.backgroundColor = "#1a1a2e"; }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>{pattern.icon}</span>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pattern.name}
          </div>
        </div>
        <span style={{
          color: statusColor(summary.status),
          fontSize: "0.65rem",
          fontWeight: "bold",
          backgroundColor: `${statusColor(summary.status)}15`,
          border: `1px solid ${statusColor(summary.status)}40`,
          borderRadius: "4px",
          padding: "0.15rem 0.4rem",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          {statusLabel(summary.status)}
        </span>
      </div>

      {/* ELO + progress inline */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
        <span style={{ color: colors.accent, fontSize: "1.35rem", fontWeight: "bold", lineHeight: 1 }}>
          {summary.patternRating.toLocaleString()}
        </span>
        <span style={{ color: "#64748b", fontSize: "0.72rem" }}>{summary.completed}/{summary.totalPuzzles} · {progressPct}%</span>
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

      {/* Time Standard Progress — Sprint 12 */}
      {summary.completed > 0 && (
        <div style={{ marginBottom: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
            <span style={{ color: "#94a3b8", fontSize: "0.72rem" }}>
              ⚡ Under {timeStandard}s: <strong style={{ color: metStandard > 0 ? "#a78bfa" : "#64748b" }}>{metStandard} / {summary.completed}</strong>
            </span>
            {metStandard > 0 && summary.completed > 0 && (
              <span style={{ color: "#a78bfa", fontSize: "0.68rem" }}>
                {Math.round((metStandard / summary.completed) * 100)}%
              </span>
            )}
          </div>
          {metStandard > 0 && summary.completed > 0 && (
            <div style={{ backgroundColor: "#0d1621", borderRadius: "4px", height: "4px", overflow: "hidden" }}>
              <div style={{
                width: `${Math.round((metStandard / summary.completed) * 100)}%`,
                height: "100%",
                backgroundColor: "#7c3aed",
                borderRadius: "4px",
                transition: "width 0.3s ease",
              }} />
            </div>
          )}
        </div>
      )}

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

  // Sprint 12: Global Time Standard selector
  const [activeTimeStandard, setActiveTimeStandard] = useState<number>(0);

  useEffect(() => {
    // Load from settings on mount
    const settings = loadPuzzleSettings();
    setActiveTimeStandard(settings.timeStandard ?? 0);
  }, []);

  function handleTimeStandardSelect(seconds: number) {
    setActiveTimeStandard(seconds);
    // Update ctt_puzzle_settings.timeStandard
    const settings = loadPuzzleSettings();
    settings.timeStandard = seconds;
    savePuzzleSettings(settings);
  }

  const timeStandardOptions = [
    { label: "No Limit", value: 0 },
    { label: "60s", value: 60 },
    { label: "30s", value: 30 },
    { label: "10s", value: 10 },
  ];

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

  // Sprint 12: time standard stats per pattern
  const timeStatsByTheme = useMemo(() => {
    const stats = getPatternTimeStats();
    const map: Record<string, number> = {};
    for (const s of stats) { map[s.theme] = s.metStandard; }
    return map;
  }, []);

  const currentTimeStandard = activeTimeStandard > 0 ? activeTimeStandard : getTimeStandard();



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
        <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
          <h1 style={{ color: "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", margin: "0 0 0.4rem" }}>
            Drill Tactics
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "0.92rem", margin: "0 auto 0.75rem", maxWidth: "540px", lineHeight: 1.6 }}>
            Master tactical patterns one by one — 200 puzzles per pattern, sorted from easiest to hardest
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>
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
        </div>

        {/* Sprint 12: Global Time Standard selector */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          justifyContent: "center",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}>
          <span style={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: "600" }}>Time Standard:</span>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {timeStandardOptions.map((opt) => {
              const isActive = activeTimeStandard === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleTimeStandardSelect(opt.value)}
                  style={{
                    backgroundColor: isActive ? "#2e75b6" : "#1a1a2e",
                    color: isActive ? "white" : "#64748b",
                    border: `1px solid ${isActive ? "#2e75b6" : "#2e3a5c"}`,
                    borderRadius: "20px",
                    padding: "0.35rem 0.9rem",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    fontWeight: isActive ? "bold" : "normal",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = "#4a7aac";
                      e.currentTarget.style.color = "#94a3b8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = "#2e3a5c";
                      e.currentTarget.style.color = "#64748b";
                    }
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0.75rem" }}>
              {tierPatterns.map((p) => {
                const summary = summaries[p.name];
                const themeKey = getThemeKey(p.name);
                return (
                  <CurriculumPatternCard
                    key={p.name}
                    pattern={p}
                    summary={summary}
                    metStandard={timeStatsByTheme[themeKey] ?? 0}
                    timeStandard={currentTimeStandard}
                    onClick={() => {
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
