"use client";

import { useMemo } from "react";
import {
  generateWeeklyReport,
  getSubscriptionTier,
  type WeeklyReportData,
} from "@/lib/storage";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function PatternBadge({ theme, solveRate, rank }: { theme: string; solveRate: number; rank: "strong" | "weak" }) {
  const pct = Math.round(solveRate * 100);
  const color = rank === "strong" ? "#4ade80" : "#ef4444";
  const bg = rank === "strong" ? "#0a1f12" : "#1a0a0a";
  const border = rank === "strong" ? "#1a4a2a" : "#ef444430";
  const label = theme.charAt(0).toUpperCase() + theme.slice(1).toLowerCase().replace(/_/g, " ");

  return (
    <div style={{
      backgroundColor: bg,
      border: `1px solid ${border}`,
      borderRadius: "8px",
      padding: "0.6rem 1rem",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "1rem",
    }}>
      <span style={{ color: "#e2e8f0", fontSize: "0.9rem" }}>{label}</span>
      <span style={{ color, fontWeight: "bold", fontSize: "0.9rem" }}>{pct}%</span>
    </div>
  );
}

function StatBox({ label, value, subtext, highlight }: { label: string; value: string | number; subtext?: string; highlight?: boolean }) {
  return (
    <div style={{
      backgroundColor: "#162030",
      borderRadius: "10px",
      padding: "1.25rem",
      textAlign: "center",
      border: highlight ? "1px solid #4ade8040" : "1px solid transparent",
    }}>
      <div style={{ color: highlight ? "#4ade80" : "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ color: "#94a3b8", fontSize: "0.78rem", marginTop: "0.4rem" }}>{label}</div>
      {subtext && <div style={{ color: "#475569", fontSize: "0.72rem", marginTop: "0.25rem" }}>{subtext}</div>}
    </div>
  );
}

function ComparisonRow({ label, thisWeek, lastWeek }: { label: string; thisWeek: number | string | null; lastWeek: number | string | null }) {
  const diff = typeof thisWeek === "number" && typeof lastWeek === "number"
    ? thisWeek - lastWeek
    : null;
  const diffColor = diff === null ? "#64748b" : diff > 0 ? "#4ade80" : diff < 0 ? "#ef4444" : "#64748b";
  const diffStr = diff === null ? "—" : diff > 0 ? `+${diff}` : `${diff}`;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 80px",
      gap: "0.5rem",
      alignItems: "center",
      padding: "0.6rem 0",
      borderBottom: "1px solid #2e3a5c",
    }}>
      <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{label}</span>
      <span style={{ color: "#e2e8f0", textAlign: "center", fontSize: "0.9rem" }}>{thisWeek ?? "—"}</span>
      <span style={{ color: "#64748b", textAlign: "center", fontSize: "0.9rem" }}>{lastWeek ?? "—"}</span>
      <span style={{ color: diffColor, textAlign: "right", fontWeight: "bold", fontSize: "0.9rem" }}>{diffStr}</span>
    </div>
  );
}

export default function WeeklyReport() {
  const tier = getSubscriptionTier();
  const report: WeeklyReportData = useMemo(() => generateWeeklyReport(), []);

  if (tier < 2) {
    return (
      <div style={{
        maxWidth: "600px",
        margin: "4rem auto",
        backgroundColor: "#1a1a2e",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        padding: "3rem 2rem",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
        <h2 style={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "1rem" }}>
          Weekly Reports — Serious Tier Only
        </h2>
        <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
          Get a personalized weekly email digest with your rating progress, pattern strengths,
          and tailored improvement tips — exclusive to the Serious plan.
        </p>
        <button
          onClick={() => { window.location.href = "/pricing"; }}
          style={{
            backgroundColor: "#4ade80",
            color: "#0f0f1a",
            padding: "0.75rem 2rem",
            borderRadius: "8px",
            border: "none",
            fontWeight: "bold",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          Upgrade to Serious
        </button>
      </div>
    );
  }

  const ratingChangeColor = report.ratingChange === null
    ? "#64748b"
    : report.ratingChange >= 0 ? "#4ade80" : "#ef4444";

  const ratingChangeStr = report.ratingChange === null
    ? "N/A"
    : report.ratingChange >= 0
      ? `+${report.ratingChange}`
      : `${report.ratingChange}`;

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", margin: 0 }}>
            📧 Weekly Report Preview
          </h1>
          <span style={{
            backgroundColor: "#0a1f12",
            border: "1px solid #1a4a2a",
            color: "#4ade80",
            fontSize: "0.7rem",
            fontWeight: "bold",
            padding: "0.2rem 0.5rem",
            borderRadius: "4px",
          }}>
            SERIOUS
          </span>
        </div>
        <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
          Week of {formatDate(report.weekStart)} – {formatDate(report.weekEnd)} ·{" "}
          <em>Email delivery coming soon — this is a preview of what you&apos;d receive.</em>
        </p>
      </div>

      {/* Email-style card */}
      <div style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        overflow: "hidden",
      }}>
        {/* Email header */}
        <div style={{
          background: "linear-gradient(135deg, #0d2218 0%, #0f1f35 100%)",
          padding: "1.5rem 2rem",
          borderBottom: "1px solid #2e3a5c",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.75rem" }}>♔</span>
            <div>
              <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "1.1rem" }}>ChessTrainer Weekly</div>
              <div style={{ color: "#64748b", fontSize: "0.8rem" }}>Your progress at a glance</div>
            </div>
          </div>
        </div>

        <div style={{ padding: "1.5rem 2rem" }}>
          {/* Key stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <StatBox
              label="Puzzles Solved"
              value={report.puzzlesSolvedThisWeek}
              subtext="this week"
              highlight={report.puzzlesSolvedThisWeek > 0}
            />
            <StatBox
              label="Rating Change"
              value={ratingChangeStr}
              subtext={report.ratingThisWeek ? `now ${report.ratingThisWeek}` : "no data yet"}
              highlight={report.ratingChange !== null && report.ratingChange > 0}
            />
            <StatBox
              label="Streak"
              value={`${report.currentStreak}🔥`}
              subtext={`best: ${report.longestStreak} days`}
              highlight={report.currentStreak > 0}
            />
          </div>

          {/* This week vs last week */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
              This Week vs Last Week
            </h3>
            <div style={{ backgroundColor: "#162030", borderRadius: "10px", padding: "0 1rem" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 80px",
                gap: "0.5rem",
                padding: "0.5rem 0",
                borderBottom: "1px solid #2e3a5c",
              }}>
                <span style={{ color: "#475569", fontSize: "0.75rem" }}></span>
                <span style={{ color: "#64748b", fontSize: "0.75rem", textAlign: "center" }}>This Week</span>
                <span style={{ color: "#475569", fontSize: "0.75rem", textAlign: "center" }}>Last Week</span>
                <span style={{ color: "#475569", fontSize: "0.75rem", textAlign: "right" }}>Change</span>
              </div>
              <ComparisonRow
                label="Puzzles Solved"
                thisWeek={report.puzzlesSolvedThisWeek}
                lastWeek={report.puzzlesSolvedLastWeek}
              />
              <ComparisonRow
                label="Tactics Rating"
                thisWeek={report.ratingThisWeek}
                lastWeek={report.ratingLastWeek}
              />
            </div>
          </div>

          {/* Strengths */}
          {report.topStrongestPatterns.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
                💪 Your Strongest Patterns
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {report.topStrongestPatterns.map((p) => (
                  <PatternBadge key={p.theme} theme={p.theme} solveRate={p.solveRate} rank="strong" />
                ))}
              </div>
            </div>
          )}

          {/* Weaknesses */}
          {report.topWeakestPatterns.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
                📉 Patterns Needing Work
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {report.topWeakestPatterns.map((p) => (
                  <PatternBadge key={p.theme} theme={p.theme} solveRate={p.solveRate} rank="weak" />
                ))}
              </div>
            </div>
          )}

          {/* No pattern data yet */}
          {report.topWeakestPatterns.length === 0 && report.topStrongestPatterns.length === 0 && (
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "1.25rem", marginBottom: "1.5rem", textAlign: "center" }}>
              <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
                No pattern data yet — solve some puzzles to see your strengths and weaknesses here!
              </div>
            </div>
          )}

          {/* Personalized tip */}
          {report.topWeakestPatterns.length > 0 && (
            <div style={{
              backgroundColor: "#0f1f35",
              border: "1px solid #2e4a6a",
              borderRadius: "10px",
              padding: "1.25rem",
              marginBottom: "1.5rem",
            }}>
              <h3 style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
                💡 Personalized Tip
              </h3>
              <p style={{ color: "#e2e8f0", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>
                {report.personalizedTip}
              </p>
              <div style={{ marginTop: "0.75rem", color: "#475569", fontSize: "0.78rem" }}>
                Based on your weakest pattern:{" "}
                <strong style={{ color: "#64748b" }}>
                  {report.topWeakestPatterns[0].theme.charAt(0).toUpperCase() +
                    report.topWeakestPatterns[0].theme.slice(1).toLowerCase().replace(/_/g, " ")}
                </strong>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{
            borderTop: "1px solid #2e3a5c",
            paddingTop: "1rem",
            textAlign: "center",
          }}>
            <div style={{ color: "#475569", fontSize: "0.75rem", lineHeight: 1.6 }}>
              📬 Email delivery is coming soon. When configured, you&apos;ll receive this report
              every Monday morning.
            </div>
            <button
              onClick={() => window.location.href = "/app/puzzles"}
              style={{
                marginTop: "1rem",
                backgroundColor: "#4ade80",
                color: "#0f0f1a",
                border: "none",
                borderRadius: "8px",
                padding: "0.6rem 1.5rem",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "0.9rem",
              }}
            >
              Practice Now →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
