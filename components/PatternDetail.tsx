"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import patterns from "@/data/patterns";
import { cachedPuzzlesByTheme, PATTERN_PUZZLE_COUNTS, type LichessCachedPuzzle } from "@/data/lichess-puzzles";
import {
  getPuzzleProgressMap,
  getPatternRating,
  getPatternCurriculumSummary,
  getNextPuzzleForPattern,
  type PuzzleProgress,
  type PuzzleStatus,
} from "@/lib/storage";

// ── Status icon mapping ───────────────────────────────────────────────────

function statusIcon(status: PuzzleStatus, isDue: boolean): string {
  if (isDue) return "📅";
  switch (status) {
    case "solved_first_try": return "✅";
    case "solved_retry": return "🔄";
    case "missed": return "❌";
    default: return "⬜";
  }
}

function statusLabel(status: PuzzleStatus, isDue: boolean): string {
  if (isDue) return "Due for review";
  switch (status) {
    case "solved_first_try": return "Solved first try";
    case "solved_retry": return "Solved after retry";
    case "missed": return "Needs review";
    default: return "Not attempted";
  }
}

// ── Difficulty label ──────────────────────────────────────────────────────

function difficultyLabel(rating: number): string {
  if (rating < 1000) return "Beginner";
  if (rating < 1400) return "Intermediate";
  if (rating < 1800) return "Advanced";
  return "Expert";
}

function difficultyColor(rating: number): string {
  if (rating < 1000) return "#4ade80";
  if (rating < 1400) return "#f59e0b";
  if (rating < 1800) return "#ef4444";
  return "#a855f7";
}

// ── Main PatternDetail Component ──────────────────────────────────────────

export default function PatternDetail() {
  const params = useParams();
  const router = useRouter();
  const themeKey = typeof params.theme === "string" ? params.theme : "";

  const [progressMap, setProgressMap] = useState<Record<string, PuzzleProgress>>({});

  useEffect(() => {
    setProgressMap(getPuzzleProgressMap());
  }, []);

  // Find pattern definition
  const pattern = useMemo(() => {
    // Try direct name match or theme key match
    return patterns.find((p) => {
      const key = p.name.toLowerCase().replace(/\s+/g, "");
      return key === themeKey || p.themes.some(t => t.toLowerCase().replace(/[\s_]/g, '') === themeKey.toLowerCase());
    });
  }, [themeKey]);

  const puzzles: LichessCachedPuzzle[] = useMemo(() => {
    return cachedPuzzlesByTheme[themeKey] ?? [];
  }, [themeKey]);

  const totalPuzzles = PATTERN_PUZZLE_COUNTS[themeKey] ?? puzzles.length;
  const patternRating = getPatternRating(themeKey);
  const summary = useMemo(() => getPatternCurriculumSummary(themeKey, totalPuzzles), [themeKey, totalPuzzles, progressMap]);
  const nextPuzzleIndex = useMemo(() => getNextPuzzleForPattern(themeKey, totalPuzzles), [themeKey, totalPuzzles, progressMap]);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  function getPuzzleProgress(puzzleId: string): PuzzleProgress | null {
    return progressMap[puzzleId] ?? null;
  }

  function isPuzzleDue(progress: PuzzleProgress | null): boolean {
    if (!progress?.nextReviewDate) return false;
    return new Date(progress.nextReviewDate) <= now;
  }

  if (!pattern || puzzles.length === 0) {
    return (
      <div style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center", padding: "4rem 1rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔍</div>
        <div style={{ color: "#94a3b8", fontSize: "1.1rem", marginBottom: "1.5rem" }}>
          Pattern &ldquo;{themeKey}&rdquo; not found or has no puzzles loaded yet.
        </div>
        <button
          onClick={() => router.push("/app/patterns")}
          style={{ backgroundColor: "#2e75b6", color: "white", border: "none", borderRadius: "8px", padding: "0.7rem 1.5rem", cursor: "pointer" }}
        >
          ← Back to Patterns
        </button>
      </div>
    );
  }

  const progressPct = totalPuzzles > 0 ? Math.round((summary.completed / totalPuzzles) * 100) : 0;
  const dueCount = summary.dueForReview;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      {/* Back button */}
      <button
        onClick={() => router.push("/app/patterns")}
        style={{ backgroundColor: "transparent", color: "#64748b", border: "none", cursor: "pointer", fontSize: "0.85rem", marginBottom: "1rem", padding: 0 }}
      >
        ← Back to Patterns
      </button>

      {/* Header */}
      <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "2rem" }}>{pattern.icon}</span>
              <h1 style={{ color: "#e2e8f0", fontSize: "1.5rem", fontWeight: "bold", margin: 0 }}>{pattern.name}</h1>
            </div>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>{pattern.description}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1.3rem" }}>
              {patternRating.rating.toLocaleString()}
            </div>
            <div style={{ color: "#64748b", fontSize: "0.72rem" }}>Pattern ELO</div>
            <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginTop: "0.25rem" }}>
              {patternRating.gamesPlayed} games played
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
            <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
              <strong style={{ color: "#e2e8f0" }}>{summary.completed}</strong> / {totalPuzzles} completed
            </span>
            <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{progressPct}%</span>
          </div>
          <div style={{ backgroundColor: "#0d1621", borderRadius: "5px", height: "8px", overflow: "hidden" }}>
            <div style={{ width: `${progressPct}%`, height: "100%", backgroundColor: "#2e75b6", borderRadius: "5px", transition: "width 0.3s" }} />
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", flexWrap: "wrap", fontSize: "0.78rem", color: "#94a3b8" }}>
          <span>✅ {summary.solvedFirstTry} first try</span>
          <span>🔄 {summary.solvedRetry} after retry</span>
          <span>❌ {summary.missed} missed</span>
          {dueCount > 0 && <span style={{ color: "#f59e0b" }}>📅 {dueCount} due for review</span>}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
          <button
            onClick={() => router.push(`/app/puzzles?pattern=${themeKey}&index=${nextPuzzleIndex}`)}
            style={{
              backgroundColor: "#2e75b6",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 1.5rem",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.9rem",
            }}
          >
            {dueCount > 0 ? `Review ${dueCount} Due` : `Continue (Puzzle #${nextPuzzleIndex})`}
          </button>
          <button
            onClick={() => router.push(`/app/puzzles?pattern=${themeKey}&index=1`)}
            style={{
              backgroundColor: "#1a1a2e",
              color: "#94a3b8",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.75rem 1.5rem",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Start from #1
          </button>
        </div>
      </div>

      {/* Puzzle list */}
      <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "14px", padding: "1.5rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "bold", marginBottom: "1rem" }}>
          All {totalPuzzles} Puzzles
        </h2>

        {/* Legend */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", fontSize: "0.72rem", color: "#64748b", flexWrap: "wrap" }}>
          <span>⬜ Not attempted</span>
          <span>✅ Solved first try</span>
          <span>🔄 Solved after retry</span>
          <span>❌ Missed</span>
          <span>📅 Due for review</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem" }}>
          {puzzles.map((puzzle, idx) => {
            const orderIndex = idx + 1;
            const progress = getPuzzleProgress(puzzle.id);
            const due = isPuzzleDue(progress);
            const icon = statusIcon(progress?.status ?? "not_attempted", due);
            const label = statusLabel(progress?.status ?? "not_attempted", due);
            const isNext = orderIndex === nextPuzzleIndex;

            return (
              <button
                key={puzzle.id}
                onClick={() => router.push(`/app/puzzles?pattern=${themeKey}&index=${orderIndex}`)}
                title={`Puzzle #${orderIndex} — ${difficultyLabel(puzzle.rating)} (${puzzle.rating}) — ${label}`}
                style={{
                  backgroundColor: isNext ? "#162a4a" : "#0f1621",
                  border: `1px solid ${isNext ? "#2e75b6" : "#1e2a3a"}`,
                  borderRadius: "8px",
                  padding: "0.6rem 0.75rem",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2e75b6")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = isNext ? "#2e75b6" : "#1e2a3a")}
              >
                <span style={{ fontSize: "1rem" }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#e2e8f0", fontSize: "0.78rem", fontWeight: isNext ? "bold" : "normal" }}>
                    #{orderIndex}
                    {isNext && <span style={{ color: "#2e75b6", marginLeft: "0.3rem", fontSize: "0.65rem" }}>← next</span>}
                  </div>
                  <div style={{ color: difficultyColor(puzzle.rating), fontSize: "0.68rem" }}>
                    ⭐ {puzzle.rating}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
