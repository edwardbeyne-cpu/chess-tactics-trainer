"use client";

import { useMemo, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { HelpModal, HelpBulletList } from "./HelpModal";
import {
  getAttempts,
  getDuePuzzleIds,
  getSM2DuePuzzleIds,
  getTotalAttempts,
  getAllPatternStats,
  getStreakData,
  getUserSettings,
  getRatingData,
  fetchAndSaveRatings,
  shouldFetchRatings,
  getTacticsRatingData,
  fetchAndSavePlatformRatings,
  shouldFetchPlatformRatings,
  getDailyTargetSettings,
  getTodaySolvedCount,
  getSubscriptionTier,
  getNewAchievements,
  getActivityLog,
  getRatingSparkline,
  getRatingTrendThisWeek,
  getPuzzlesSolvedThisWeek,
  getPuzzlesSolvedAllTime,
  getReviewQueueCount,
  getReviewQueueThemes,
  getAllTimeHighRating,
  getPatternRatings,
  getPatternTimeStats,
  getTimeStandard,
  saveTimeStandard,
  type RatingSnapshot,
} from "@/lib/storage";
import { hasActiveSubscription } from "@/lib/trial";
import patterns from "@/data/patterns";

// Dynamically import recharts-based chart (avoids SSR issues)
const RatingHistoryChart = dynamic(() => import("./RatingHistoryChart"), { ssr: false });

// ── Color helpers ──────────────────────────────────────────────────────────

function getAccuracyColor(rate: number): string {
  if (rate >= 0.75) return "#4ade80"; // green — strong
  if (rate >= 0.5) return "#f59e0b";  // yellow — average
  return "#ef4444";                    // red — weak
}

function getAccuracyLabel(rate: number): string {
  if (rate >= 0.75) return "Strong";
  if (rate >= 0.5) return "Average";
  return "Weak";
}

function getAccuracyBg(rate: number): string {
  if (rate >= 0.75) return "#0a1f12";
  if (rate >= 0.5) return "#1a1200";
  return "#1f0a0a";
}

function getAccuracyBorder(rate: number): string {
  if (rate >= 0.75) return "#1a4a2a";
  if (rate >= 0.5) return "#4a3000";
  return "#4a1a1a";
}

// ── Section 1: Hero — Overall Tactics Rating ──────────────────────────────

function RatingHero() {
  const [data, setData] = useState(() => getTacticsRatingData());
  const [weekTrend, setWeekTrend] = useState(0);
  const sparkline = useMemo(() => getRatingSparkline(), []);

  useEffect(() => {
    const refresh = () => {
      setData(getTacticsRatingData());
      setWeekTrend(getRatingTrendThisWeek());
    };
    refresh();
    window.addEventListener("focus", refresh);
    const iv = setInterval(refresh, 15000);
    return () => { window.removeEventListener("focus", refresh); clearInterval(iv); };
  }, []);

  const trendColor = weekTrend >= 0 ? "#4ade80" : "#ef4444";
  const trendArrow = weekTrend >= 0 ? "↑" : "↓";
  const trendLabel = weekTrend >= 0 ? `+${weekTrend}` : String(weekTrend);

  // Build sparkline SVG
  const sparkW = 280;
  const sparkH = 60;
  let sparkPath = "";
  if (sparkline.length >= 2) {
    const ratings = sparkline.map((p) => p.rating);
    const minR = Math.min(...ratings) - 20;
    const maxR = Math.max(...ratings) + 20;
    const range = maxR - minR || 1;
    const pts = sparkline.map((p, i) => {
      const x = (i / (sparkline.length - 1)) * sparkW;
      const y = sparkH - ((p.rating - minR) / range) * sparkH;
      return `${x},${y}`;
    });
    sparkPath = pts.join(" ");
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, #0f1a2e 0%, #1a2a4e 100%)",
      border: "1px solid #2e3a5c",
      borderRadius: "16px",
      padding: "1.5rem 1.75rem",
      marginBottom: "1.25rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "1.5rem",
    }}>
      <div>
        <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.35rem" }}>
          Overall Tactics Rating
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ color: "#4ade80", fontSize: "4.5rem", fontWeight: "bold", lineHeight: 1 }}>
            {data.tacticsRating}
          </div>
          {weekTrend !== 0 && (
            <div style={{ color: trendColor, fontSize: "1.2rem", fontWeight: "bold" }}>
              {trendArrow} {trendLabel} this week
            </div>
          )}
          {weekTrend === 0 && data.totalPuzzlesRated > 0 && (
            <div style={{ color: "#334155", fontSize: "0.9rem" }}>
              No change this week
            </div>
          )}
        </div>
        {data.totalPuzzlesRated === 0 && (
          <div style={{ color: "#475569", fontSize: "0.82rem", marginTop: "0.4rem" }}>
            Solve puzzles to start earning your rating!
          </div>
        )}
        {data.totalPuzzlesRated > 0 && (
          <div style={{ color: "#334155", fontSize: "0.75rem", marginTop: "0.25rem" }}>
            {data.totalPuzzlesRated} rated puzzle{data.totalPuzzlesRated !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {sparkline.length >= 2 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
          <div style={{ color: "#334155", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            30-day trend
          </div>
          <svg width={sparkW} height={sparkH}>
            <polyline
              points={sparkPath}
              fill="none"
              stroke="#4ade80"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          {weekTrend !== 0 && (
            <div style={{ color: trendColor, fontSize: "0.78rem", fontWeight: "bold" }}>
              {trendArrow} {trendLabel} this week
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section 2: Weakness Breakdown ─────────────────────────────────────────

function WeaknessBreakdown() {
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewThemes, setReviewThemes] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => {
      setReviewCount(getReviewQueueCount());
      setReviewThemes(getReviewQueueThemes());
    };
    refresh();
    window.addEventListener("focus", refresh);
    const iv = setInterval(refresh, 15000);
    return () => { window.removeEventListener("focus", refresh); clearInterval(iv); };
  }, []);

  const worstPatterns = useMemo(() => {
    const stats = getAllPatternStats().filter((s) => s.totalAttempts >= 5);
    return [...stats].sort((a, b) => a.solveRate - b.solveRate).slice(0, 3);
  }, []);

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "12px",
      padding: "1.5rem",
      marginBottom: "1.5rem",
    }}>
      <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 0.3rem" }}>
        Weakness Breakdown
      </h2>
      <p style={{ color: "#64748b", fontSize: "0.78rem", margin: "0 0 1.25rem" }}>
        Your lowest accuracy patterns and puzzles still in your review queue
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Worst patterns */}
        <div>
          <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Worst 3 Patterns (by accuracy)
          </div>
          {worstPatterns.length === 0 ? (
            <div style={{ color: "#475569", fontSize: "0.85rem" }}>Solve at least 5 puzzles per pattern to see rankings.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {worstPatterns.map((p, i) => {
                const pct = Math.round(p.solveRate * 100);
                const patternName = patterns.find((pat) => pat.themes.some((t) => t === p.theme))?.name ?? p.theme;
                return (
                  <div key={p.theme} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    backgroundColor: getAccuracyBg(p.solveRate),
                    border: `1px solid ${getAccuracyBorder(p.solveRate)}`,
                    borderRadius: "8px",
                    padding: "0.6rem 0.75rem",
                  }}>
                    <span style={{ color: "#ef4444", fontWeight: "bold", fontSize: "1rem", width: "20px" }}>#{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#e2e8f0", fontSize: "0.85rem", fontWeight: "bold" }}>{patternName}</div>
                      <div style={{ color: "#64748b", fontSize: "0.72rem" }}>{p.totalAttempts} attempts</div>
                    </div>
                    <span style={{ color: getAccuracyColor(p.solveRate), fontWeight: "bold", fontSize: "0.9rem" }}>
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Review queue */}
        <div>
          <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Review Queue
          </div>
          <div style={{
            backgroundColor: reviewCount > 0 ? "#1a1200" : "#0a1f12",
            border: `1px solid ${reviewCount > 0 ? "#4a3000" : "#1a4a2a"}`,
            borderRadius: "10px",
            padding: "1rem",
            marginBottom: "0.75rem",
          }}>
            <div style={{ color: reviewCount > 0 ? "#f59e0b" : "#4ade80", fontSize: "2.5rem", fontWeight: "bold", lineHeight: 1 }}>
              {reviewCount}
            </div>
            <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginTop: "0.25rem" }}>
              {reviewCount === 0 ? "All caught up! 🎉" : `puzzle${reviewCount !== 1 ? "s" : ""} to review`}
            </div>
          </div>
          {reviewThemes.length > 0 && (
            <div>
              <div style={{ color: "#64748b", fontSize: "0.72rem", marginBottom: "0.4rem" }}>From patterns:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                {reviewThemes.slice(0, 6).map((t) => (
                  <span key={t} style={{
                    backgroundColor: "#1f0a0a",
                    border: "1px solid #4a1a1a",
                    borderRadius: "5px",
                    padding: "0.15rem 0.5rem",
                    fontSize: "0.68rem",
                    color: "#ef4444",
                  }}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
          )}
          {reviewCount > 0 && (
            <Link href="/app/review" style={{
              display: "block",
              marginTop: "0.75rem",
              backgroundColor: "#2e75b6",
              color: "white",
              textDecoration: "none",
              padding: "0.5rem 1rem",
              borderRadius: "7px",
              fontSize: "0.82rem",
              fontWeight: "bold",
              textAlign: "center",
            }}>
              Clear review queue →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section 3: Pattern Ratings Grid ───────────────────────────────────────

function PatternRatingsGrid() {
  const patternStats = useMemo(() => getAllPatternStats(), []);
  const patternRatings = useMemo(() => getPatternRatings(), []);

  // Map theme → stat
  const statsByTheme = useMemo(() => {
    const m: Record<string, typeof patternStats[0]> = {};
    for (const s of patternStats) m[s.theme] = s;
    return m;
  }, [patternStats]);

  // 17 core patterns (Tier 1 + Tier 2, first theme of each)
  const corePatterns = patterns.slice(0, 17);

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "12px",
      padding: "1.5rem",
      marginBottom: "1.5rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 0.25rem" }}>
            Pattern Ratings
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.78rem", margin: 0 }}>
            Your ELO rating and accuracy for each of the 17 tactical patterns
          </p>
        </div>
        <span style={{ color: "#475569", fontSize: "0.75rem" }}>17 patterns</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.5rem" }}>
        {corePatterns.map((p) => {
          const themeKey = p.themes[0];
          const stat = statsByTheme[themeKey];
          const pr = patternRatings[themeKey];
          const rating = pr?.rating ?? 800;
          const accuracy = stat ? Math.round(stat.solveRate * 100) : null;
          const progress = stat?.totalAttempts ?? 0;
          const color = stat ? getAccuracyColor(stat.solveRate) : "#334155";
          const bg = stat ? getAccuracyBg(stat.solveRate) : "#0d1621";
          const border = stat ? getAccuracyBorder(stat.solveRate) : "#1e2a3a";

          return (
            <div key={themeKey} style={{
              backgroundColor: bg,
              border: `1px solid ${border}`,
              borderRadius: "8px",
              padding: "0.65rem 0.75rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.3rem" }}>
                <span style={{ fontSize: "1rem" }}>{p.icon}</span>
                <span style={{ color: "#cbd5e1", fontSize: "0.78rem", fontWeight: "600" }}>{p.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.3rem" }}>
                <span style={{ color: color, fontSize: "1.25rem", fontWeight: "bold", lineHeight: 1 }}>{rating}</span>
                {accuracy !== null && (
                  <span style={{ color, fontSize: "0.72rem", fontWeight: "600" }}>{accuracy}%</span>
                )}
              </div>
              {/* Progress bar */}
              <div style={{ backgroundColor: "#0d1621", borderRadius: "3px", height: "4px", overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(100, (progress / 200) * 100)}%`,
                  height: "100%",
                  backgroundColor: color,
                  borderRadius: "3px",
                }} />
              </div>
              <div style={{ color: "#334155", fontSize: "0.62rem", marginTop: "0.2rem" }}>
                {progress}/200
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sprint 12: Time Standard Progress ─────────────────────────────────────

const PATTERN_THEME_KEY_MAP: Record<string, string> = {
  "Fork": "fork", "Pin": "pin", "Skewer": "skewer",
  "Discovered Attack": "discoveredAttack", "Back Rank Mate": "backRankMate",
  "Smothered Mate": "smotheredMate", "Double Check": "doubleCheck",
  "Overloading": "overloading", "Deflection": "deflection",
  "Interference": "interference", "Zugzwang": "zugzwang",
  "Attraction": "attraction", "Clearance": "clearance",
  "Trapped Piece": "trappedPiece", "Discovered Check": "discoveredCheck",
  "Kingside Attack": "kingsideAttack", "Queenside Attack": "queensideAttack",
};

function TimeStandardProgress() {
  const [timeStandard, setTimeStandard] = useState(30);
  const [editingStandard, setEditingStandard] = useState(false);
  const [draftStandard, setDraftStandard] = useState(30);

  useEffect(() => {
    const s = getTimeStandard();
    setTimeStandard(s);
    setDraftStandard(s);
  }, []);

  // Get time stats per pattern
  const timeStats = useMemo(() => getPatternTimeStats(), []);
  const statsByTheme: Record<string, { solved: number; metStandard: number; total: number }> = {};
  for (const s of timeStats) statsByTheme[s.theme] = s;

  // Build rows: only patterns with at least 1 attempt
  const rows = patterns
    .map((p) => {
      const themeKey = PATTERN_THEME_KEY_MAP[p.name] ?? p.name.toLowerCase();
      const s = statsByTheme[themeKey] ?? { solved: 0, metStandard: 0, total: 0 };
      const pct = s.solved > 0 ? Math.round((s.metStandard / s.solved) * 100) : 0;
      const readyToChallenge = s.solved === s.total && s.total > 0 && s.metStandard < s.solved;
      return { name: p.name, themeKey, ...s, pct, readyToChallenge };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => a.pct - b.pct); // worst first

  if (rows.length === 0) return null;

  function handleSaveStandard() {
    const clamped = Math.max(5, Math.min(draftStandard, 300));
    saveTimeStandard(clamped);
    setTimeStandard(clamped);
    setEditingStandard(false);
  }

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "12px",
      padding: "1.5rem",
      marginBottom: "1.5rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 0.25rem" }}>
            Time Standard Progress
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.78rem", margin: 0 }}>
            Track how many puzzles you&apos;ve solved under your time target — raise the bar as you improve
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>Standard:</span>
          {editingStandard ? (
            <>
              <input
                type="number"
                value={draftStandard}
                onChange={(e) => setDraftStandard(parseInt(e.target.value) || 30)}
                min={5} max={300} step={5}
                style={{
                  width: "60px",
                  backgroundColor: "#0f1621",
                  border: "1px solid #2e75b6",
                  borderRadius: "6px",
                  color: "#e2e8f0",
                  fontSize: "0.85rem",
                  padding: "0.2rem 0.4rem",
                }}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveStandard()}
              />
              <button onClick={handleSaveStandard} style={{
                backgroundColor: "#2e75b6", color: "white", border: "none",
                borderRadius: "6px", padding: "0.25rem 0.5rem", cursor: "pointer", fontSize: "0.78rem",
              }}>Save</button>
              <button onClick={() => setEditingStandard(false)} style={{
                backgroundColor: "transparent", color: "#64748b", border: "1px solid #2e3a5c",
                borderRadius: "6px", padding: "0.25rem 0.5rem", cursor: "pointer", fontSize: "0.78rem",
              }}>Cancel</button>
            </>
          ) : (
            <>
              <span style={{
                color: "#a78bfa", fontWeight: "bold", fontSize: "0.9rem",
                backgroundColor: "#1a0d2e", border: "1px solid #7c3aed",
                borderRadius: "6px", padding: "0.2rem 0.5rem",
              }}>{timeStandard}s</span>
              <button onClick={() => { setDraftStandard(timeStandard); setEditingStandard(true); }} style={{
                backgroundColor: "transparent", color: "#94a3b8", border: "1px solid #2e3a5c",
                borderRadius: "6px", padding: "0.2rem 0.5rem", cursor: "pointer", fontSize: "0.72rem",
              }}>✏️ Edit</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "0.4rem 1rem", alignItems: "center" }}>
        {/* Header */}
        <div style={{ color: "#475569", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pattern</div>
        <div style={{ color: "#475569", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>Solved</div>
        <div style={{ color: "#475569", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>Met Standard</div>
        <div style={{ color: "#475569", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>%</div>

        {rows.map((r) => (
          <>
            <div key={`name-${r.themeKey}`} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ color: "#e2e8f0", fontSize: "0.82rem" }}>{r.name}</span>
              {r.readyToChallenge && (
                <span title="100% solved but not all met standard — ready to challenge!" style={{
                  fontSize: "0.65rem", color: "#a78bfa",
                  backgroundColor: "#1a0d2e", border: "1px solid #7c3aed",
                  borderRadius: "4px", padding: "0.1rem 0.3rem",
                }}>⚡ Challenge</span>
              )}
            </div>
            <div key={`solved-${r.themeKey}`} style={{ color: "#94a3b8", fontSize: "0.82rem", textAlign: "right" }}>{r.solved}/{r.total}</div>
            <div key={`met-${r.themeKey}`} style={{ color: r.metStandard > 0 ? "#a78bfa" : "#475569", fontSize: "0.82rem", textAlign: "right" }}>{r.metStandard}</div>
            <div key={`pct-${r.themeKey}`} style={{
              color: r.pct >= 80 ? "#4ade80" : r.pct >= 50 ? "#f59e0b" : r.pct > 0 ? "#ef4444" : "#475569",
              fontSize: "0.82rem", fontWeight: "bold", textAlign: "right",
            }}>{r.solved > 0 ? `${r.pct}%` : "—"}</div>
          </>
        ))}
      </div>
    </div>
  );
}

// ── Section 4: Activity Stats ──────────────────────────────────────────────

function ActivityCalendar30() {
  const days = useMemo(() => {
    const activityLog = getActivityLog();
    const logSet = new Set(activityLog);

    // Also backfill from existing attempts for users who don't have the log yet
    const attempts = getAttempts();
    attempts.forEach((a) => logSet.add(a.timestamp.slice(0, 10)));
    try {
      const sm2 = JSON.parse(localStorage.getItem("ctt_sm2_attempts") || "[]") as { timestamp: string }[];
      sm2.forEach((a) => logSet.add(a.timestamp.slice(0, 10)));
    } catch { /* ignore */ }

    const today = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (29 - i));
      const key = date.toISOString().slice(0, 10);
      const isToday = key === today.toISOString().slice(0, 10);
      return {
        date,
        active: logSet.has(key),
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        isToday,
      };
    });
  }, []);

  const activeDays = days.filter((d) => d.active).length;

  return (
    <div>
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {days.map((day, i) => (
          <div
            key={i}
            title={`${day.label}: ${day.active ? "Practiced ✓" : "No activity"}`}
            style={{
              width: "28px", height: "28px", borderRadius: "5px",
              backgroundColor: day.active ? "#4ade80" : "#0d1621",
              border: day.isToday ? "2px solid #4ade80" : "1px solid rgba(255,255,255,0.04)",
              flexShrink: 0,
              cursor: "default",
              opacity: day.active ? 1 : 0.5,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.75rem", fontSize: "0.72rem", color: "#64748b" }}>
        <span>{activeDays}/30 days active</span>
        <span>
          <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: "#4ade80", borderRadius: "2px", marginRight: "4px" }} />
          Practiced
          <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: "#0d1621", borderRadius: "2px", marginRight: "4px", marginLeft: "8px", border: "1px solid #2e3a5c" }} />
          Missed
        </span>
      </div>
    </div>
  );
}

function ActivityStats() {
  const [solvedToday, setSolvedToday] = useState(0);
  const [solvedWeek, setSolvedWeek] = useState(0);
  const [solvedAllTime, setSolvedAllTime] = useState(0);
  const [allTimeHigh, setAllTimeHigh] = useState(800);
  const streakData = useMemo(() => getStreakData(), []);

  useEffect(() => {
    const refresh = () => {
      setSolvedToday(getTodaySolvedCount());
      setSolvedWeek(getPuzzlesSolvedThisWeek());
      setSolvedAllTime(getPuzzlesSolvedAllTime());
      setAllTimeHigh(getAllTimeHighRating());
    };
    refresh();
  }, []);

  const stats = [
    { label: "Today", value: solvedToday, icon: "📅" },
    { label: "This week", value: solvedWeek, icon: "📊" },
    { label: "All time", value: solvedAllTime, icon: "♟" },
  ];

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "12px",
      padding: "1.5rem",
      marginBottom: "1.5rem",
    }}>
      <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 0.3rem" }}>
        Activity &amp; Streak
      </h2>
      <p style={{ color: "#64748b", fontSize: "0.78rem", margin: "0 0 1.25rem" }}>
        Your training consistency and daily habit
      </p>

      {/* Puzzles solved — bigger numbers, tighter cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.6rem", marginBottom: "1rem" }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            backgroundColor: "#111827",
            border: "1px solid #1e2a3a",
            borderRadius: "8px",
            padding: "0.75rem 0.5rem",
            textAlign: "center",
          }}>
            <div style={{ color: "#4ade80", fontSize: "2rem", fontWeight: "bold", lineHeight: 1 }}>{s.value}</div>
            <div style={{ color: "#475569", fontSize: "0.68rem", marginTop: "0.3rem" }}>{s.icon} {s.label}</div>
          </div>
        ))}
      </div>

      {/* Streak + personal best */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "1rem" }}>
        <div style={{
          backgroundColor: "#111827", border: "1px solid #1e2a3a",
          borderRadius: "8px", padding: "0.75rem",
        }}>
          <div style={{ color: "#f59e0b", fontSize: "2rem", fontWeight: "bold", lineHeight: 1 }}>
            {streakData.currentStreak}
          </div>
          <div style={{ color: "#64748b", fontSize: "0.68rem", marginTop: "0.3rem" }}>🔥 Day streak</div>
          <div style={{ color: "#334155", fontSize: "0.65rem", marginTop: "0.15rem" }}>
            Best: {streakData.longestStreak}d
          </div>
        </div>
        <div style={{
          backgroundColor: "#111827", border: "1px solid #1e2a3a",
          borderRadius: "8px", padding: "0.75rem",
        }}>
          <div style={{ color: "#4ade80", fontSize: "2rem", fontWeight: "bold", lineHeight: 1 }}>
            {allTimeHigh}
          </div>
          <div style={{ color: "#64748b", fontSize: "0.68rem", marginTop: "0.3rem" }}>🥇 Personal best</div>
          <div style={{ color: "#334155", fontSize: "0.65rem", marginTop: "0.15rem" }}>All-time high</div>
        </div>
      </div>

      {/* 30-day habit tracker */}
      <div>
        <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
          30-Day Practice Habit
        </div>
        <ActivityCalendar30 />
      </div>
    </div>
  );
}

// ── Section 5: Achievements ────────────────────────────────────────────────

function AchievementsSection() {
  const achievements = useMemo(() => getNewAchievements(), []);
  const earned = useMemo(() => achievements.filter((a) => a.earned).sort((a, b) => {
    // Most recently earned first
    if (!a.earnedDate) return 1;
    if (!b.earnedDate) return -1;
    return b.earnedDate.localeCompare(a.earnedDate);
  }), [achievements]);
  const [expanded, setExpanded] = useState(false);

  const displayed = expanded ? earned : earned.slice(0, 6);

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "12px",
      padding: "1.5rem",
      marginBottom: "1.5rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 0.25rem" }}>
            Achievements
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.78rem", margin: 0 }}>
            Milestones earned through improvement and consistency
          </p>
        </div>
        <span style={{ color: "#ffd700", fontSize: "0.85rem" }}>
          {earned.length} / {achievements.length} earned
        </span>
      </div>

      {earned.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.5rem 0", color: "#475569" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎯</div>
          <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>No achievements yet</div>
          <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: "0.35rem" }}>
            Solve puzzles to start earning badges
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
            {displayed.map((ach) => (
              <div key={ach.id} style={{
                backgroundColor: "#0a1f12",
                border: "1px solid #ffd70040",
                borderRadius: "8px",
                padding: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
              }}>
                <span style={{ fontSize: "1.8rem" }}>{ach.icon}</span>
                <div>
                  <div style={{ color: "#ffd700", fontWeight: "bold", fontSize: "0.85rem" }}>{ach.name}</div>
                  <div style={{ color: "#64748b", fontSize: "0.7rem", lineHeight: 1.4 }}>{ach.description}</div>
                  {ach.earnedDate && (
                    <div style={{ color: "#475569", fontSize: "0.65rem", marginTop: "0.2rem" }}>
                      {new Date(ach.earnedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {earned.length > 6 && (
            <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
              <button
                onClick={() => setExpanded((e) => !e)}
                style={{
                  background: "none",
                  border: "1px solid #2e3a5c",
                  borderRadius: "6px",
                  color: "#64748b",
                  padding: "0.4rem 1rem",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                }}
              >
                {expanded ? "Show less ▲" : `See all ${earned.length} achievements ▼`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Locked previews (subtle) */}
      {achievements.length - earned.length > 0 && (
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #1e2a3a" }}>
          <div style={{ color: "#475569", fontSize: "0.72rem", marginBottom: "0.5rem" }}>
            🔒 {achievements.length - earned.length} achievements locked
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {achievements.filter((a) => !a.earned).slice(0, 8).map((a) => (
              <div key={a.id} style={{
                backgroundColor: "#0d1621",
                border: "1px solid #1e2a3a",
                borderRadius: "6px",
                padding: "0.3rem 0.5rem",
                fontSize: "0.68rem",
                color: "#475569",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                opacity: 0.6,
              }}>
                <span style={{ filter: "grayscale(100%)" }}>{a.icon}</span>
                <span>{a.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Platform Ratings Panel (carry-over from old dashboard) ─────────────────

function RatingTrackingPanel() {
  const [ratingData, setRatingData] = useState(() => getRatingData());
  const settings = useMemo(() => getUserSettings(), []);

  useEffect(() => {
    if ((settings.chesscomUsername || settings.lichessUsername) && shouldFetchRatings()) {
      fetchAndSaveRatings().then(() => setRatingData(getRatingData()));
    }
    if ((settings.trackChesscom || settings.trackLichess) && shouldFetchPlatformRatings()) {
      fetchAndSavePlatformRatings();
    }
  }, [settings]);

  const hasChesscom = (settings.trackChesscom && !!settings.chesscomUsername) || (!settings.trackChesscom && !!settings.chesscomUsername);
  const hasLichess = (settings.trackLichess && !!settings.lichessUsername) || (!settings.trackLichess && !!settings.lichessUsername);
  if (!hasChesscom && !hasLichess) return null;

  const snapshots = ratingData.snapshots;
  if (snapshots.length === 0) return null;

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "12px",
      padding: "1.5rem",
      marginBottom: "1.5rem",
    }}>
      <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 1rem" }}>
        Platform Ratings
      </h2>
      {hasChesscom && (
        <div style={{ marginBottom: "0.5rem" }}>
          <div style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", marginBottom: "0.25rem" }}>Chess.com</div>
          {["blitz", "rapid"].map((k) => {
            const latest = snapshots.slice(-1)[0]?.chesscom?.[k as "blitz" | "rapid"];
            return latest ? (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", backgroundColor: "#162030", borderRadius: "6px", padding: "0.4rem 0.75rem", marginBottom: "0.25rem" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "capitalize" }}>{k}</span>
                <span style={{ color: "#f59e0b", fontWeight: "bold" }}>{latest}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
      {hasLichess && (
        <div>
          <div style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", marginBottom: "0.25rem" }}>Lichess</div>
          {["blitz", "rapid"].map((k) => {
            const latest = snapshots.slice(-1)[0]?.lichess?.[k as "blitz" | "rapid"];
            return latest ? (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", backgroundColor: "#162030", borderRadius: "6px", padding: "0.4rem 0.75rem", marginBottom: "0.25rem" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "capitalize" }}>{k}</span>
                <span style={{ color: "#60a5fa", fontWeight: "bold" }}>{latest}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function Dashboard() {
  // Handle Stripe checkout success callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId) {
      localStorage.setItem("subscription_status", "active");
      const url = new URL(window.location.href);
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Page header with help button */}
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", margin: "0 0 0.4rem" }}>
          Data
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.92rem", margin: "0 auto 0.75rem", maxWidth: "540px", lineHeight: 1.6 }}>
          Track your ratings, patterns, activity, and progress — everything you need to train smarter
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <HelpModal title="How to Read Your Data">
            <HelpBulletList items={[
              "Your overall tactics rating is your headline number — focus on growing it over time",
              "The weakness breakdown shows your worst patterns — those are where to focus your Drill Tactics sessions",
              "Pattern cards show your rating, accuracy, and progress per pattern — green is strong, red needs work",
              "The 30-day habit tracker shows your consistency — daily practice compounds faster than occasional long sessions",
              "Achievements unlock automatically as you hit milestones",
            ]} />
          </HelpModal>
        </div>
      </div>

      {/* Hero — Overall Tactics Rating */}
      <RatingHero />

      {/* Weakness Breakdown */}
      <WeaknessBreakdown />

      {/* Sprint 12: Time Standard Progress */}
      <TimeStandardProgress />

      {/* Pattern Ratings Grid */}
      <PatternRatingsGrid />

      {/* Activity Stats */}
      <ActivityStats />

      {/* Platform ratings if tracked */}
      <RatingTrackingPanel />

      {/* Rating history chart */}
      <div style={{ marginBottom: "1.5rem" }}>
        <RatingHistoryChart />
      </div>

      {/* Weekly report link for Serious tier */}
      {getSubscriptionTier() >= 2 && (
        <div style={{
          backgroundColor: "#0a1f12",
          border: "1px solid #1a4a2a",
          borderRadius: "12px",
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}>
          <div>
            <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.9rem" }}>📧 Weekly Report</div>
            <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.15rem" }}>Preview your email digest</div>
          </div>
          <Link
            href="/app/weekly-report"
            style={{
              backgroundColor: "#4ade80",
              color: "#0f0f1a",
              padding: "0.4rem 0.85rem",
              borderRadius: "6px",
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: "0.8rem",
              whiteSpace: "nowrap",
            }}
          >
            Preview →
          </Link>
        </div>
      )}

      {/* Achievements — bottom */}
      <AchievementsSection />
    </div>
  );
}
