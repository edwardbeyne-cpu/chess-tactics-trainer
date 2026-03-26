"use client";

import { useMemo, useEffect, useState } from "react";
import {
  getAttempts,
  getDuePuzzleIds,
  getSM2DuePuzzleIds,
  getTotalAttempts,
  getWeakestPattern,
  getAllPatternStats,
  getXPData,
  getLevelFromXP,
  getLevelName,
  getXPThresholdForLevel,
  getStreakData,
  getDailyQuests,
  getUserSettings,
  getRatingData,
  fetchAndSaveRatings,
  shouldFetchRatings,
  type DailyQuests,
  type Quest,
  type RatingSnapshot,
} from "@/lib/storage";

function getActivityColor(count: number): string {
  if (count === 0) return "#0d1621";
  if (count < 4) return "#1e4a8a";
  if (count < 8) return "#2e75b6";
  if (count < 13) return "#3d9fd4";
  return "#4ade80";
}

function ActivityCalendar() {
  const days = useMemo(() => {
    const attempts = getAttempts();
    const countByDate: Record<string, number> = {};
    attempts.forEach((a) => {
      const key = a.timestamp.slice(0, 10);
      countByDate[key] = (countByDate[key] || 0) + 1;
    });

    const sm2Attempts = typeof window !== "undefined"
      ? (() => {
          try {
            return JSON.parse(localStorage.getItem("ctt_sm2_attempts") || "[]") as { timestamp: string }[];
          } catch { return []; }
        })()
      : [];

    sm2Attempts.forEach((a) => {
      const key = a.timestamp.slice(0, 10);
      countByDate[key] = (countByDate[key] || 0) + 1;
    });

    const today = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (29 - i));
      const key = date.toISOString().slice(0, 10);
      return {
        date,
        count: countByDate[key] || 0,
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    });
  }, []);

  const totalPuzzles = days.reduce((sum, d) => sum + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;

  return (
    <div>
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {days.map((day, i) => (
          <div
            key={i}
            title={`${day.label}: ${day.count} puzzle${day.count !== 1 ? "s" : ""}`}
            style={{
              width: "30px", height: "30px", borderRadius: "5px",
              backgroundColor: getActivityColor(day.count),
              border: "1px solid rgba(255,255,255,0.04)",
              cursor: "default", flexShrink: 0,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "0.75rem", fontSize: "0.72rem", color: "#64748b" }}>
        <span>Less</span>
        {[0, 3, 7, 12, 15].map((n, i) => (
          <div key={i} style={{ width: "14px", height: "14px", borderRadius: "3px", backgroundColor: getActivityColor(n), border: "1px solid rgba(255,255,255,0.06)" }} />
        ))}
        <span>More</span>
        <span style={{ marginLeft: "auto", color: "#94a3b8" }}>
          {totalPuzzles} puzzles across {activeDays} active days
        </span>
      </div>
    </div>
  );
}

// ── XP Progress Bar ────────────────────────────────────────────────────────

function XPBar() {
  const xpData = useMemo(() => getXPData(), []);
  const level = xpData.level;
  const totalXP = xpData.totalXP;
  const levelName = getLevelName(level);
  const currentThreshold = getXPThresholdForLevel(level);
  const nextThreshold = getXPThresholdForLevel(level + 1);
  const xpInLevel = totalXP - currentThreshold;
  const xpNeeded = nextThreshold - currentThreshold;
  const progressPct = Math.min(100, Math.floor((xpInLevel / xpNeeded) * 100));

  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <div>
          <span style={{ color: "#ffd700", fontWeight: "bold", fontSize: "1rem" }}>
            ⭐ Level {level} — {levelName}
          </span>
        </div>
        <span style={{ color: "#64748b", fontSize: "0.8rem" }}>{totalXP} XP total</span>
      </div>
      <div style={{ backgroundColor: "#0d1621", borderRadius: "6px", height: "10px", overflow: "hidden", marginBottom: "0.4rem" }}>
        <div style={{
          width: `${progressPct}%`, height: "100%",
          background: "linear-gradient(90deg, #4ade80, #22d3ee)",
          borderRadius: "6px", transition: "width 0.5s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#475569" }}>
        <span>{xpInLevel} / {xpNeeded} XP</span>
        <span>{xpNeeded - xpInLevel} XP to Level {level + 1} ({getLevelName(level + 1)})</span>
      </div>
    </div>
  );
}

// ── Daily Quests Panel ─────────────────────────────────────────────────────

function DailyQuestsPanel() {
  const [quests, setQuests] = useState<DailyQuests | null>(null);

  useEffect(() => {
    setQuests(getDailyQuests());
    // Refresh quests when window gets focus (in case puzzles were solved)
    const handler = () => setQuests(getDailyQuests());
    window.addEventListener("focus", handler);
    const interval = setInterval(() => setQuests(getDailyQuests()), 10000);
    return () => { window.removeEventListener("focus", handler); clearInterval(interval); };
  }, []);

  if (!quests) return null;

  const allDone = quests.quests.every((q) => q.completed);

  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "bold", margin: 0 }}>⚔️ Daily Quests</h2>
        {allDone && (
          <span style={{ backgroundColor: "#0a1f12", color: "#4ade80", border: "1px solid #1a4a2a", borderRadius: "6px", padding: "0.2rem 0.6rem", fontSize: "0.7rem", fontWeight: "bold" }}>
            ALL COMPLETE +200 XP 🎉
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {quests.quests.map((quest: Quest) => (
          <QuestRow key={quest.id} quest={quest} />
        ))}
      </div>
      <div style={{ marginTop: "0.75rem", color: "#475569", fontSize: "0.72rem" }}>
        Resets at midnight · 50 XP per quest · 200 XP bonus for all 3
      </div>
    </div>
  );
}

function QuestRow({ quest }: { quest: Quest }) {
  const pct = Math.min(100, Math.floor((quest.progress / quest.target) * 100));
  return (
    <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {quest.completed ? (
            <span style={{ color: "#4ade80" }}>✅</span>
          ) : (
            <span style={{ color: "#64748b" }}>○</span>
          )}
          <span style={{ color: quest.completed ? "#4ade80" : "#e2e8f0", fontSize: "0.82rem" }}>
            {quest.description}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ color: "#94a3b8", fontSize: "0.72rem" }}>
            {quest.progress}/{quest.target}
          </span>
          <span style={{ color: "#ffd700", fontSize: "0.72rem" }}>+{quest.xpReward} XP</span>
        </div>
      </div>
      <div style={{ backgroundColor: "#0d1621", borderRadius: "4px", height: "4px", overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          backgroundColor: quest.completed ? "#4ade80" : "#2e75b6",
          borderRadius: "4px", transition: "width 0.3s",
        }} />
      </div>
    </div>
  );
}

// ── Streak Card ────────────────────────────────────────────────────────────

function StreakCard({ streak, freezes }: { streak: number; freezes: number }) {
  const streakData = useMemo(() => getStreakData(), []);

  const milestoneEmojis: Record<number, string> = {
    7: "🔥",
    30: "⚡",
    100: "💫",
    365: "👑",
  };

  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <div>
          <div style={{ color: "#f59e0b", fontSize: "1.75rem", fontWeight: "bold", lineHeight: 1 }}>
            🔥 {streak}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "0.25rem" }}>Day Streak</div>
        </div>
        {freezes > 0 && (
          <div style={{ backgroundColor: "#0a1525", border: "1px solid #1e3a5c", borderRadius: "8px", padding: "0.5rem 0.75rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.1rem" }}>🧊</div>
            <div style={{ color: "#60a5fa", fontSize: "0.7rem", fontWeight: "bold" }}>{freezes} freeze{freezes !== 1 ? "s" : ""}</div>
          </div>
        )}
      </div>
      {freezes === 0 && (
        <div style={{ color: "#475569", fontSize: "0.72rem", marginBottom: "0.5rem" }}>
          Complete a 7-day streak to earn a freeze
        </div>
      )}
      {/* Milestone badges */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {[7, 30, 100, 365].map((m) => {
          const earned = streakData.milestonesEarned.includes(m);
          return (
            <div
              key={m}
              style={{
                backgroundColor: earned ? "#0a1f12" : "#0d1621",
                border: `1px solid ${earned ? "#1a4a2a" : "#2e3a5c"}`,
                borderRadius: "6px",
                padding: "0.2rem 0.5rem",
                fontSize: "0.65rem",
                color: earned ? "#4ade80" : "#475569",
                fontWeight: earned ? "bold" : "normal",
              }}
            >
              {milestoneEmojis[m]} {m}d
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Rating History Chart ───────────────────────────────────────────────────

function RatingMiniChart({
  snapshots,
  platform,
  ratingKey,
  label,
  color,
}: {
  snapshots: RatingSnapshot[];
  platform: "chesscom" | "lichess";
  ratingKey: string;
  label: string;
  color: string;
}) {
  const values = snapshots
    .map((s) => {
      const p = s[platform] as Record<string, number | undefined> | undefined;
      return p?.[ratingKey] ?? null;
    })
    .filter((v): v is number => v !== null);

  if (values.length === 0) return null;

  const min = Math.min(...values) - 20;
  const max = Math.max(...values) + 20;
  const range = max - min || 1;
  const width = 180;
  const height = 50;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const latestRating = values[values.length - 1];
  const firstRating = values[0];
  const change = latestRating - firstRating;
  const changeColor = change >= 0 ? "#4ade80" : "#ef4444";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem", marginBottom: "0.5rem" }}>
      <div style={{ minWidth: "90px" }}>
        <div style={{ color: "#64748b", fontSize: "0.7rem" }}>{label}</div>
        <div style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "bold" }}>{latestRating}</div>
        {values.length > 1 && (
          <div style={{ color: changeColor, fontSize: "0.7rem" }}>
            {change >= 0 ? "+" : ""}{change} all-time
          </div>
        )}
      </div>
      <svg width={width} height={height} style={{ flex: 1 }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function RatingTrackingPanel() {
  const [ratingData, setRatingData] = useState(() => getRatingData());
  const settings = useMemo(() => getUserSettings(), []);

  useEffect(() => {
    if (!settings.chesscomUsername && !settings.lichessUsername) return;
    if (!shouldFetchRatings()) return;
    fetchAndSaveRatings().then(() => {
      setRatingData(getRatingData());
    });
  }, [settings]);

  const hasChesscom = !!settings.chesscomUsername;
  const hasLichess = !!settings.lichessUsername;
  if (!hasChesscom && !hasLichess) return null;

  const snapshots = ratingData.snapshots;

  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem", marginTop: "1rem" }}>
      <h2 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "bold", marginBottom: "1rem" }}>📈 Rating Progress</h2>
      {snapshots.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: "0.85rem" }}>Fetching ratings...</div>
      ) : (
        <div>
          {hasChesscom && (
            <div>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.25rem", textTransform: "uppercase" }}>Chess.com</div>
              <RatingMiniChart snapshots={snapshots} platform="chesscom" ratingKey="blitz" label="Blitz" color="#f59e0b" />
              <RatingMiniChart snapshots={snapshots} platform="chesscom" ratingKey="rapid" label="Rapid" color="#4ade80" />
            </div>
          )}
          {hasLichess && (
            <div>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.25rem", textTransform: "uppercase", marginTop: hasChesscom ? "0.5rem" : 0 }}>Lichess</div>
              <RatingMiniChart snapshots={snapshots} platform="lichess" ratingKey="blitz" label="Blitz" color="#60a5fa" />
              <RatingMiniChart snapshots={snapshots} platform="lichess" ratingKey="rapid" label="Rapid" color="#a855f7" />
            </div>
          )}
          <div style={{ color: "#475569", fontSize: "0.7rem", marginTop: "0.5rem" }}>
            Updated {snapshots.length > 0 ? new Date(snapshots[snapshots.length - 1].date).toLocaleDateString() : "never"}
          </div>
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
    const sessionId = params.get('session_id');
    if (sessionId) {
      // Mark subscription as active (placeholder until webhook integration)
      localStorage.setItem('subscription_status', 'active');
      // Remove query param to avoid re-triggering
      const url = new URL(window.location.href);
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const { totalAttempted, reviewCount, weakestPattern, patternCount } = useMemo(() => {
    const totalAttempted = getTotalAttempts();
    const legacyDue = getDuePuzzleIds().length;
    const sm2Due = getSM2DuePuzzleIds().length;
    const reviewCount = legacyDue + sm2Due;
    const weakestPattern = getWeakestPattern();
    const patternStats = getAllPatternStats();
    const patternCount = patternStats.length;
    return { totalAttempted, reviewCount, weakestPattern, patternCount };
  }, []);

  const streakData = useMemo(() => getStreakData(), []);
  const streak = streakData.currentStreak || useMemo(() => {
    // Fall back to computed streak from raw attempts
    const allDates = new Set<string>();
    getAttempts().forEach((a) => allDates.add(a.timestamp.slice(0, 10)));
    const sm2 = typeof window !== "undefined"
      ? (() => { try { return JSON.parse(localStorage.getItem("ctt_sm2_attempts") || "[]") as {timestamp:string;outcome:string}[]; } catch { return []; } })()
      : [];
    sm2.filter((a) => a.outcome === "solved-first-try" || a.outcome === "solved-after-retry")
      .forEach((a) => allDates.add(a.timestamp.slice(0, 10)));
    let s = 0;
    const d = new Date();
    while (true) {
      const key = d.toISOString().slice(0, 10);
      if (allDates.has(key)) { s++; d.setDate(d.getDate() - 1); } else break;
    }
    return s;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = [
    {
      label: "Total Puzzles Attempted",
      value: String(totalAttempted),
      icon: "♟",
      sub: "All-time",
    },
    {
      label: "Review Queue",
      value: String(reviewCount),
      icon: "🔁",
      sub: reviewCount === 0 ? "All caught up!" : "Due today",
    },
    {
      label: "Weakest Pattern",
      value: weakestPattern
        ? weakestPattern.split(" ").slice(0, 2).join(" ")
        : "—",
      icon: "⚠️",
      sub: weakestPattern ? "Lowest solve rate" : "No data yet",
    },
    {
      label: "Patterns Practiced",
      value: String(patternCount),
      icon: "📊",
      sub: "Unique patterns",
    },
  ];

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", marginBottom: "1.5rem" }}>
        Welcome back! Ready to train?
      </h1>

      {/* XP Bar */}
      <div style={{ marginBottom: "1rem" }}>
        <XPBar />
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1rem" }}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem" }}
          >
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>{stat.icon}</div>
            <div style={{ color: "#4ade80", fontSize: "1.75rem", fontWeight: "bold" }}>{stat.value}</div>
            <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: "0.25rem" }}>{stat.label}</div>
            <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.2rem" }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        {/* Streak Card */}
        <StreakCard streak={streak} freezes={streakData.freezesAvailable} />
        {/* Daily Quests */}
        <DailyQuestsPanel />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem" }}>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "1.25rem" }}>
            30-Day Activity
          </h2>
          <ActivityCalendar />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem" }}>
            <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "1rem" }}>
              Training Summary
            </h2>
            {totalAttempted === 0 ? (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: "1rem 0" }}>
                <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🎯</div>
                <div>Start training to see your stats!</div>
                <div style={{ color: "#475569", fontSize: "0.8rem", marginTop: "0.5rem" }}>
                  Go to Puzzles → select a pattern
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>Patterns practiced</span>
                  <span style={{ color: "#4ade80", fontWeight: "bold" }}>{patternCount}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>Due for review</span>
                  <span style={{ color: reviewCount > 0 ? "#f59e0b" : "#4ade80", fontWeight: "bold" }}>{reviewCount}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>Weakest pattern</span>
                  <span style={{ color: "#ef4444", fontWeight: "bold", fontSize: "0.8rem" }}>
                    {weakestPattern ?? "—"}
                  </span>
                </div>
                {streak > 0 && (
                  <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem", textAlign: "center" }}>
                    <span style={{ color: "#f59e0b", fontSize: "0.9rem" }}>🔥 {streak} day streak — keep it up!</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rating Tracking */}
          <RatingTrackingPanel />
        </div>
      </div>

      {/* Free tier social proof banner */}
      <SocialProofBanner />
    </div>
  );
}

// ── Social Proof Banner (free tier) ───────────────────────────────────────

function SocialProofBanner() {
  const [dismissed, setDismissed] = useState(false);

  // Show to free users (all users for now since there's no paid auth)
  const totalAttempts = useMemo(() => getTotalAttempts(), []);
  if (dismissed || totalAttempts < 5) return null;

  return (
    <div style={{
      marginTop: "1rem",
      backgroundColor: "#0a1525",
      border: "1px solid #1e3a5c",
      borderRadius: "10px",
      padding: "0.9rem 1.25rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontSize: "1.2rem" }}>💡</span>
        <div>
          <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            Users with spaced repetition retain 80% of learned patterns vs 20% without.
          </span>
          <a href="/pricing" style={{ color: "#4ade80", fontSize: "0.82rem", marginLeft: "0.5rem", textDecoration: "none", fontWeight: "bold" }}>
            Start 30-day free trial →
          </a>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "1rem", padding: "0.25rem" }}
      >
        ✕
      </button>
    </div>
  );
}
