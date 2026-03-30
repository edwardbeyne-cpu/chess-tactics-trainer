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
  type PatternStat,
  type FailureModeStats,
} from "@/lib/storage";

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

interface ChesscomProfile {
  username: string;
  avatar: string | null;
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

function getTodayPatternProgress(pattern: string): number {
  // Count SM2 attempts today for a given pattern
  if (typeof window === "undefined") return 0;
  try {
    const today = getTodayKey();
    const attempts = JSON.parse(localStorage.getItem("ctt_sm2_attempts") || "[]") as Array<{
      theme?: string; timestamp: string;
    }>;
    return attempts.filter(
      (a) => a.theme?.toUpperCase() === pattern.toUpperCase() &&
        a.timestamp.slice(0, 10) === today
    ).length;
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

function getWeekReviewCleared(): number {
  if (typeof window === "undefined") return 0;
  try {
    const now = new Date();
    const day = now.getDay();
    const daysToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);
    const mondayStr = monday.toISOString().slice(0, 10);

    const attempts = JSON.parse(localStorage.getItem("ctt_sm2_attempts") || "[]") as Array<{
      timestamp: string;
    }>;
    // Review cleared = all SM2 attempts this week (rough proxy)
    return attempts.filter((a) => a.timestamp.slice(0, 10) >= mondayStr).length;
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

// ── Progress Bar ───────────────────────────────────────────────────────────
function ProgressBar({ value, max, color = "#4ade80" }: { value: number; max: number; color?: string }) {
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

  // Weekly plan tasks
  const [tasks, setTasks] = useState<TrainingTask[]>([]);

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

  // ── Start Today routing ───────────────────────────────────────────────────
  function handleStartToday() {
    const firstIncomplete = tasks.find((t) => t.progress < t.target);
    if (!firstIncomplete) return; // all done
    router.push(firstIncomplete.actionHref);
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

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* ── Section 1: Where You Are ────────────────────────────────────────── */}
      <div style={{
        backgroundColor: "#13132b",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        padding: "1.5rem",
      }}>
        <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
          📍 Where You Are
        </div>

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

      {/* ── Section 2: Your Diagnosis ───────────────────────────────────────── */}
      <div style={{
        backgroundColor: "#13132b",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        padding: "1.5rem",
      }}>
        <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
          🔍 Your Diagnosis
        </div>

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
                  Solve 20 puzzles and we'll identify your weakest patterns and build your personalized training plan.
                </div>
                <div style={{
                  backgroundColor: "#0d1621", borderRadius: "999px", height: "6px",
                  overflow: "hidden", border: "1px solid #1e2a3a", margin: "0 auto 0.5rem", maxWidth: "200px",
                }}>
                  <div style={{
                    height: "100%", backgroundColor: "#3b82f6", borderRadius: "999px",
                    width: `${Math.min(100, Math.round((totalPuzzlesSolved / 20) * 100))}%`,
                    transition: "width 0.4s",
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
                  Start Diagnosis →
                </a>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: Your Plan ────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: "#13132b",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        padding: "1.5rem",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem",
        }}>
          <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            📋 This Week&apos;s Plan
          </div>
          <div style={{ color: "#334155", fontSize: "0.72rem" }}>Resets Monday</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.25rem" }}>
          {tasks.map((task) => {
            const done = task.progress >= task.target;
            return (
              <div key={task.id} style={{
                backgroundColor: done ? "#0d2a1a" : "#0d1621",
                border: `1px solid ${done ? "#1a4a2a" : "#1e3a5c"}`,
                borderRadius: "12px",
                padding: "1rem",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <div>
                    <div style={{ color: "#475569", fontSize: "0.68rem", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                      Priority {task.priority}
                    </div>
                    <div style={{ color: done ? "#4ade80" : "#e2e8f0", fontWeight: "bold", fontSize: "0.92rem" }}>
                      {done ? "✓ " : ""}{task.label}
                    </div>
                    <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.2rem" }}>
                      {task.description}
                    </div>
                  </div>
                  {!done && (
                    <button
                      onClick={() => router.push(task.actionHref)}
                      style={{
                        backgroundColor: "transparent", border: "1px solid #2e3a5c",
                        borderRadius: "6px", color: "#94a3b8", fontSize: "0.72rem",
                        padding: "0.25rem 0.6rem", cursor: "pointer", flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {task.actionLabel}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <ProgressBar value={task.progress} max={task.target} color="#3b82f6" />
                  <span style={{ color: done ? "#4ade80" : "#64748b", fontSize: "0.78rem", whiteSpace: "nowrap", fontWeight: done ? "bold" : "normal" }}>
                    {Math.min(task.progress, task.target)}/{task.target}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Daily target + CTA */}
        <div style={{
          borderTop: "1px solid #1e2a3a",
          paddingTop: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <div style={{ color: "#64748b", fontSize: "0.82rem" }}>
              <span style={{ color: "#94a3b8" }}>Weekly goal:</span> {tasks.reduce((sum, t) => sum + t.target, 0)} puzzles
            </div>
            <div style={{ color: "#64748b", fontSize: "0.82rem" }}>
              <span style={{ color: "#94a3b8" }}>Daily pace:</span> ~{Math.ceil(tasks.reduce((sum, t) => sum + Math.max(0, t.target - t.progress), 0) / 7)} puzzles/day
            </div>
          </div>

          {allTasksDone ? (
            <div style={{
              backgroundColor: "#0d2a1a", border: "1px solid #4ade80",
              borderRadius: "10px", padding: "0.85rem", textAlign: "center",
              color: "#4ade80", fontWeight: "bold", fontSize: "0.95rem",
            }}>
              🎉 Great work today! Come back tomorrow.
            </div>
          ) : (
            <button
              onClick={handleStartToday}
              style={{
                backgroundColor: "#4ade80", color: "#0f1a0a",
                border: "none", borderRadius: "10px", padding: "0.9rem",
                fontSize: "0.95rem", fontWeight: "bold", cursor: "pointer",
                width: "100%",
              }}
            >
              Start Today →
            </button>
          )}
        </div>
      </div>

      {/* ── Section 4: It's Working ─────────────────────────────────────────── */}
      <div style={{
        backgroundColor: "#13132b",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        padding: "1.5rem",
      }}>
        <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
          📈 It&apos;s Working
        </div>

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
            <div style={{ color: "#94a3b8", fontSize: "0.88rem", marginBottom: "0.75rem" }}>
              Keep training — your progress report unlocks after 7 days.
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

      {/* ── Section 5: Next Milestone ───────────────────────────────────────── */}
      <div style={{
        backgroundColor: "#13132b",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        padding: "1.5rem",
        marginBottom: "0.5rem",
      }}>
        <div style={{ color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
          🏁 Next Milestone
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.5rem" }}>{milestone.emoji}</span>
          <span style={{ color: "#e2e8f0", fontSize: "0.92rem" }}>{milestone.text}</span>
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
  let priority1Slug = "fork";
  let priority1Label = "Fork";

  if (weakest) {
    priority1Theme = weakest.theme.toUpperCase();
    priority1Slug = weakest.theme.toLowerCase().replace(/ /g, "-");
    priority1Label = weakest.theme.charAt(0).toUpperCase() + weakest.theme.slice(1).toLowerCase();
  } else if (goal === "find_weaknesses") {
    priority1Theme = "PIN";
    priority1Slug = "pin";
    priority1Label = "Pin";
  } else if (goal === "from_my_games") {
    priority1Theme = "BACK RANK MATE";
    priority1Slug = "backrankmate";
    priority1Label = "Back Rank Mate";
  }

  const p1Progress = getWeekPatternProgress(priority1Theme);
  tasks.push({
    id: "task1",
    priority: 1,
    label: priority1Label,
    description: `→ Drill 20 puzzles in Drill Tactics`,
    target: 20,
    progress: p1Progress,
    actionHref: `/app/patterns/${priority1Slug}`,
    actionLabel: "Drill →",
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
      progress: Math.min(2, Math.floor(getWeekPatternProgress("FORK") / 10)), // rough proxy
      actionHref: "/app/patterns",
      actionLabel: "Train →",
    };
  } else {
    // Second weakest pattern
    const secondWeakest = statsWithData.sort((a, b) => a.solveRate - b.solveRate)[1];
    const p2Theme = secondWeakest?.theme.toUpperCase() ?? "PIN";
    const p2Slug = secondWeakest?.theme.toLowerCase() ?? "pin";
    const p2Label = secondWeakest
      ? secondWeakest.theme.charAt(0).toUpperCase() + secondWeakest.theme.slice(1).toLowerCase()
      : "Pin";

    task2 = {
      id: "task2",
      priority: 2,
      label: p2Label,
      description: "→ Drill 15 puzzles in Drill Tactics",
      target: 15,
      progress: getWeekPatternProgress(p2Theme),
      actionHref: `/app/patterns/${p2Slug}`,
      actionLabel: "Drill →",
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
