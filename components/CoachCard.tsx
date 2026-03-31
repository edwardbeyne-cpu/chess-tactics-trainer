"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getSessionState,
  getFailureModeStats,
  getPuzzleTimes,
  getLastActivePattern,
  getDominantFailureMode,
} from "@/lib/storage";
import type { CoachRequestBody } from "@/app/api/coach/route";

// ── Local storage keys ─────────────────────────────────────────────────────
const COACH_NOTE_KEY = "ctt_last_coaching_note";
const COACH_DISMISSED_KEY = "ctt_coach_dismissed_session";
const SESSION_KEY = "ctt_session";

interface CachedNote {
  note: string;
  sessionStart: string;
  stats: {
    puzzlesSolved: number;
    accuracy: number;
    avgTimeSec: number;
  };
}

function getTimeOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function getAvgTimeSec(): number {
  const timesMap = getPuzzleTimes();
  const values = Object.values(timesMap)
    .flatMap((r) => r.history ?? [])
    .filter((h) => h.time > 0)
    .map((h) => h.time);
  if (values.length === 0) return 0;
  const recent = values.slice(-20); // last 20 entries
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}

function getSessionCorrectCount(puzzlesSolved: number): number {
  // We don't have per-session correct count separately, but we can estimate
  // from consecutiveCorrect and session history. For now use sessionState.
  // Since we only have consecutiveCorrect (resets on wrong), we'll pass
  // puzzlesSolved as upper bound and use failure modes to estimate.
  const modes = getFailureModeStats();
  // failures from this session = modes in the session window (rough)
  // Actually, let's derive: correct = puzzlesSolved - modes.total (recent failures)
  const recentFails = Math.min(modes.total, puzzlesSolved);
  return Math.max(0, puzzlesSolved - recentFails);
}

// ── CoachCard component ────────────────────────────────────────────────────

interface CoachCardProps {
  sessionPuzzleCount: number;
  sessionCorrectCount?: number;
  patternFocus?: string;
}

export default function CoachCard({
  sessionPuzzleCount,
  sessionCorrectCount,
  patternFocus,
}: CoachCardProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [stats, setStats] = useState<{ puzzlesSolved: number; accuracy: number; avgTimeSec: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Check for cached note on mount
  useEffect(() => {
    if (sessionPuzzleCount < 5) return;

    // Check if dismissed this session
    const sessionState = getSessionState();
    const dismissedSession = localStorage.getItem(COACH_DISMISSED_KEY);
    if (dismissedSession === sessionState.startedAt) {
      setDismissed(true);
      return;
    }

    // Check for cached note from same session
    try {
      const cached: CachedNote = JSON.parse(localStorage.getItem(COACH_NOTE_KEY) || "null");
      if (cached && cached.sessionStart === sessionState.startedAt) {
        setNote(cached.note);
        setStats(cached.stats);
        setVisible(true);
        return;
      }
    } catch {
      // ignore
    }

    // Show the card (without note yet — user clicks button)
    setVisible(true);
  }, [sessionPuzzleCount]);

  const handleGetCoaching = useCallback(async () => {
    setLoading(true);

    const failureModes = getFailureModeStats();
    const avgTimeSec = getAvgTimeSec();
    const correctCount = sessionCorrectCount ?? getSessionCorrectCount(sessionPuzzleCount);
    const incorrectCount = sessionPuzzleCount - correctCount;
    const accuracy = sessionPuzzleCount > 0 ? Math.round((correctCount / sessionPuzzleCount) * 100) : 0;
    const pattern = patternFocus ?? getLastActivePattern() ?? "mixed";
    const timeOfDay = getTimeOfDay();

    const dominantFailureMode = getDominantFailureMode();

    const payload: CoachRequestBody = {
      puzzlesSolved: sessionPuzzleCount,
      correctCount,
      incorrectCount,
      avgTimeSec,
      failureModes,
      patternFocus: pattern,
      timeOfDay,
      dominantFailureMode,
    };

    const computedStats = { puzzlesSolved: sessionPuzzleCount, accuracy, avgTimeSec };

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      const coachNote = data.note ?? "Good session. Keep drilling your weakest patterns and focus on slowing down before moving.";

      setNote(coachNote);
      setStats(computedStats);

      // Cache the note
      const sessionState = getSessionState();
      const cached: CachedNote = { note: coachNote, sessionStart: sessionState.startedAt, stats: computedStats };
      localStorage.setItem(COACH_NOTE_KEY, JSON.stringify(cached));
    } catch {
      const fallback = "Good session. Keep drilling your weakest patterns and focus on slowing down before moving.";
      setNote(fallback);
      setStats(computedStats);
    } finally {
      setLoading(false);
    }
  }, [sessionPuzzleCount, sessionCorrectCount, patternFocus]);

  function handleDismiss() {
    const sessionState = getSessionState();
    localStorage.setItem(COACH_DISMISSED_KEY, sessionState.startedAt);
    setDismissed(true);
    setVisible(false);
  }

  if (!visible || dismissed || sessionPuzzleCount < 5) return null;

  return (
    <div
      style={{
        backgroundColor: "#0d1a2a",
        border: "1px solid #1e4a6e",
        borderRadius: "12px",
        padding: "1rem 1.25rem",
        marginTop: "1rem",
        animation: "slideIn 0.3s ease",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.1rem" }}>🧠</span>
          <span
            style={{
              color: "#93c5fd",
              fontWeight: "700",
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
            }}
          >
            Coach&apos;s Note
          </span>
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: "none",
            border: "none",
            color: "#475569",
            cursor: "pointer",
            fontSize: "0.95rem",
            padding: "0 0.25rem",
            lineHeight: 1,
          }}
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* Stats row (shown once note is loaded) */}
      {stats && (
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid #1e2a3a",
          }}
        >
          <StatPill label="Puzzles" value={String(stats.puzzlesSolved)} />
          <StatPill label="Accuracy" value={`${stats.accuracy}%`} />
          {stats.avgTimeSec > 0 && (
            <StatPill label="Avg Time" value={`${stats.avgTimeSec}s`} />
          )}
        </div>
      )}

      {/* Note or CTA */}
      {note ? (
        <p
          style={{
            color: "#cbd5e1",
            fontSize: "0.88rem",
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          {note}
        </p>
      ) : (
        <button
          onClick={handleGetCoaching}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#1e2a3a" : "#1e3a5f",
            color: loading ? "#4a6a8a" : "#93c5fd",
            border: `1px solid ${loading ? "#1e2a3a" : "#2e5a9f"}`,
            borderRadius: "8px",
            padding: "0.6rem 1rem",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: "600",
            fontSize: "0.85rem",
            width: "100%",
            transition: "background 0.15s",
          }}
        >
          {loading ? "Generating coaching note..." : "Get Coaching 🧠"}
        </button>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "#111827",
        border: "1px solid #1e2a3a",
        borderRadius: "6px",
        padding: "0.2rem 0.55rem",
        display: "flex",
        gap: "0.3rem",
        alignItems: "baseline",
      }}
    >
      <span style={{ color: "#4a6a8a", fontSize: "0.72rem" }}>{label}</span>
      <span style={{ color: "#e2e8f0", fontWeight: "700", fontSize: "0.82rem" }}>{value}</span>
    </div>
  );
}
