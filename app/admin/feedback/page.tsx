"use client";

import { useEffect, useState } from "react";
import { getFeedbackResponses, type FeedbackResponse } from "@/lib/feedback";

export default function AdminFeedbackPage() {
  const [responses, setResponses] = useState<FeedbackResponse[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const data = getFeedbackResponses();
    // Newest first
    setResponses([...data].reverse());
    setLoaded(true);
  }, []);

  const levelColor = (level: string) => {
    if (level === "Advanced") return "#4ade80";
    if (level === "Intermediate") return "#f59e0b";
    return "#94a3b8";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0f0f1a",
        color: "#e2e8f0",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "2rem",
        maxWidth: "860px",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
          /admin/feedback — no auth required (beta)
        </div>
        <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: "bold" }}>
          📋 Beta Feedback
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0.4rem 0 0" }}>
          {loaded ? `${responses.length} response${responses.length !== 1 ? "s" : ""} collected` : "Loading…"}
        </p>
      </div>

      {/* Level breakdown */}
      {loaded && responses.length > 0 && (
        <LevelBreakdown responses={responses} />
      )}

      {/* Responses list */}
      {loaded && responses.length === 0 && (
        <div
          style={{
            backgroundColor: "#1a1a2e",
            border: "1px solid #2e3a5c",
            borderRadius: "12px",
            padding: "2rem",
            textAlign: "center",
            color: "#475569",
          }}
        >
          No feedback submitted yet. Share the app with beta users and ask them to use the{" "}
          <strong style={{ color: "#94a3b8" }}>💬 Give Feedback</strong> button.
        </div>
      )}

      {loaded &&
        responses.map((r, idx) => (
          <FeedbackCard key={r.id} response={r} index={responses.length - idx} levelColor={levelColor} />
        ))}
    </div>
  );
}

function LevelBreakdown({ responses }: { responses: FeedbackResponse[] }) {
  const counts = { Beginner: 0, Intermediate: 0, Advanced: 0 };
  for (const r of responses) {
    if (r.chessLevel in counts) counts[r.chessLevel]++;
  }
  const total = responses.length;

  return (
    <div
      style={{
        backgroundColor: "#13132b",
        border: "1px solid #2e3a5c",
        borderRadius: "12px",
        padding: "1.25rem 1.5rem",
        marginBottom: "1.5rem",
        display: "flex",
        gap: "2rem",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: "bold" }}>LEVEL BREAKDOWN</span>
      {(["Beginner", "Intermediate", "Advanced"] as const).map((level) => {
        const count = counts[level];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const color = level === "Advanced" ? "#4ade80" : level === "Intermediate" ? "#f59e0b" : "#94a3b8";
        return (
          <div key={level} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ color, fontWeight: "bold", fontSize: "1.1rem" }}>{count}</span>
            <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
              {level} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FeedbackCard({
  response,
  index,
  levelColor,
}: {
  response: FeedbackResponse;
  index: number;
  levelColor: (l: string) => string;
}) {
  const [expanded, setExpanded] = useState(true);

  const fieldLabel: React.CSSProperties = {
    color: "#64748b",
    fontSize: "0.7rem",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.25rem",
    marginTop: "0.75rem",
  };

  const fieldValue: React.CSSProperties = {
    color: "#cbd5e1",
    fontSize: "0.875rem",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  };

  const date = new Date(response.submittedAt);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #2e3a5c",
        borderRadius: "12px",
        marginBottom: "1rem",
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "1rem 1.25rem",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ color: "#475569", fontSize: "0.8rem", fontWeight: "bold" }}>#{index}</span>
          <span
            style={{
              backgroundColor: "#0f0f1a",
              border: `1px solid ${levelColor(response.chessLevel)}`,
              borderRadius: "20px",
              padding: "0.2rem 0.6rem",
              fontSize: "0.75rem",
              color: levelColor(response.chessLevel),
              fontWeight: "bold",
            }}
          >
            {response.chessLevel}
          </span>
          <span style={{ color: "#475569", fontSize: "0.75rem" }}>{dateStr}</span>
        </div>
        <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Card body */}
      {expanded && (
        <div style={{ padding: "0 1.25rem 1.25rem", borderTop: "1px solid #1e293b" }}>
          {response.likedMost && (
            <>
              <p style={fieldLabel}>What they liked most</p>
              <p style={fieldValue}>{response.likedMost}</p>
            </>
          )}
          {response.frustrated && (
            <>
              <p style={fieldLabel}>What frustrated them</p>
              <p style={fieldValue}>{response.frustrated}</p>
            </>
          )}
          {response.patternDifference && (
            <>
              <p style={fieldLabel}>Pattern-based approach vs. other trainers</p>
              <p style={fieldValue}>{response.patternDifference}</p>
            </>
          )}
          {response.wouldPay && (
            <>
              <p style={fieldLabel}>Would they pay?</p>
              <p style={fieldValue}>{response.wouldPay}</p>
            </>
          )}
          {!response.likedMost && !response.frustrated && !response.patternDifference && !response.wouldPay && (
            <p style={{ color: "#475569", fontSize: "0.8rem", marginTop: "0.75rem" }}>
              (No open-ended answers provided)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
