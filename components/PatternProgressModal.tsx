"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import patterns from "@/data/patterns";
import { usePuzzleData } from "@/lib/puzzle-data";
import {
  getPuzzleProgressMap,
  getPuzzleTimes,
  getPatternRating,
  getPatternCurriculumSummary,
  getNextPuzzleForPattern,
  getTimeStandard,
  type PuzzleProgress,
  type PuzzleStatus,
  type PuzzleTimesMap,
} from "@/lib/storage";

// ── Status icon mapping ─────────────────────────────────────────────────

function statusIcon(status: PuzzleStatus, isDue: boolean, metStandard?: boolean): string {
  if (isDue) return "📅";
  if (metStandard) return "⚡"; // Correct AND met time standard
  switch (status) {
    case "solved_first_try": return "🟢";
    case "solved_retry": return "🟢";
    case "missed": return "🟡";
    default: return "⬜";
  }
}

function statusLabel(
  status: PuzzleStatus,
  isDue: boolean,
  timeRecord?: { bestTime: number | null; lastTime: number | null; metStandard: boolean } | null,
  timeStandard?: number,
): string {
  if (isDue) return "Due for review";
  const std = timeStandard ?? 30;
  if (timeRecord?.metStandard && timeRecord.bestTime) {
    return `Solved in ${timeRecord.bestTime}s ✅ (standard: ${std}s)`;
  }
  switch (status) {
    case "solved_first_try": {
      const t = timeRecord?.bestTime ?? timeRecord?.lastTime;
      return t ? `Solved in ${t}s (standard: ${std}s)` : "Solved first try";
    }
    case "solved_retry": {
      const t = timeRecord?.bestTime ?? timeRecord?.lastTime;
      return t ? `Solved in ${t}s (standard: ${std}s)` : "Solved after retry";
    }
    case "missed": {
      const t = timeRecord?.lastTime;
      return t ? `Missed in ${t}s ❌` : "Needs review";
    }
    default: return "Not attempted";
  }
}

function difficultyColor(rating: number): string {
  if (rating < 1000) return "#4ade80";
  if (rating < 1400) return "#f59e0b";
  if (rating < 1800) return "#ef4444";
  return "#a855f7";
}

// ── Props ───────────────────────────────────────────────────────────────

interface PatternProgressModalProps {
  theme: string;       // theme key e.g. "fork"
  isOpen: boolean;
  onClose: () => void;
  onNavigateToPuzzle: (themeKey: string, index: number) => void;
}

export default function PatternProgressModal({
  theme,
  isOpen,
  onClose,
  onNavigateToPuzzle,
}: PatternProgressModalProps) {
  const router = useRouter();
  const [progressMap, setProgressMap] = useState<Record<string, PuzzleProgress>>({});
  const [puzzleTimesMap, setPuzzleTimesMap] = useState<PuzzleTimesMap>({});
  const [timeStandard, setTimeStandard] = useState(30);

  useEffect(() => {
    if (isOpen) {
      setProgressMap(getPuzzleProgressMap());
      setPuzzleTimesMap(getPuzzleTimes());
      setTimeStandard(getTimeStandard());
    }
  }, [isOpen, theme]);

  const pattern = useMemo(() => {
    return patterns.find((p) => {
      const key = p.name.toLowerCase().replace(/\s+/g, "");
      return (
        key === theme ||
        p.themes?.some((t) => t.toLowerCase().replace(/[\s_]/g, "") === theme.toLowerCase())
      );
    });
  }, [theme]);

  const puzzleData = usePuzzleData();
  const puzzles = useMemo(
    () => puzzleData?.cachedPuzzlesByTheme[theme] ?? [],
    [theme, puzzleData]
  );
  const totalPuzzles = puzzleData?.PATTERN_PUZZLE_COUNTS[theme] ?? puzzles.length;
  const patternRating = getPatternRating(theme);
  const summary = useMemo(
    () => getPatternCurriculumSummary(theme, totalPuzzles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, totalPuzzles, progressMap]
  );
  const nextPuzzleIndex = useMemo(
    () => getNextPuzzleForPattern(theme, totalPuzzles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, totalPuzzles, progressMap]
  );

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  function getPuzzleProgress(puzzleId: string): PuzzleProgress | null {
    return progressMap[puzzleId] ?? null;
  }

  function isPuzzleDue(progress: PuzzleProgress | null): boolean {
    if (!progress?.nextReviewDate) return false;
    return new Date(progress.nextReviewDate) <= now;
  }

  if (!isOpen) return null;

  const progressPct =
    totalPuzzles > 0 ? Math.round((summary.completed / totalPuzzles) * 100) : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          zIndex: 2000,
          animation: "fadeIn 0.2s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 2001,
          backgroundColor: "#1a1a2e",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          width: "min(700px, 95vw)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          animation: "modalFadeIn 0.2s ease",
          boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #2e3a5c",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  marginBottom: "0.3rem",
                }}
              >
                {pattern && (
                  <span style={{ fontSize: "1.5rem" }}>{pattern.icon}</span>
                )}
                <h2
                  style={{
                    color: "#e2e8f0",
                    fontSize: "1.2rem",
                    fontWeight: "bold",
                    margin: 0,
                  }}
                >
                  {pattern?.name ?? theme} — Progress
                </h2>
                <span
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.8rem",
                    backgroundColor: "#0f1621",
                    border: "1px solid #2e3a5c",
                    borderRadius: "6px",
                    padding: "0.15rem 0.5rem",
                  }}
                >
                  {patternRating.rating.toLocaleString()} ELO
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    flex: 1,
                    backgroundColor: "#0d1621",
                    borderRadius: "5px",
                    height: "6px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${progressPct}%`,
                      height: "100%",
                      backgroundColor: progressPct === 100 ? "#4ade80" : "#2e75b6",
                      borderRadius: "5px",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <span
                  style={{
                    color:
                      summary.completed === 0
                        ? "#64748b"
                        : summary.completed >= totalPuzzles
                        ? "#4ade80"
                        : "#e2e8f0",
                    fontSize: "0.82rem",
                    fontWeight: "bold",
                    whiteSpace: "nowrap",
                  }}
                >
                  {summary.completed}/{totalPuzzles}
                  {summary.completed >= totalPuzzles && " ✅"}
                </span>
              </div>

              {/* Stats row */}
              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  marginTop: "0.5rem",
                  fontSize: "0.72rem",
                  color: "#64748b",
                  flexWrap: "wrap",
                }}
              >
                <span>✅ {summary.solvedFirstTry} first try</span>
                <span>🔄 {summary.solvedRetry} after retry</span>
                <span>❌ {summary.missed} missed</span>
                {summary.dueForReview > 0 && (
                  <span style={{ color: "#f59e0b" }}>
                    📅 {summary.dueForReview} due
                  </span>
                )}
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                backgroundColor: "transparent",
                border: "1px solid #2e3a5c",
                borderRadius: "8px",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "1rem",
                padding: "0.35rem 0.6rem",
                lineHeight: 1,
                flexShrink: 0,
              }}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable grid body */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            overflowY: "auto",
            flex: 1,
          }}
        >
          {/* Legend */}
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginBottom: "0.9rem",
              fontSize: "0.7rem",
              color: "#64748b",
              flexWrap: "wrap",
            }}
          >
            <span>⬜ Not attempted</span>
            <span>🟡 Incorrect</span>
            <span>🟢 Correct</span>
            <span>⚡ Met standard ({timeStandard}s)</span>
            <span>📅 Due for review</span>
          </div>

          {puzzles.length === 0 ? (
            <div
              style={{
                color: "#64748b",
                textAlign: "center",
                padding: "2rem",
                fontSize: "0.9rem",
              }}
            >
              No puzzles loaded for this pattern.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "0.4rem",
              }}
            >
              {puzzles.map((puzzle, idx) => {
                const orderIndex = idx + 1;
                const progress = getPuzzleProgress(puzzle.id);
                const due = isPuzzleDue(progress);
                const timeRecord = puzzleTimesMap[puzzle.id] ?? null;
                const metStandard = timeRecord?.metStandard ?? false;
                const icon = statusIcon(progress?.status ?? "not_attempted", due, metStandard);
                const label = statusLabel(
                  progress?.status ?? "not_attempted",
                  due,
                  timeRecord,
                  timeStandard,
                );
                const isNext = orderIndex === nextPuzzleIndex;

                // Cell background color based on status
                const cellBg = isNext ? "#162a4a"
                  : metStandard ? "#1a0d2e"  // purple tint for standard-met
                  : (progress?.status === "solved_first_try" || progress?.status === "solved_retry") ? "#0a1f12"  // green tint
                  : progress?.status === "missed" ? "#1a1200"  // yellow tint
                  : "#0f1621";  // default dark
                const cellBorder = isNext ? "#2e75b6"
                  : metStandard ? "#7c3aed"
                  : (progress?.status === "solved_first_try" || progress?.status === "solved_retry") ? "#1a4a2a"
                  : progress?.status === "missed" ? "#4a3000"
                  : "#1e2a3a";

                return (
                  <button
                    key={puzzle.id}
                    onClick={() => {
                      onNavigateToPuzzle(theme, orderIndex);
                      onClose();
                    }}
                    title={label}
                    style={{
                      backgroundColor: cellBg,
                      border: `1px solid ${cellBorder}`,
                      borderRadius: "7px",
                      padding: "0.5rem 0.65rem",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.borderColor = "#2e75b6")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.borderColor = cellBorder)
                    }
                  >
                    <span style={{ fontSize: "0.9rem" }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: "#e2e8f0",
                          fontSize: "0.75rem",
                          fontWeight: isNext ? "bold" : "normal",
                        }}
                      >
                        #{orderIndex}
                        {isNext && (
                          <span
                            style={{
                              color: "#2e75b6",
                              marginLeft: "0.3rem",
                              fontSize: "0.62rem",
                            }}
                          >
                            ← next
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          color: difficultyColor(puzzle.rating),
                          fontSize: "0.65rem",
                        }}
                      >
                        ⭐ {puzzle.rating}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer action */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid #2e3a5c",
            flexShrink: 0,
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => {
              onNavigateToPuzzle(theme, nextPuzzleIndex);
              onClose();
            }}
            style={{
              backgroundColor: "#2e75b6",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "0.65rem 1.25rem",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.85rem",
            }}
          >
            {summary.dueForReview > 0
              ? `📅 Review ${summary.dueForReview} Due`
              : `▶ Continue (Puzzle #${nextPuzzleIndex})`}
          </button>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              color: "#64748b",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.65rem 1.25rem",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Inline keyframes via style tag */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: translate(-50%, -48%); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }
      `}</style>
    </>
  );
}
