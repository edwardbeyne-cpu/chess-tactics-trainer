"use client";

import { safeSetItem } from "@/lib/safe-storage";
import { useMemo, useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import patterns, { type Pattern } from "@/data/patterns";
import PuzzlePage from "@/components/Puzzle";
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
import { usePuzzleData } from "@/lib/puzzle-data";

// ── Sprint 33: localStorage flag for explainer dismissal ──────────────────
const DRILL_EXPLAINER_DISMISSED_KEY = "ctt_drill_explainer_dismissed";

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

// ── Sprint 33: Short display names for truncated patterns ─────────────────
const PATTERN_SHORT_NAME: Record<string, string> = {
  "Discovered Attack": "Discovery",
  "Back Rank Mate": "Back Rank",
  "Smothered Mate": "Smothered",
  "Double Check": "Dbl Check",
  "Queenside Attack": "Q-side Atk",
  "Kingside Attack": "K-side Atk",
  "Greek Gift Sacrifice": "Greek Gift",
  "Removing the Defender": "Rm Defender",
  "Perpetual Check": "Perpetual",
  "Queen Sacrifice": "Queen Sac",
  "Positional Sacrifice": "Pos. Sac",
  "Trapped Piece": "Trapped",
  "King March": "King March",
  "Discovered Check": "Disc. Check",
};

function getDisplayName(patternName: string): string {
  return PATTERN_SHORT_NAME[patternName] ?? patternName;
}

// ── Pattern Mastery Tier helpers (mirrors TrainingPlan.tsx) ──────────────

interface PatternMasteryTiers {
  beginner: number;
  intermediate: number;
  advanced: number;
  elite: number;
}

function getPatternMasteryTiers(): PatternMasteryTiers {
  if (typeof window === "undefined") return { beginner: 0, intermediate: 0, advanced: 0, elite: 0 };
  try {
    const raw = localStorage.getItem("ctt_pattern_ratings");
    if (!raw) return { beginner: 0, intermediate: 0, advanced: 0, elite: 0 };
    const ratings = JSON.parse(raw) as Record<string, { rating: number }>;
    const tiers: PatternMasteryTiers = { beginner: 0, intermediate: 0, advanced: 0, elite: 0 };
    for (const val of Object.values(ratings)) {
      const r = val.rating ?? 0;
      if (r >= 1800) tiers.elite++;
      else if (r >= 1400) tiers.advanced++;
      else if (r >= 1000) tiers.intermediate++;
      else tiers.beginner++;
    }
    return tiers;
  } catch {
    return { beginner: 0, intermediate: 0, advanced: 0, elite: 0 };
  }
}

function PatternMasteryTierDisplay() {
  const tiers = getPatternMasteryTiers();
  const items = [
    { label: "Beginner",     count: tiers.beginner,     color: "#94a3b8", dot: "#94a3b8" },
    { label: "Intermediate", count: tiers.intermediate, color: "#60a5fa", dot: "#60a5fa" },
    { label: "Advanced",     count: tiers.advanced,     color: "#a855f7", dot: "#a855f7" },
    { label: "Elite",        count: tiers.elite,        color: "#f59e0b", dot: "#f59e0b" },
  ];
  return (
    <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
      {items.map((tier) => (
        <div key={tier.label} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            backgroundColor: tier.dot, display: "inline-block", flexShrink: 0,
          }} />
          <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>{tier.label}</span>
          <span style={{ color: tier.color, fontWeight: "bold", fontSize: "0.88rem", marginLeft: "0.1rem" }}>{tier.count}</span>
        </div>
      ))}
    </div>
  );
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
  // Sprint 33: "Unstarted" uses muted blue instead of grey
  return "#3b5a7a";
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
  isRecommended = false,
}: {
  pattern: Pattern;
  summary: PatternCurriculumSummary;
  metStandard: number;
  timeStandard: number;
  onClick: () => void;
  isRecommended?: boolean;
}) {
  const colors = TIER_COLORS[pattern.tier];
  const progressPct = summary.totalPuzzles > 0
    ? Math.round((summary.completed / summary.totalPuzzles) * 100)
    : 0;

  const isMastered = summary.status === "mastered";
  // Sprint 33: Use short display name; title attr for full name
  const displayName = getDisplayName(pattern.name);

  const isFork = pattern.name === "Fork";
  
  return (
    <div
      onClick={onClick}
      title={pattern.name}
style={{
         backgroundColor: isRecommended ? "#1a0f1a" : "#1a1a2e",
         border: isRecommended ? "2px solid #f97316" : `1px solid ${isMastered ? colors.accent : "#2e3a5c"}`,
         borderRadius: "10px",
         padding: "0.9rem 1rem",
         cursor: "pointer",
         transition: "border-color 0.2s, background 0.15s",
         position: "relative",
         ...(isRecommended && {
           boxShadow: "0 0 12px rgba(249, 115, 22, 0.3), 0 0 0 1px rgba(249, 115, 22, 0.3)",
           animation: "glowPulse 2s infinite",
         }),
       }}
      onMouseEnter={(e) => { 
        e.currentTarget.style.borderColor = isRecommended ? "#f97316" : colors.accent; 
        e.currentTarget.style.backgroundColor = isRecommended ? "#241224" : "#1f2040"; 
      }}
      onMouseLeave={(e) => { 
        e.currentTarget.style.borderColor = isRecommended ? "#f97316" : (isMastered ? colors.accent : "#2e3a5c"); 
        e.currentTarget.style.backgroundColor = isRecommended ? "#1a0f1a" : "#1a1a2e"; 
      }}
    >
      {/* Recommended badge */}
      {isRecommended && (
        <div style={{
          position: "absolute",
          top: "-10px",
          right: "10px",
          backgroundColor: "#f97316",
          color: "white",
          fontSize: "0.65rem",
          fontWeight: "bold",
          padding: "0.2rem 0.5rem",
          borderRadius: "12px",
          border: "2px solid #0a1520",
          zIndex: 10,
          boxShadow: "0 2px 8px rgba(249, 115, 22, 0.4)",
        }}>
          🔥 Recommended
        </div>
      )}
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.5rem" }}>
        {/* Sprint 33: No emoji icon prefix — just the name */}
        <div
          style={{
            color: "#e2e8f0",
            fontWeight: "bold",
            fontSize: "0.88rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
          title={pattern.name}
        >
          {displayName}
        </div>
        <span style={{
          color: statusColor(summary.status),
          fontSize: "0.65rem",
          fontWeight: "bold",
          backgroundColor: `${statusColor(summary.status)}20`,
          border: `1px solid ${statusColor(summary.status)}50`,
          borderRadius: "4px",
          padding: "0.15rem 0.4rem",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          {statusLabel(summary.status)}
        </span>
      </div>

      {/* ELO + progress inline */}
      {/* Sprint 33: slightly larger + bolder puzzle count/accuracy */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
        <span style={{ color: colors.accent, fontSize: "1.35rem", fontWeight: "bold", lineHeight: 1 }}>
          {summary.patternRating.toLocaleString()}
        </span>
        <span style={{ color: "#94a3b8", fontSize: "0.78rem", fontWeight: 600 }}>
          {summary.completed}/{summary.totalPuzzles} · {progressPct}%
        </span>
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
  const puzzleData = usePuzzleData();

  // Sprint 40: Drill mode toggle
  const [drillMode, setDrillMode] = useState<"one" | "all">("one");
  const [drillAllStarted, setDrillAllStarted] = useState(false);

  // Sprint 12: Global Time Standard selector
  const [activeTimeStandard, setActiveTimeStandard] = useState<number>(0);
  // Tier display needs to be client-only (reads localStorage)
  const [mounted, setMounted] = useState(false);

  // Sprint 33: Explainer card dismissal
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load from settings on mount
    const settings = loadPuzzleSettings();
    setActiveTimeStandard(settings.timeStandard ?? 0);
    // Check if explainer was already dismissed
    const dismissed = localStorage.getItem(DRILL_EXPLAINER_DISMISSED_KEY);
    setShowExplainer(!dismissed);
  }, []);

  function handleDismissExplainer() {
    safeSetItem(DRILL_EXPLAINER_DISMISSED_KEY, "1");
    setShowExplainer(false);
  }

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
      const totalPuzzles = puzzleData?.PATTERN_PUZZLE_COUNTS[themeKey]
        ?? (puzzleData?.cachedPuzzlesByTheme[themeKey]?.length ?? 0);
      result[p.name] = getPatternCurriculumSummary(themeKey, totalPuzzles || 200);
    }
    return result;
  }, [puzzleData]);

  // Sprint 12: time standard stats per pattern
  const timeStatsByTheme = useMemo(() => {
    const stats = getPatternTimeStats();
    const map: Record<string, number> = {};
    for (const s of stats) { map[s.theme] = s.metStandard; }
    return map;
  }, []);

  const currentTimeStandard = activeTimeStandard > 0 ? activeTimeStandard : getTimeStandard();

  // Group by tier
  const byTier: Record<number, Pattern[]> = { 1: [], 2: [], 3: [] };
  for (const p of patterns) {
    byTier[p.tier]?.push(p);
  }

  return (
     <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
       {/* ACTION-FIRST: Ultra-prominent "Start with Fork" section - MOVED TO VERY TOP */}
       <div style={{
         backgroundColor: "#0a1520",
         border: "3px solid #f97316",
         borderRadius: "16px",
         padding: "1.75rem",
         marginBottom: "1.75rem",
         textAlign: "center",
         boxShadow: "0 4px 20px rgba(249, 115, 22, 0.15)",
       }}>
         <div style={{ 
           color: "#f97316", 
           fontSize: "1.3rem", 
           fontWeight: "800",
           marginBottom: "0.75rem",
           display: "flex",
           alignItems: "center",
           justifyContent: "center",
           gap: "0.75rem"
         }}>
           <span>🔥</span>
           <span>Recommended First Pattern</span>
         </div>
         <div style={{ 
           color: "#e2e8f0", 
           fontSize: "1.1rem", 
           fontWeight: "700",
           marginBottom: "0.5rem"
         }}>
           Start with <span style={{color: "#f97316"}}>Fork</span> — The Most Common Chess Tactic
         </div>
         <div style={{ 
           color: "#94a3b8", 
           fontSize: "0.9rem", 
           marginBottom: "1.5rem",
           lineHeight: 1.6,
           maxWidth: "500px",
           margin: "0 auto"
         }}>
           <strong>Fork</strong> attacks two pieces at once. It appears in 1 out of 4 tactical puzzles.
           Master this first to build your pattern recognition foundation.
         </div>
         <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
           <Link
             href="/app/puzzles?pattern=fork&index=1"
             style={{
               display: "inline-block",
               backgroundColor: "#f97316",
               color: "white",
               padding: "0.85rem 2rem",
               borderRadius: "10px",
               fontSize: "1rem",
               fontWeight: "700",
               textDecoration: "none",
               transition: "all 0.2s",
               boxShadow: "0 4px 12px rgba(249, 115, 22, 0.3)",
             }}
             onMouseEnter={e => {
               e.currentTarget.style.backgroundColor = "#ea580c";
               e.currentTarget.style.transform = "translateY(-2px)";
               e.currentTarget.style.boxShadow = "0 6px 20px rgba(249, 115, 22, 0.4)";
             }}
             onMouseLeave={e => {
               e.currentTarget.style.backgroundColor = "#f97316";
               e.currentTarget.style.transform = "translateY(0)";
               e.currentTarget.style.boxShadow = "0 4px 12px rgba(249, 115, 22, 0.3)";
             }}
           >
             Start with Fork →
           </Link>
           <div style={{ color: "#64748b", fontSize: "0.8rem", marginLeft: "0.5rem" }}>
             Or explore 27 other patterns below
           </div>
         </div>
       </div>

       {/* Sprint 40: Drill mode toggle — moved below the main CTA */}
       <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.75rem" }}>
         {(["one", "all"] as const).map((m) => {
           const isActive = drillMode === m;
           return (
             <button
               key={m}
               onClick={() => { setDrillMode(m); setDrillAllStarted(false); }}
               style={{
                 flex: 1,
                 backgroundColor: isActive ? "#16a34a" : "transparent",
                 color: isActive ? "white" : "#64748b",
                 border: `2px solid ${isActive ? "#16a34a" : "#2e3a5c"}`,
                 borderRadius: "999px",
                 padding: "0.65rem 1rem",
                 cursor: "pointer",
                 fontSize: "0.92rem",
                 fontWeight: isActive ? "bold" : "normal",
                 transition: "all 0.15s",
               }}
               onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.borderColor = "#4ade80"; e.currentTarget.style.color = "#94a3b8"; } }}
               onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.borderColor = "#2e3a5c"; e.currentTarget.style.color = "#64748b"; } }}
             >
               {m === "one" ? "Drill One Pattern" : "Drill All Patterns"}
             </button>
           );
         })}
       </div>

       {/* Sprint 40: Drill All Patterns mode */}
       {drillMode === "all" && (
         drillAllStarted ? (
           <Suspense fallback={<div style={{ color: "#94a3b8", padding: "3rem", textAlign: "center" }}>Loading puzzle...</div>}>
             <PuzzlePage defaultMode="drillAll" />
           </Suspense>
         ) : (
           <div style={{ textAlign: "center", padding: "3rem 1.5rem", backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "16px", marginBottom: "2rem" }}>
             <div style={{ color: "#e2e8f0", fontSize: "1.35rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
               5,600 puzzles. All 28 patterns. One session.
             </div>
             <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "2rem", maxWidth: "420px", margin: "0 auto 2rem", lineHeight: 1.6 }}>
               Puzzles start easy and get harder as you improve. Every correct solve counts toward that pattern&apos;s progress.
             </div>
             <button
               onClick={() => setDrillAllStarted(true)}
               style={{
                 backgroundColor: "#16a34a",
                 color: "white",
                 border: "none",
                 borderRadius: "10px",
                 padding: "0.85rem 2.5rem",
                 fontSize: "1.05rem",
                 fontWeight: "bold",
                 cursor: "pointer",
                 transition: "background 0.15s",
               }}
               onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#15803d"; }}
               onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#16a34a"; }}
             >
               Start Drilling →
             </button>
           </div>
         )
       )}

{/* Header + pattern grid — only shown in "Drill One Pattern" mode */}
        {drillMode === "one" && (<>
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ textAlign: "center", marginBottom: "0.75rem" }}>
            <h1 style={{ color: "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", margin: "0 0 0.4rem" }}>
              Drill Tactics
            </h1>
            <p style={{ color: "#94a3b8", fontSize: "0.92rem", margin: "0 auto 1.25rem", maxWidth: "540px", lineHeight: 1.6 }}>
              Choose a pattern to drill, or drill all 28 at random above.
            </p>
</div>

         {/* Sprint 12: Global Time Standard selector - MADE MORE SUBTLE */}
         <div style={{
           display: "flex",
           alignItems: "center",
           gap: "0.75rem",
           justifyContent: "center",
           marginBottom: showExplainer ? "0.75rem" : "1rem",
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

          {/* Sprint 33: Explainer card — collapsed by default, small expandable section */}
          {mounted && showExplainer && (
            <div style={{
              backgroundColor: "#13132b",
              border: "1px solid #334155",
              borderRadius: "8px",
              padding: "0.5rem 0.8rem",
              marginBottom: "1rem",
              position: "relative",
              cursor: "pointer",
            }}
            onClick={(e) => {
              // Don't expand if clicking the dismiss button
              if (!(e.target as HTMLElement).closest('button')) {
                const el = e.currentTarget;
                const isExpanded = el.getAttribute('data-expanded') === 'true';
                el.setAttribute('data-expanded', (!isExpanded).toString());
                el.style.padding = !isExpanded ? "0.8rem 1rem" : "0.5rem 0.8rem";
                const ul = el.querySelector('ul');
                if (ul) {
                  ul.style.display = !isExpanded ? "block" : "none";
                }
              }
            }}>
              <button
                onClick={handleDismissExplainer}
                aria-label="Dismiss"
                style={{
                  position: "absolute", top: "0.4rem", right: "0.4rem",
                  background: "none", border: "none", color: "#475569",
                  fontSize: "0.9rem", cursor: "pointer", lineHeight: 1, padding: "0.1rem",
                  zIndex: 2,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}
              >×</button>
              <div style={{ 
                color: "#64748b", 
                fontSize: "0.7rem", 
                textTransform: "uppercase", 
                letterSpacing: "0.08em", 
                marginBottom: "0.3rem",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem"
              }}>
                <span style={{ fontSize: "0.8rem", transition: "transform 0.2s" }}>▸</span>
                <span>How Drill Tactics Works</span>
              </div>
              <ul style={{ 
                margin: 0, 
                paddingLeft: "1rem", 
                color: "#94a3b8", 
                fontSize: "0.78rem", 
                lineHeight: 1.6, 
                display: "none",
                flexDirection: "column", 
                gap: "0.15rem" 
              }}>
                <li>Choose a tactical pattern to focus on (Fork, Pin, Skewer, etc.)</li>
                <li>Work through up to 200 puzzles per pattern, starting easy and getting harder</li>
                <li>Your rating for that specific pattern updates as you solve puzzles</li>
                <li>Missed puzzles go into your Review queue automatically</li>
                <li>Work one pattern at a time until it becomes instinct</li>
              </ul>
            </div>
          )

          }

          {/* Pattern mastery display - motivational onboarding when zero, progress when available */}
          {mounted && (() => {
            const tiers = getPatternMasteryTiers();
            const hasProgress = tiers.beginner > 0 || tiers.intermediate > 0 || tiers.advanced > 0 || tiers.elite > 0;
            
            if (hasProgress) {
              return (
                <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
                  <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
                    Pattern Mastery
                  </div>
                  <PatternMasteryTierDisplay />
                </div>
              );
            } else {
              // Motivational onboarding hook for new users
              return (
                <div style={{ 
                  backgroundColor: "#0d1621", 
                  border: "1px solid #2e75b6", 
                  borderRadius: "12px", 
                  padding: "1.25rem", 
                  marginBottom: "1.25rem",
                  textAlign: "center"
                }}>
                  <div style={{ color: "#2e75b6", fontSize: "1.5rem", marginBottom: "0.5rem" }}>🎯</div>
                  <div style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
                    Build Your Pattern Recognition
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.6, maxWidth: "500px", margin: "0 auto" }}>
                    Start with <strong style={{color: "#f97316"}}>Fork</strong> to unlock your first pattern rating. Each pattern you master moves you from Beginner → Intermediate → Advanced → Elite.
                  </div>
                </div>
              );
            }
          })()}
       </div>



      {/* Pattern sections by tier — clean list, no lockout gates */}
      {[1, 2, 3].map((tier) => {
        const tierColors = TIER_COLORS[tier];
        const tierPatterns = byTier[tier];

        return (
          <div key={tier} style={{ marginBottom: "2rem" }}>
            {/* Sprint 33: Group name without emoji prefix */}
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem" }}>
              {tierPatterns.map((p) => {
                const summary = summaries[p.name];
                const themeKey = getThemeKey(p.name);
                const isRecommended = p.name === "Fork";
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
                    isRecommended={isRecommended}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      </>)}

    </div>
  );
}
