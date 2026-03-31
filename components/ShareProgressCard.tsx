"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getActivityLog,
  getAllPatternStats,
  getTacticsRatingData,
  getPuzzlesSolvedAllTime,
  getSM2Attempts,
} from "@/lib/storage";
import patterns from "@/data/patterns";

// ── Types ─────────────────────────────────────────────────────────────────

interface CardData {
  currentRating: number;
  startRating: number;
  ratingGain: number;
  totalSolved: number;
  daysTrained: number;
  accuracy: number; // 0–100
  biggestImprovement: { name: string; earlyPct: number; recentPct: number } | null;
  trainingSince: string; // "March 2026"
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getCardData(): CardData {
  const tacticsData = getTacticsRatingData();
  const currentRating = tacticsData.tacticsRating;

  const startRatingRaw = parseInt(
    typeof window !== "undefined"
      ? (localStorage.getItem("ctt_goal_start_rating") ?? "800")
      : "800",
    10
  );
  const startRating = isNaN(startRatingRaw) ? 800 : startRatingRaw;
  const ratingGain = Math.max(0, currentRating - startRating);

  const activityLog = getActivityLog();
  const daysTrained = activityLog.length;

  const totalSolved = getPuzzlesSolvedAllTime();
  const sm2 = getSM2Attempts();
  const totalAttempts = sm2.length;
  const correct = sm2.filter((a) => a.outcome === "solved-first-try").length;
  const accuracy = totalAttempts > 0 ? Math.round((correct / totalAttempts) * 100) : 0;

  // Training since: first entry in activity log
  let trainingSince = "";
  if (activityLog.length > 0) {
    const sorted = [...activityLog].sort();
    const firstDate = new Date(sorted[0]);
    trainingSince = firstDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } else if (sm2.length > 0) {
    const sorted = [...sm2].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const firstDate = new Date(sorted[0].timestamp);
    trainingSince = firstDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  // Biggest pattern improvement: split each pattern's attempts into first/second half
  const patternStats = getAllPatternStats().filter((s) => s.totalAttempts >= 10);
  const improvements: Array<{ name: string; earlyPct: number; recentPct: number; delta: number }> = [];

  for (const stat of patternStats) {
    const theme = stat.theme;
    const attempts = sm2
      .filter((a) => {
        const t = a.theme?.toUpperCase() ?? "";
        return t === theme || t === theme.toUpperCase();
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (attempts.length < 10) continue;

    const half = Math.floor(attempts.length / 2);
    const early = attempts.slice(0, half);
    const recent = attempts.slice(half);

    const earlyAcc =
      early.length > 0
        ? early.filter((a) => a.outcome === "solved-first-try").length / early.length
        : 0;
    const recentAcc =
      recent.length > 0
        ? recent.filter((a) => a.outcome === "solved-first-try").length / recent.length
        : 0;

    const delta = recentAcc - earlyAcc;
    if (delta >= 0.1) {
      const patternObj = patterns.find(
        (p) =>
          p.themes[0]?.toUpperCase() === theme ||
          p.name.toUpperCase().replace(/\s+/g, "") === theme.replace(/\s+/g, "")
      );
      const name =
        patternObj?.name ??
        theme.charAt(0).toUpperCase() + theme.slice(1).toLowerCase();

      improvements.push({
        name,
        earlyPct: Math.round(earlyAcc * 100),
        recentPct: Math.round(recentAcc * 100),
        delta: Math.round(delta * 100),
      });
    }
  }

  improvements.sort((a, b) => b.delta - a.delta);
  const biggestImprovement = improvements.length > 0
    ? { name: improvements[0].name, earlyPct: improvements[0].earlyPct, recentPct: improvements[0].recentPct }
    : null;

  return {
    currentRating,
    startRating,
    ratingGain,
    totalSolved,
    daysTrained,
    accuracy,
    biggestImprovement,
    trainingSince,
  };
}

function checkThreshold(card: CardData, activityLog: string[]): boolean {
  const uniqueDays = new Set(activityLog).size;
  if (uniqueDays < 14) return false;
  if (card.totalSolved < 50) return false;
  if (!card.biggestImprovement) return false;
  return true;
}

// ── Progress Card UI (the shareable card div) ─────────────────────────────

function ProgressCardDisplay({ data }: { data: CardData }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0b1120 0%, #111827 60%, #0f1f2e 100%)",
        border: "1px solid #2e3a5c",
        borderRadius: "16px",
        padding: "28px 32px",
        width: "360px",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        color: "#e2e8f0",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        <span style={{ fontSize: "24px", lineHeight: 1 }}>♔</span>
        <div>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#e2e8f0", letterSpacing: "0.03em" }}>
            Chess Tactics Trainer
          </div>
          <div style={{ fontSize: "10px", color: "#475569", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            chesstacticstrainer.com
          </div>
        </div>
      </div>

      {/* Progress header */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "13px", color: "#4ade80", fontWeight: "700", marginBottom: "8px", letterSpacing: "0.04em" }}>
          📈 MY PROGRESS
        </div>
        <div style={{ height: "1px", background: "linear-gradient(90deg, #2e3a5c, transparent)" }} />
      </div>

      {/* Stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
        {/* Rating row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>Tactics Rating</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#e2e8f0", fontSize: "13px" }}>
              {data.startRating} → <strong style={{ color: "#4ade80" }}>{data.currentRating}</strong>
            </span>
            {data.ratingGain > 0 && (
              <span style={{
                background: "#0a1f12",
                border: "1px solid #1a4a2a",
                borderRadius: "4px",
                color: "#4ade80",
                fontSize: "11px",
                fontWeight: "700",
                padding: "1px 6px",
              }}>
                +{data.ratingGain}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>Puzzles Solved</span>
          <span style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: "600" }}>{data.totalSolved.toLocaleString()}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>Days Trained</span>
          <span style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: "600" }}>{data.daysTrained}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>Accuracy</span>
          <span style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: "600" }}>{data.accuracy}%</span>
        </div>
      </div>

      {/* Biggest improvement */}
      {data.biggestImprovement && (
        <div style={{
          background: "#0a1520",
          border: "1px solid #1e3a5c",
          borderRadius: "10px",
          padding: "12px 14px",
          marginBottom: "16px",
        }}>
          <div style={{ color: "#f59e0b", fontSize: "11px", fontWeight: "700", marginBottom: "6px", letterSpacing: "0.04em" }}>
            💪 BIGGEST IMPROVEMENT
          </div>
          <div style={{ color: "#e2e8f0", fontSize: "13px" }}>
            <strong>{data.biggestImprovement.name}</strong>{" "}
            <span style={{ color: "#64748b" }}>accuracy:</span>{" "}
            <span>{data.biggestImprovement.earlyPct}%</span>{" "}
            <span style={{ color: "#475569" }}>→</span>{" "}
            <span style={{ color: "#4ade80", fontWeight: "700" }}>{data.biggestImprovement.recentPct}%</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {data.trainingSince && (
          <div style={{ color: "#475569", fontSize: "11px" }}>
            🎯 Training since {data.trainingSince}
          </div>
        )}
        <div style={{ color: "#334155", fontSize: "10px", marginLeft: "auto" }}>
          chesstacticstrainer.com
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────

export default function ShareProgressCard() {
  const [mounted, setMounted] = useState(false);
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [linkCopied, setLinkCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const data = getCardData();
    const log = getActivityLog();
    setCardData(data);
    setActivityLog(log);
  }, []);

  const isUnlocked = useMemo(() => {
    if (!cardData) return false;
    return checkThreshold(cardData, activityLog);
  }, [cardData, activityLog]);

  // Build Twitter text
  const twitterText = useMemo(() => {
    if (!cardData) return "";
    const gain = cardData.ratingGain > 0 ? `+${cardData.ratingGain} rating points` : "chess tactics";
    const days = cardData.daysTrained;
    return `I've been training chess tactics and gained ${gain} in ${days} days 📈 chesstacticstrainer.com #chess #chesstactics`;
  }, [cardData]);

  async function handleCopyImage() {
    if (!cardRef.current) return;
    setCopyStatus("copying");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#0b1120",
        scale: 2,
        useCORS: true,
        logging: false,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) { setCopyStatus("error"); return; }
        try {
          // Try Web Share API first (mobile)
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], "chess-progress.png", { type: "image/png" })] })) {
            await navigator.share({
              files: [new File([blob], "chess-progress.png", { type: "image/png" })],
              title: "My Chess Progress",
              text: twitterText,
            });
            setCopyStatus("copied");
          } else {
            // Clipboard API
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            setCopyStatus("copied");
          }
        } catch {
          // Fallback: download PNG
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "chess-progress.png";
          a.click();
          URL.revokeObjectURL(url);
          setCopyStatus("copied");
        }
        setTimeout(() => setCopyStatus("idle"), 2500);
      }, "image/png");
    } catch {
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2500);
    }
  }

  function handleShareTwitter() {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleCopyLink() {
    const msg = `${twitterText}\n\nchesstacticstrainer.com`;
    navigator.clipboard.writeText(msg).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  if (!mounted || !cardData) return null;

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "12px",
      padding: "1.5rem",
      marginBottom: "1.5rem",
    }}>
      {/* Section header */}
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 0.25rem" }}>
          🔗 Share Your Progress
        </h2>
        <p style={{ color: "#64748b", fontSize: "0.78rem", margin: 0 }}>
          Show the chess community how you&apos;re improving
        </p>
      </div>

      {!isUnlocked ? (
        // Locked state
        <div style={{
          background: "linear-gradient(135deg, #0b1120 0%, #111827 100%)",
          border: "1px dashed #2e3a5c",
          borderRadius: "12px",
          padding: "2rem",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔒</div>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem", marginBottom: "0.5rem" }}>
            Progress Card Locked
          </div>
          <div style={{ color: "#64748b", fontSize: "0.85rem", lineHeight: 1.7, maxWidth: "360px", margin: "0 auto" }}>
            Your progress card will unlock after:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.75rem", alignItems: "center" }}>
            <UnlockRow met={activityLog.length >= 14} label={`14+ days of activity (${activityLog.length} so far)`} />
            <UnlockRow met={cardData.totalSolved >= 50} label={`50+ puzzles solved (${cardData.totalSolved} so far)`} />
            <UnlockRow
              met={!!cardData.biggestImprovement}
              label="10%+ improvement in at least one pattern"
            />
          </div>
        </div>
      ) : (
        // Unlocked state
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Card preview */}
          <div ref={cardRef} style={{ display: "inline-block" }}>
            <ProgressCardDisplay data={cardData} />
          </div>

          {/* Share buttons */}
          <div style={{ flex: 1, minWidth: "220px", display: "flex", flexDirection: "column", gap: "0.75rem", paddingTop: "8px" }}>
            <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginBottom: "0.25rem" }}>
              Share your card:
            </div>

            {/* Copy Image */}
            <button
              onClick={handleCopyImage}
              disabled={copyStatus === "copying"}
              style={{
                backgroundColor: copyStatus === "copied" ? "#0a3020" : "#1e3a5c",
                border: `1px solid ${copyStatus === "copied" ? "#1a6040" : "#2e5a8c"}`,
                borderRadius: "8px",
                color: copyStatus === "copied" ? "#4ade80" : "#e2e8f0",
                padding: "0.65rem 1rem",
                fontSize: "0.88rem",
                fontWeight: "600",
                cursor: copyStatus === "copying" ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                transition: "all 0.2s",
              }}
            >
              <span style={{ fontSize: "1rem" }}>
                {copyStatus === "copying" ? "⏳" : copyStatus === "copied" ? "✅" : copyStatus === "error" ? "❌" : "🖼️"}
              </span>
              {copyStatus === "copying"
                ? "Generating..."
                : copyStatus === "copied"
                ? "Copied to clipboard!"
                : copyStatus === "error"
                ? "Try again"
                : "Copy Image"}
            </button>

            {/* Share to Twitter */}
            <button
              onClick={handleShareTwitter}
              style={{
                backgroundColor: "#0d1f33",
                border: "1px solid #1d4060",
                borderRadius: "8px",
                color: "#60a5fa",
                padding: "0.65rem 1rem",
                fontSize: "0.88rem",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                transition: "all 0.2s",
              }}
            >
              <span style={{ fontSize: "1rem" }}>𝕏</span>
              Share to Twitter
            </button>

            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              style={{
                backgroundColor: "transparent",
                border: "1px solid #2e3a5c",
                borderRadius: "8px",
                color: linkCopied ? "#4ade80" : "#94a3b8",
                padding: "0.65rem 1rem",
                fontSize: "0.88rem",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                transition: "all 0.2s",
              }}
            >
              <span style={{ fontSize: "1rem" }}>{linkCopied ? "✅" : "🔗"}</span>
              {linkCopied ? "Copied!" : "Copy Link"}
            </button>

            {/* Preview text */}
            <div style={{
              backgroundColor: "#0a1520",
              border: "1px solid #1e2a3c",
              borderRadius: "8px",
              padding: "0.65rem 0.85rem",
              marginTop: "0.25rem",
            }}>
              <div style={{ color: "#475569", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>
                Tweet preview
              </div>
              <div style={{ color: "#64748b", fontSize: "0.75rem", lineHeight: 1.6, wordBreak: "break-word" }}>
                {twitterText}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper: unlock requirement row ────────────────────────────────────────

function UnlockRow({ met, label }: { met: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span style={{ fontSize: "0.9rem", flexShrink: 0 }}>{met ? "✅" : "⬜"}</span>
      <span style={{ color: met ? "#4ade80" : "#64748b", fontSize: "0.82rem" }}>{label}</span>
    </div>
  );
}
