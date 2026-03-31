"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getTacticsRatingData,
  getAllPatternStats,
  getActivityLog,
  getFailureModeStats,
  getDominantFailureMode,
  getStreakData,
  getSM2DuePuzzleIds,
  getTodayKey,
  getPuzzlesSolvedAllTime,
  getDailyTargetSettings,
  getTodaySolvedCount,
  getCurrentMasterySet,
  getMasteredCount,
  getDailySessionCompleted,
  type PatternStat,
  type FailureModeStats,
} from "@/lib/storage";

// ── Sprint 31: Pattern Mastery Tier helper ────────────────────────────────
interface PatternMasteryTiers {
  beginner: number;   // ELO < 1000
  intermediate: number; // 1000–1399
  advanced: number;   // 1400–1799
  elite: number;      // 1800+
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

// ── Sprint 31: Pattern Mastery Tier Display Component ─────────────────────
function PatternMasteryTierDisplay() {
  const tiers = getPatternMasteryTiers();
  const tierItems = [
    { label: "Beginner", count: tiers.beginner, color: "#94a3b8", dot: "#94a3b8" },
    { label: "Intermediate", count: tiers.intermediate, color: "#60a5fa", dot: "#60a5fa" },
    { label: "Advanced", count: tiers.advanced, color: "#a855f7", dot: "#a855f7" },
    { label: "Elite", count: tiers.elite, color: "#f59e0b", dot: "#f59e0b" },
  ];

  return (
    <div style={{
      backgroundColor: "#0a1520",
      border: "1px solid #1e3a5c",
      borderRadius: "10px",
      padding: "0.75rem 1rem",
      marginTop: "0.75rem",
    }}>
      <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", marginBottom: "0.5rem" }}>
        Pattern Mastery
      </div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {tierItems.map((tier, i) => (
          <div key={tier.label} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            {i > 0 && <span style={{ color: "#1e3a5c", marginRight: "-0.5rem" }}>·</span>}
            <span style={{
              width: "8px", height: "8px", borderRadius: "50%",
              backgroundColor: tier.dot, display: "inline-block", flexShrink: 0,
            }} />
            <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>{tier.label}</span>
            <span style={{ color: tier.color, fontWeight: "bold", fontSize: "0.82rem" }}>{tier.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── localStorage keys ──────────────────────────────────────────────────────
const CUSTOM_USERNAME_KEY = "ctt_custom_username";
const CUSTOM_PLATFORM_KEY = "ctt_custom_platform";
const PLATFORM_RATINGS_KEY = "ctt_platform_ratings_v2"; // new schema: {bullet,blitz,rapid,main}
const GOAL_KEY = "ctt_goal";
const ACTIVITY_LOG_KEY = "ctt_activity_log";

// ── Types ──────────────────────────────────────────────────────────────────
type Platform = "chesscom" | "lichess";
type TimeControl = "bullet" | "blitz" | "rapid";

interface PlatformRatings {
  bullet: number | null;
  blitz: number | null;
  rapid: number | null;
  main: TimeControl;
}

interface TrainingTask {
  id: string;
  priority: number;
  label: string;
  target: number;
  progress: number;
  actionHref: string;
  actionLabel: string;
  description: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getPlatformRatings(): PlatformRatings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PLATFORM_RATINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlatformRatings;
  } catch {
    return null;
  }
}

function savePlatformRatings(data: PlatformRatings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLATFORM_RATINGS_KEY, JSON.stringify(data));
}

function getTrainingStartDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const log = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || "[]") as string[];
    if (log.length === 0) return null;
    return log[0]; // oldest entry
  } catch {
    return null;
  }
}

function getTrainingDaysCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const log = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || "[]") as string[];
    return log.length;
  } catch {
    return 0;
  }
}

function getWeekPatternProgress(pattern: string): number {
  if (typeof window === "undefined") return 0;
  try {
    // Get this week's Monday
    const now = new Date();
    const day = now.getDay();
    const daysToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);
    const mondayStr = monday.toISOString().slice(0, 10);

    const attempts = JSON.parse(localStorage.getItem("ctt_sm2_attempts") || "[]") as Array<{
      theme?: string; timestamp: string;
    }>;
    return attempts.filter(
      (a) => a.theme?.toUpperCase() === pattern.toUpperCase() &&
        a.timestamp.slice(0, 10) >= mondayStr
    ).length;
  } catch {
    return 0;
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// ── Check if trained today ─────────────────────────────────────────────────
function hasTrainedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const today = getTodayKey();
    const log = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || "[]") as string[];
    return log.includes(today);
  } catch {
    return false;
  }
}

// ── Progress Bar ───────────────────────────────────────────────────────────
function ProgressBar({
  value,
  max,
  color = "#4ade80",
  pulsing = false,
}: {
  value: number;
  max: number;
  color?: string;
  pulsing?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{
      backgroundColor: "#0f0f1a",
      borderRadius: "999px",
      height: "8px",
      overflow: "hidden",
      border: "1px solid #1e2a3a",
      flex: 1,
    }}>
      <div style={{
        height: "100%",
        backgroundColor: pct >= 100 ? "#4ade80" : color,
        borderRadius: "999px",
        width: `${pct}%`,
        transition: "width 0.4s ease",
        animation: pulsing ? "pulsebar 1.4s ease-in-out infinite" : undefined,
      }} />
    </div>
  );
}

// ── Connect Chess.com Modal ────────────────────────────────────────────────
function ConnectModal({ onClose, onConnected }: {
  onClose: () => void;
  onConnected: (ratings: PlatformRatings, username: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState<{ bullet: number | null; blitz: number | null; rapid: number | null } | null>(null);
  const [selectedMain, setSelectedMain] = useState<TimeControl>("rapid");

  async function handleFetch() {
    const uname = username.trim();
    if (!uname) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch(`https://api.chess.com/pub/player/${uname.toLowerCase()}/stats`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        setError(`Username "${uname}" not found on Chess.com.`);
        setConnecting(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const bullet = data?.chess_bullet?.last?.rating ?? null;
      const blitz = data?.chess_blitz?.last?.rating ?? null;
      const rapid = data?.chess_rapid?.last?.rating ?? null;
      setFetched({ bullet, blitz, rapid });
      // Auto-select main: prefer rapid > blitz > bullet
      if (rapid) setSelectedMain("rapid");
      else if (blitz) setSelectedMain("blitz");
      else setSelectedMain("bullet");
    } catch {
      setError("Connection failed. Check your username and try again.");
    } finally {
      setConnecting(false);
    }
  }

  function handleSave() {
    if (!fetched) return;
    const ratings: PlatformRatings = { ...fetched, main: selectedMain };
    savePlatformRatings(ratings);
    localStorage.setItem(CUSTOM_USERNAME_KEY, username.trim());
    localStorage.setItem(CUSTOM_PLATFORM_KEY, "chesscom");
    onConnected(ratings, username.trim());
  }

  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
    }}>
      <div style={{
        backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "16px",
        padding: "2rem", maxWidth: "440px", width: "100%",
      }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", margin: "0 0 1rem" }}>
          ♟ Connect Chess.com
        </h2>

        {!fetched ? (
          <>
            <input
              type="text"
              placeholder="Your Chess.com username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              style={{
                backgroundColor: "#0d1621", border: `1px solid ${error ? "#ef4444" : "#2e3a5c"}`,
                borderRadius: "8px", color: "#e2e8f0", fontSize: "0.95rem",
                padding: "0.75rem 1rem", width: "100%", outline: "none", boxSizing: "border-box",
                marginBottom: "0.75rem",
              }}
            />
            {error && (
              <div style={{ color: "#ef4444", fontSize: "0.8rem", marginBottom: "0.75rem" }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={handleFetch}
                disabled={!username.trim() || connecting}
                style={{
                  flex: 1, backgroundColor: username.trim() && !connecting ? "#4ade80" : "#1a2535",
                  color: username.trim() && !connecting ? "#0f1a0a" : "#4a6a8a",
                  border: "none", borderRadius: "8px", padding: "0.75rem",
                  fontWeight: "bold", cursor: username.trim() && !connecting ? "pointer" : "not-allowed",
                }}
              >
                {connecting ? "Fetching…" : "Fetch Ratings →"}
              </button>
              <button
                onClick={onClose}
                style={{
                  backgroundColor: "transparent", border: "1px solid #2e3a5c",
                  borderRadius: "8px", color: "#64748b", padding: "0.75rem 1rem", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                ✓ Found: {username.trim()}
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
                {(["bullet", "blitz", "rapid"] as TimeControl[]).map((tc) => (
                  <div key={tc} style={{
                    flex: 1, backgroundColor: "#0d1621", border: "1px solid #1e3a5c",
                    borderRadius: "10px", padding: "0.75rem", textAlign: "center",
                  }}>
                    <div style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                      {tc === "bullet" ? "⚡" : tc === "blitz" ? "⏱" : "🕐"} {tc}
                    </div>
                    <div style={{ color: "#e2e8f0", fontSize: "1.3rem", fontWeight: "bold" }}>
                      {fetched[tc] ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                Which time control do you mainly play? (seeds your training ELO)
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {(["bullet", "blitz", "rapid"] as TimeControl[]).filter(tc => fetched[tc] !== null).map((tc) => (
                  <button
                    key={tc}
                    onClick={() => setSelectedMain(tc)}
                    style={{
                      flex: 1, backgroundColor: selectedMain === tc ? "#0d2a1a" : "#0d1621",
                      border: `1px solid ${selectedMain === tc ? "#4ade80" : "#2e3a5c"}`,
                      borderRadius: "8px", color: selectedMain === tc ? "#4ade80" : "#64748b",
                      padding: "0.5rem", fontSize: "0.85rem", fontWeight: selectedMain === tc ? "bold" : "normal",
                      cursor: "pointer",
                    }}
                  >
                    {tc.charAt(0).toUpperCase() + tc.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={handleSave}
                style={{
                  flex: 1, backgroundColor: "#4ade80", color: "#0f1a0a",
                  border: "none", borderRadius: "8px", padding: "0.75rem",
                  fontWeight: "bold", cursor: "pointer",
                }}
              >
                Save & Connect →
              </button>
              <button
                onClick={onClose}
                style={{
                  backgroundColor: "transparent", border: "1px solid #2e3a5c",
                  borderRadius: "8px", color: "#64748b", padding: "0.75rem 1rem", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function TrainingPlan() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);

  // Chess.com state
  const [username, setUsername] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("chesscom");
  const [platformRatings, setPlatformRatings] = useState<PlatformRatings | null>(null);
  const [chesscomAvatar, setChesscomAvatar] = useState<string | null>(null);

  // Training data
  const [tacticsRating, setTacticsRating] = useState(0);
  const [tacticsRatingStart, setTacticsRatingStart] = useState(0);
  const [trainingStartDate, setTrainingStartDate] = useState<string | null>(null);
  const [trainingDays, setTrainingDays] = useState(0);
  const [patternStats, setPatternStats] = useState<PatternStat[]>([]);
  const [failureStats, setFailureStats] = useState<FailureModeStats>({ missed: 0, miscalculated: 0, rushed: 0, unsure: 0, total: 0 });
  const [streakDays, setStreakDays] = useState(0);
  const [reviewDueCount, setReviewDueCount] = useState(0);
  const [totalPuzzlesSolved, setTotalPuzzlesSolved] = useState(0);
  const [goal, setGoal] = useState<string | null>(null);
  const [trainedToday, setTrainedToday] = useState(false);

  // Daily goal progress
  const [dailyGoal, setDailyGoal] = useState(10);
  const [todaySolved, setTodaySolved] = useState(0);

  // Weekly plan tasks
  const [tasks, setTasks] = useState<TrainingTask[]>([]);

  // Sprint 36: Mastery set state
  const [masterySetNumber, setMasterySetNumber] = useState<number | null>(null);
  const [masteredCount, setMasteredCount] = useState(0);
  const [masteryDailyCompleted, setMasteryDailyCompleted] = useState(0);

  const loadData = useCallback(() => {
    const uname = localStorage.getItem(CUSTOM_USERNAME_KEY);
    const plat = (localStorage.getItem(CUSTOM_PLATFORM_KEY) as Platform) ?? "chesscom";
    const ratings = getPlatformRatings();
    const tacticsData = getTacticsRatingData();
    const allPatternStats = getAllPatternStats();
    const failureModeStats = getFailureModeStats();
    const streakData = getStreakData();
    const dueIds = getSM2DuePuzzleIds();
    const allTimeSolved = getPuzzlesSolvedAllTime();
    const startDate = getTrainingStartDate();
    const daysCount = getTrainingDaysCount();
    const userGoal = localStorage.getItem(GOAL_KEY);

    setUsername(uname);
    setPlatform(plat);
    setPlatformRatings(ratings);
    setTacticsRating(tacticsData.tacticsRating);
    setTacticsRatingStart(tacticsData.tacticsRatingStart);
    setPatternStats(allPatternStats);
    setFailureStats(failureModeStats);
    setStreakDays(streakData.currentStreak ?? 0);
    setReviewDueCount(dueIds.length);
    setTotalPuzzlesSolved(allTimeSolved);
    setTrainingStartDate(startDate);
    setTrainingDays(daysCount);
    setGoal(userGoal);
    setTrainedToday(hasTrainedToday());
    setDailyGoal(getDailyTargetSettings().dailyGoal);
    setTodaySolved(getTodaySolvedCount());

    // Sprint 36: Mastery set stats
    const masterySet = getCurrentMasterySet();
    if (masterySet) {
      setMasterySetNumber(masterySet.setNumber);
      setMasteredCount(getMasteredCount());
      setMasteryDailyCompleted(getDailySessionCompleted());
    }

    // Build training tasks
    const generatedTasks = buildTrainingTasks(allPatternStats, failureModeStats, dueIds.length, userGoal ?? "structured_plan");
    setTasks(generatedTasks);
  }, []);

  useEffect(() => {
    setMounted(true);
    loadData();
    window.addEventListener("focus", loadData);
    const iv = setInterval(loadData, 15000);
    return () => {
      window.removeEventListener("focus", loadData);
      clearInterval(iv);
    };
  }, [loadData]);

  // Fetch Chess.com avatar
  useEffect(() => {
    if (!username || platform !== "chesscom") return;
    fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}`, {
      headers: { Accept: "application/json" },
    })
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => { if (d?.avatar) setChesscomAvatar(d.avatar); })
      .catch(() => null);
  }, [username, platform]);

  if (!mounted) return null;

  // ── Derived ──────────────────────────────────────────────────────────────
  const ratingDelta = tacticsRating - tacticsRatingStart;
  const hasEnoughData = trainingDays >= 7;
  const hasDiagnosis = patternStats.filter((s) => s.totalAttempts >= 5).length >= 2 || false;
  const top3Weaknesses = patternStats
    .filter((s) => s.totalAttempts >= 5)
    .sort((a, b) => a.solveRate - b.solveRate)
    .slice(0, 3);
  const dominantMode = getDominantFailureMode();

  // Diagnosis urgency: how close to 20 puzzles
  const diagnosisPuzzlesLeft = Math.max(0, 20 - totalPuzzlesSolved);
  const isNearDiagnosis = !hasDiagnosis && diagnosisPuzzlesLeft <= 5 && diagnosisPuzzlesLeft > 0;
  const diagnosisCTA = isNearDiagnosis
    ? `Almost there — ${diagnosisPuzzlesLeft} more puzzle${diagnosisPuzzlesLeft === 1 ? "" : "s"} to unlock your diagnosis. Start now →`
    : "Start Diagnosis →";

  // ── Start Today routing ───────────────────────────────────────────────────
  function handleStartToday() {
    router.push("/app/training");
  }

  const allTasksDone = tasks.every((t) => t.progress >= t.target);

  // ── Next Milestone ────────────────────────────────────────────────────────
  function getNextMilestone(): { text: string; emoji: string } {
    const nextRatingMilestone = Math.ceil(tacticsRating / 100) * 100;
    const toNextMilestone = nextRatingMilestone - tacticsRating;

    if (totalPuzzlesSolved < 20) {
      return { text: `Solve ${20 - totalPuzzlesSolved} more puzzles to unlock your Tactical DNA Profile`, emoji: "🧬" };
    }
    if (streakDays < 7) {
      return { text: `Train ${7 - streakDays} more days for your 7-day streak achievement`, emoji: "🔥" };
    }
    if (toNextMilestone <= 100) {
      return { text: `You're ${toNextMilestone} rating points from breaking ${nextRatingMilestone}`, emoji: "🎯" };
    }
    return { text: `Solve 50 more puzzles to level up your tactical strength`, emoji: "⬆️" };
  }

  const milestone = getNextMilestone();

  function handleConnected(ratings: PlatformRatings, uname: string) {
    setUsername(uname);
    setPlatformRatings(ratings);
    setShowConnectModal(false);
    loadData();
  }

  // ── Section header style ──────────────────────────────────────────────────
  const sectionHeaderStyle: React.CSSProperties = {
    color: "#e2e8f0",
    fontSize: "0.82rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "1rem",
  };

  return (
    <>
      {/* Pulse animation for near-diagnosis progress bar */}
      <style>{`
        @keyframes pulsebar {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>

      <div style={{ maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* ── Sprint 36: Today's Training ──────────────────────────────────── */}
        {masterySetNumber !== null && (
          <div style={{
            backgroundColor: "#13132b",
            border: "1px solid #2e3a5c",
            borderRadius: "16px",
            padding: "1.5rem",
          }}>
            <div style={sectionHeaderStyle}>Today&apos;s Training</div>

            {/* Set progress */}
            <div style={{
              backgroundColor: "#0d1621", border: "1px solid #1e3a5c",
              borderRadius: "10px", padding: "0.85rem 1rem", marginBottom: "0.75rem",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.88rem", fontWeight: 600 }}>
                  Set {masterySetNumber}
                </span>
                <span style={{ color: "#4ade80", fontSize: "0.88rem", fontWeight: "bold" }}>
                  {masteredCount}/100 mastered
                </span>
              </div>
              <div style={{ backgroundColor: "#0f0f1a", borderRadius: "999px", height: "8px", overflow: "hidden", border: "1px solid #1e2a3a" }}>
                <div style={{
                  height: "100%", backgroundColor: "#4ade80", borderRadius: "999px",
                  width: `${Math.min(100, Math.round((masteredCount / 100) * 100))}%`,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>

            {/* Daily goal */}
            <div style={{
              backgroundColor: "#0d1621", border: "1px solid #1e3a5c",
              borderRadius: "10px", padding: "0.85rem 1rem", marginBottom: "1rem",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Daily goal</span>
                <span style={{ color: masteryDailyCompleted >= dailyGoal ? "#4ade80" : "#f59e0b", fontSize: "0.85rem", fontWeight: "bold" }}>
                  {masteryDailyCompleted}/{dailyGoal} puzzles
                </span>
              </div>
              <div style={{ backgroundColor: "#0f0f1a", borderRadius: "999px", height: "6px", overflow: "hidden", border: "1px solid #1e2a3a" }}>
                <div style={{
                  height: "100%", backgroundColor: masteryDailyCompleted >= dailyGoal ? "#4ade80" : "#f59e0b",
                  borderRadius: "999px",
                  width: `${Math.min(100, dailyGoal > 0 ? Math.round((masteryDailyCompleted / dailyGoal) * 100) : 0)}%`,
                  transition: "width 0.4s ease",
                }} />
              </div>
              {masteryDailyCompleted < dailyGoal && (
                <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.4rem" }}>
                  Est. ~{Math.round((dailyGoal - masteryDailyCompleted) * 0.75)} minutes remaining today
                </div>
              )}
            </div>

            <button
              onClick={() => router.push("/app/training")}
              style={{
                backgroundColor: masteryDailyCompleted >= dailyGoal ? "transparent" : "#4ade80",
                color: masteryDailyCompleted >= dailyGoal ? "#64748b" : "#0f1a0a",
                border: masteryDailyCompleted >= dailyGoal ? "1px solid #2e3a5c" : "none",
                borderRadius: "10px", padding: "0.9rem",
                fontSize: "0.95rem", fontWeight: "bold", cursor: "pointer", width: "100%",
              }}
            >
              {masteryDailyCompleted >= dailyGoal ? "Session done — keep going anyway →" : "Continue Training →"}
            </button>
          </div>
        )}

        {/* ── Sprint 36: Drill Tactics Recommendation ───────────────────────── */}
        {top3Weaknesses.length > 0 && (
          <div style={{
            backgroundColor: "#13132b",
            border: "1px solid #2e3a5c",
            borderRadius: "16px",
            padding: "1.25rem 1.5rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <div style={{ color: "#94a3b8", fontSize: "0.78rem", marginBottom: "0.25rem" }}>
                  Weakest pattern
                </div>
                <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem" }}>
                  {top3Weaknesses[0].theme.charAt(0).toUpperCase() + top3Weaknesses[0].theme.slice(1).toLowerCase()}{" "}
                  <span style={{ color: "#ef4444", fontWeight: "normal", fontSize: "0.85rem" }}>
                    ({Math.round(top3Weaknesses[0].solveRate * 100)}% accuracy)
                  </span>
                </div>
                <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.2rem" }}>
                  Consider extra Drill Tactics time on this pattern
                </div>
              </div>
              <button
                onClick={() => router.push(`/app/patterns/${top3Weaknesses[0].theme.toLowerCase()}`)}
                style={{
                  backgroundColor: "transparent", border: "1px solid #2e3a5c",
                  borderRadius: "8px", padding: "0.5rem 1rem",
                  color: "#60a5fa", fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                Drill {top3Weaknesses[0].theme.charAt(0).toUpperCase() + top3Weaknesses[0].theme.slice(1).toLowerCase()} →
              </button>
            </div>
          </div>
        )}

        {/* ── Sprint 37: Calculation Gym Recommendation ──────────────────────── */}
        {tacticsRating > 1400 && (
          <div style={{
            backgroundColor: "#13132b",
            border: "1px solid #2e3a5c",
            borderRadius: "16px",
            padding: "1.25rem 1.5rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <div style={{ color: "#94a3b8", fontSize: "0.78rem", marginBottom: "0.25rem" }}>
                  Ready for the next level
                </div>
                <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem" }}>
                  Train Calculation
                </div>
                <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.2rem" }}>
                  The Calculation Gym trains visualization without moving pieces — the skill that separates 1400 from 1800 players.
                </div>
              </div>
              <a
                href="/app/calculation"
                style={{
                  backgroundColor: "transparent", border: "1px solid #2e3a5c",
                  borderRadius: "8px", padding: "0.5rem 1rem",
                  color: "#60a5fa", fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap",
                  textDecoration: "none",
                }}
              >
                Open Calculation Gym →
              </a>
            </div>
          </div>
        )}

        {/* ── Section 2: Where You Are ──────────────────────────────────────── */}
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "1.5rem",
        }}>
          <div style={sectionHeaderStyle}>📍 Where You Are</div>

          {username && platformRatings ? (
            <>
              {/* Profile row */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                {chesscomAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={chesscomAvatar}
                    alt="Chess.com avatar"
                    style={{ width: "52px", height: "52px", borderRadius: "50%", border: "2px solid #4ade80", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{
                    width: "52px", height: "52px", borderRadius: "50%",
                    backgroundColor: "#0d2a1a", border: "2px solid #4ade80",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#4ade80", fontSize: "1.4rem",
                  }}>
                    ♟
                  </div>
                )}
                <div>
                  <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem" }}>{username}</div>
                  <div style={{ color: "#64748b", fontSize: "0.78rem" }}>
                    {platform === "chesscom" ? "Chess.com" : "Lichess"}
                    {trainingStartDate && ` · Training since ${formatDate(trainingStartDate)}`}
                  </div>
                </div>
              </div>

              {/* Ratings grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
                {(["bullet", "blitz", "rapid"] as TimeControl[]).map((tc) => {
                  const rating = platformRatings[tc];
                  const isMain = platformRatings.main === tc;
                  return (
                    <div key={tc} style={{
                      backgroundColor: isMain ? "#0d2a1a" : "#0d1621",
                      border: `1px solid ${isMain ? "#4ade80" : "#1e3a5c"}`,
                      borderRadius: "10px",
                      padding: "0.75rem",
                      textAlign: "center",
                      position: "relative",
                    }}>
                      {isMain && (
                        <div style={{
                          position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)",
                          backgroundColor: "#4ade80", color: "#0f1a0a", fontSize: "0.6rem",
                          fontWeight: "bold", padding: "1px 6px", borderRadius: "999px",
                        }}>
                          MAIN
                        </div>
                      )}
                      <div style={{ color: "#64748b", fontSize: "0.68rem", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                        {tc === "bullet" ? "⚡" : tc === "blitz" ? "⏱" : "🕐"} {tc}
                      </div>
                      <div style={{ color: rating ? "#e2e8f0" : "#334155", fontSize: "1.4rem", fontWeight: "bold" }}>
                        {rating ?? "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tactics rating row */}
              <div style={{
                backgroundColor: "#0a1520",
                border: "1px solid #1e3a5c",
                borderRadius: "10px",
                padding: "0.75rem 1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div>
                  <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase" }}>Tactics Rating</div>
                  <div style={{ color: "#4ade80", fontSize: "1.5rem", fontWeight: "bold" }}>{tacticsRating}</div>
                </div>
                {ratingDelta !== 0 && (
                  <div style={{
                    color: ratingDelta > 0 ? "#4ade80" : "#ef4444",
                    fontSize: "0.9rem",
                    fontWeight: "bold",
                  }}>
                    {ratingDelta > 0 ? "+" : ""}{ratingDelta} all-time
                  </div>
                )}
              </div>
              {/* Sprint 31: Pattern Mastery Tier breakdown */}
              <PatternMasteryTierDisplay />
            </>
          ) : (
            <>
              {/* No Chess.com connected */}
              <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", marginBottom: "1.25rem" }}>
                <div style={{
                  width: "52px", height: "52px", borderRadius: "50%", flexShrink: 0,
                  backgroundColor: "#0d1621", border: "2px dashed #2e3a5c",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#334155", fontSize: "1.4rem",
                }}>
                  ♟
                </div>
                <div>
                  <div style={{ color: "#94a3b8", fontSize: "0.92rem", marginBottom: "0.5rem" }}>
                    Connect Chess.com to see your full profile with Bullet, Blitz, and Rapid ratings.
                  </div>
                  <button
                    onClick={() => setShowConnectModal(true)}
                    style={{
                      backgroundColor: "#1e3a5c", border: "1px solid #4ade80",
                      borderRadius: "8px", color: "#4ade80", fontSize: "0.85rem",
                      fontWeight: "bold", padding: "0.5rem 1rem", cursor: "pointer",
                    }}
                  >
                    Connect Chess.com →
                  </button>
                </div>
              </div>

              {/* Still show tactics rating */}
              <div style={{
                backgroundColor: "#0a1520",
                border: "1px solid #1e3a5c",
                borderRadius: "10px",
                padding: "0.75rem 1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div>
                  <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase" }}>Tactics Rating</div>
                  <div style={{ color: "#4ade80", fontSize: "1.5rem", fontWeight: "bold" }}>{tacticsRating}</div>
                </div>
                {trainingStartDate && (
                  <div style={{ color: "#64748b", fontSize: "0.78rem", textAlign: "right" }}>
                    Training since<br />{formatDate(trainingStartDate)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Section 3: Your Diagnosis ─────────────────────────────────────── */}
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "1.5rem",
        }}>
          <div style={sectionHeaderStyle}>🔍 Your Diagnosis</div>

          {hasDiagnosis ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Weaknesses */}
              <div>
                <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: "0.5rem" }}>You struggle with:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {top3Weaknesses.map((s) => (
                    <div key={s.theme} style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      backgroundColor: "#0f0f1a", borderRadius: "8px", padding: "0.5rem 0.75rem",
                    }}>
                      <span style={{ color: "#ef4444", fontSize: "0.75rem", flexShrink: 0 }}>⚠</span>
                      <span style={{ color: "#e2e8f0", fontSize: "0.85rem", flex: 1 }}>
                        {s.theme.charAt(0).toUpperCase() + s.theme.slice(1).toLowerCase().replace(/_/g, " ")}
                      </span>
                      <span style={{
                        color: s.solveRate >= 0.6 ? "#f59e0b" : "#ef4444",
                        fontSize: "0.82rem",
                        fontWeight: "bold",
                      }}>
                        {Math.round(s.solveRate * 100)}% accuracy
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Failure mode */}
              {dominantMode && (
                <div style={{
                  backgroundColor: "#1a1200", border: "1px solid #4a3000",
                  borderRadius: "8px", padding: "0.75rem",
                }}>
                  <div style={{ color: "#f59e0b", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                    How you fail:
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                    {dominantMode === "missed" && `You often don't see the tactic (${Math.round((failureStats.missed / failureStats.total) * 100)}% of failures)`}
                    {dominantMode === "miscalculated" && `You spot it but miscalculate (${Math.round((failureStats.miscalculated / failureStats.total) * 100)}% of failures)`}
                    {dominantMode === "rushed" && `You move too fast (${Math.round((failureStats.rushed / failureStats.total) * 100)}% of failures)`}
                    {dominantMode === "unsure" && `You often feel uncertain (${Math.round((failureStats.unsure / failureStats.total) * 100)}% of failures)`}
                  </div>
                </div>
              )}

              {/* Opportunity */}
              {top3Weaknesses[0] && (
                <div style={{
                  backgroundColor: "#0d2a1a", border: "1px solid #1a4a2a",
                  borderRadius: "8px", padding: "0.75rem",
                }}>
                  <div style={{ color: "#4ade80", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                    Your biggest gain:
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                    Improving {top3Weaknesses[0].theme.toLowerCase()} awareness could save ~{Math.ceil((1 - top3Weaknesses[0].solveRate) * 5)} rating points per 10 games
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              {!username ? (
                <>
                  <div style={{ color: "#94a3b8", fontSize: "0.88rem", marginBottom: "0.75rem" }}>
                    Connect Chess.com to get your personalized weakness diagnosis.
                  </div>
                  <button
                    onClick={() => setShowConnectModal(true)}
                    style={{
                      backgroundColor: "transparent", border: "1px solid #2e3a5c",
                      borderRadius: "8px", color: "#64748b", fontSize: "0.85rem",
                      padding: "0.5rem 1rem", cursor: "pointer",
                    }}
                  >
                    Connect Chess.com →
                  </button>
                </>
              ) : (
                <>
                  <div style={{ color: "#e2e8f0", fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                    Start here — run your diagnosis
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginBottom: "0.75rem" }}>
                    Solve 20 puzzles and we&apos;ll identify your weakest patterns and build your personalized training plan.
                  </div>
                  {/* Sprint 33: pulsing progress bar when close to threshold */}
                  <div style={{
                    backgroundColor: "#0d1621", borderRadius: "999px", height: "6px",
                    overflow: "hidden", border: "1px solid #1e2a3a", margin: "0 auto 0.5rem", maxWidth: "200px",
                  }}>
                    <div style={{
                      height: "100%",
                      backgroundColor: isNearDiagnosis ? "#f59e0b" : "#3b82f6",
                      borderRadius: "999px",
                      width: `${Math.min(100, Math.round((totalPuzzlesSolved / 20) * 100))}%`,
                      transition: "width 0.4s",
                      animation: isNearDiagnosis ? "pulsebar 1.4s ease-in-out infinite" : undefined,
                    }} />
                  </div>
                  <div style={{ color: "#64748b", fontSize: "0.78rem", marginBottom: "1rem" }}>
                    {totalPuzzlesSolved}/20 puzzles completed
                  </div>
                  <a href="/app/puzzles" style={{
                    display: "inline-block",
                    backgroundColor: "#4ade80", color: "#0a1520",
                    fontWeight: 700, fontSize: "0.88rem",
                    padding: "0.5rem 1.25rem", borderRadius: "8px",
                    textDecoration: "none",
                  }}>
                    {diagnosisCTA}
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Section 4: It's Working ───────────────────────────────────────── */}
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "1.5rem",
        }}>
          <div style={sectionHeaderStyle}>📈 It&apos;s Working</div>

          {hasEnoughData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {/* Rating improvement */}
              <div style={{
                backgroundColor: "#0d2a1a", border: "1px solid #1a4a2a",
                borderRadius: "10px", padding: "1rem",
              }}>
                <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                  Tactics Rating
                </div>
                <div style={{ color: "#e2e8f0", fontSize: "1.4rem", fontWeight: "bold" }}>
                  {tacticsRatingStart} → {tacticsRating}
                  {ratingDelta !== 0 && (
                    <span style={{ color: ratingDelta > 0 ? "#4ade80" : "#ef4444", fontSize: "1rem", marginLeft: "0.5rem" }}>
                      ({ratingDelta > 0 ? "+" : ""}{ratingDelta} in {trainingDays} days)
                    </span>
                  )}
                </div>
              </div>

              {/* Biggest improvement */}
              {top3Weaknesses.length > 0 && (() => {
                const best = patternStats
                  .filter((s) => s.totalAttempts >= 10 && s.solveRate >= 0.6)
                  .sort((a, b) => b.solveRate - a.solveRate)[0];
                if (!best) return null;
                return (
                  <div style={{
                    backgroundColor: "#0a1520", border: "1px solid #1e3a5c",
                    borderRadius: "10px", padding: "0.75rem 1rem",
                  }}>
                    <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                      <span style={{ color: "#4ade80", fontWeight: "bold" }}>
                        {best.theme.charAt(0).toUpperCase() + best.theme.slice(1).toLowerCase()} accuracy:
                      </span>{" "}
                      {Math.round(best.solveRate * 100)}% — strong and improving
                    </div>
                  </div>
                );
              })()}

              {/* Streak */}
              {streakDays > 0 && (
                <div style={{
                  backgroundColor: "#1a1200", border: "1px solid #4a3000",
                  borderRadius: "10px", padding: "0.75rem 1rem",
                  color: "#f59e0b", fontSize: "0.88rem", fontWeight: "bold",
                }}>
                  🔥 You&apos;ve trained {streakDays} day{streakDays !== 1 ? "s" : ""} in a row
                </div>
              )}

              {/* ELO estimate */}
              {ratingDelta > 50 && (
                <div style={{
                  backgroundColor: "#0a1520", border: "1px solid #1e3a5c",
                  borderRadius: "10px", padding: "0.75rem 1rem",
                  color: "#64748b", fontSize: "0.82rem",
                }}>
                  Estimated Chess.com impact: ~+{Math.round(ratingDelta * 0.15)} ELO
                  <span style={{ color: "#334155", fontSize: "0.75rem" }}> (based on tactics improvement)</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "0.5rem 0" }}>
              {/* Sprint 33: warmth copy based on trained today */}
              <div style={{ color: "#94a3b8", fontSize: "0.88rem", marginBottom: "0.75rem" }}>
                {trainedToday
                  ? "You trained today ✅ — come back tomorrow to build your streak."
                  : "Train today to keep your streak going 🔥"}
              </div>
              <div style={{
                backgroundColor: "#0d1621", borderRadius: "999px", height: "6px",
                overflow: "hidden", border: "1px solid #1e2a3a", margin: "0 auto 0.5rem", maxWidth: "160px",
              }}>
                <div style={{
                  height: "100%", backgroundColor: "#f59e0b", borderRadius: "999px",
                  width: `${Math.round((trainingDays / 7) * 100)}%`,
                  transition: "width 0.4s",
                }} />
              </div>
              <div style={{ color: "#64748b", fontSize: "0.82rem" }}>
                Day {trainingDays} of 7
              </div>
            </div>
          )}
        </div>

        {/* ── Section 5: Next Milestone ─────────────────────────────────────── */}
        <div style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "1.5rem",
          marginBottom: "0.5rem",
        }}>
          <div style={sectionHeaderStyle}>🏁 Next Milestone</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.5rem" }}>{milestone.emoji}</span>
            <div>
              <div style={{ color: "#e2e8f0", fontSize: "0.92rem" }}>{milestone.text}</div>
              {milestone.text.includes("Tactical DNA") && (
                <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.3rem" }}>
                  Your Tactical DNA Profile maps your strengths and weaknesses across all 24 patterns — showing you exactly which tactics you&apos;re sharp on and which are costing you rating points.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Connect modal */}
        {showConnectModal && (
          <ConnectModal
            onClose={() => setShowConnectModal(false)}
            onConnected={handleConnected}
          />
        )}
      </div>
    </>
  );
}

// ── Training Task Builder ──────────────────────────────────────────────────
function buildTrainingTasks(
  patternStats: PatternStat[],
  failureStats: FailureModeStats,
  reviewDueCount: number,
  goal: string
): TrainingTask[] {
  const tasks: TrainingTask[] = [];

  // ── Task 1: Weakest pattern or goal-based ─────────────────────────────────
  const statsWithData = patternStats.filter((s) => s.totalAttempts >= 5);
  const weakest = statsWithData.sort((a, b) => a.solveRate - b.solveRate)[0];

  let priority1Theme = "FORK";
  let priority1Label = "Fork";

  if (weakest) {
    priority1Theme = weakest.theme.toUpperCase();
    priority1Label = weakest.theme.charAt(0).toUpperCase() + weakest.theme.slice(1).toLowerCase();
  } else if (goal === "find_weaknesses") {
    priority1Theme = "PIN";
    priority1Label = "Pin";
  } else if (goal === "from_my_games") {
    priority1Theme = "BACK RANK MATE";
    priority1Label = "Back Rank Mate";
  }

  const p1Progress = Math.min(30, getWeekPatternProgress(priority1Theme));
  tasks.push({
    id: "task1",
    priority: 1,
    label: priority1Label,
    description: `→ Drill 30 puzzles at your current rating`,
    target: 30,
    progress: p1Progress,
    // Sprint 33: routes to /app/training, button label handled at render
    actionHref: `/app/training`,
    actionLabel: "Train →",
  });

  // ── Task 2: Failure mode or calculation ───────────────────────────────────
  const dominantMode = (() => {
    if (failureStats.total < 5) return null;
    if (failureStats.miscalculated / failureStats.total > 0.3) return "miscalculated";
    if (failureStats.rushed / failureStats.total > 0.3) return "rushed";
    if (failureStats.missed / failureStats.total > 0.3) return "missed";
    return null;
  })();

  let task2: TrainingTask;
  if (dominantMode === "miscalculated") {
    task2 = {
      id: "task2",
      priority: 2,
      label: "Calculation",
      description: "→ Complete 2 Calculation Gym sessions",
      target: 2,
      progress: Math.min(2, Math.floor(getWeekPatternProgress("FORK") / 10)),
      actionHref: "/app/training",
      actionLabel: "Train →",
    };
  } else {
    // Second weakest pattern
    const secondWeakest = statsWithData.sort((a, b) => a.solveRate - b.solveRate)[1];
    const p2Theme = secondWeakest?.theme.toUpperCase() ?? "PIN";
    const p2Label = secondWeakest
      ? secondWeakest.theme.charAt(0).toUpperCase() + secondWeakest.theme.slice(1).toLowerCase()
      : "Pin";

    task2 = {
      id: "task2",
      priority: 2,
      label: p2Label,
      description: "→ Drill 15 puzzles at your current rating",
      target: 15,
      progress: Math.min(15, getWeekPatternProgress(p2Theme)),
      actionHref: `/app/training`,
      actionLabel: "Train →",
    };
  }
  tasks.push(task2);

  // ── Task 3: Review queue ──────────────────────────────────────────────────
  const reviewTarget = Math.max(5, Math.min(reviewDueCount, 20));
  const reviewProgress = Math.max(0, reviewDueCount > 0 ? reviewTarget - reviewDueCount : reviewTarget);
  tasks.push({
    id: "task3",
    priority: 3,
    label: "Review Queue",
    description: `→ Clear ${reviewTarget} due puzzles`,
    target: reviewTarget,
    progress: reviewProgress,
    actionHref: "/app/review",
    actionLabel: "Review →",
  });

  return tasks;
}
