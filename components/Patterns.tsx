"use client";

import { useMemo, useState } from "react";
import patterns, { type Pattern } from "@/data/patterns";
import puzzles from "@/data/puzzles";
import { getAttempts, getAllPatternStats, getFluencyLabel, getFluencyColor, type PatternStat } from "@/lib/storage";
import { calculatePatternRank, getNextRankProgress, RANK_DEFINITIONS } from "@/lib/srs";
import {
  calcPercentile,
  topPercentLabel,
  getCommunityAvgTimeSec,
  getSubscriptionTier,
  canSeePercentile,
} from "@/lib/percentile";
import BellCurve from "./BellCurve";

// ── Color helpers ─────────────────────────────────────────────────────────

function solveRateColor(rate: number): string {
  if (rate < 0.4) return "#ef4444";
  if (rate < 0.7) return "#f59e0b";
  return "#4ade80";
}

function solveRateLabel(rate: number): string {
  if (rate < 0.4) return "Needs Work";
  if (rate < 0.7) return "Improving";
  return "Proficient";
}

const TIER_COLORS: Record<number, { accent: string; bg: string; border: string; label: string }> = {
  1: { accent: "#22c55e", bg: "#0a1f12", border: "#1a4a2a", label: "Basic" },
  2: { accent: "#f59e0b", bg: "#1a1508", border: "#4a3a0a", label: "Intermediate" },
  3: { accent: "#a855f7", bg: "#150e1f", border: "#3a1f5a", label: "Advanced" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Legacy stats (from static puzzles) ────────────────────────────────────

interface LegacyPatternStats {
  total: number;
  solved: number;
  attemptCount: number;
}

function getLegacyPatternStats(pattern: Pattern): LegacyPatternStats {
  const attempts = getAttempts();
  const matching = puzzles.filter((p) =>
    pattern.themes.includes(p.theme.toUpperCase())
  );
  const total = matching.length;
  const solvedIds = new Set(
    attempts.filter((a) => a.outcome === "solved").map((a) => a.puzzleId)
  );
  const solved = matching.filter((p) => solvedIds.has(p.id)).length;
  const attemptCount = attempts.filter((a) =>
    matching.some((p) => p.id === a.puzzleId)
  ).length;
  return { total, solved, attemptCount };
}

// ── Sparkline ────────────────────────────────────────────────────────────

function Sparkline({ times, width = 80, height = 24 }: { times: number[]; width?: number; height?: number }) {
  if (times.length < 2) return null;
  const max = Math.max(...times);
  const min = Math.min(...times);
  const range = max - min || 1;
  const points = times.map((t, i) => {
    const x = (i / (times.length - 1)) * width;
    const y = height - ((t - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline
        points={points}
        fill="none"
        stroke="#4ade80"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Rank Badge ────────────────────────────────────────────────────────────

function RankBadge({ rank, size = "small" }: { rank: string; size?: "small" | "large" }) {
  const def = RANK_DEFINITIONS.find((r) => r.rank === rank);
  if (!def) return null;
  return (
    <span style={{
      backgroundColor: `${def.color}20`,
      color: def.color,
      border: `1px solid ${def.color}50`,
      borderRadius: "5px",
      padding: size === "small" ? "0.1rem 0.4rem" : "0.3rem 0.75rem",
      fontSize: size === "small" ? "0.65rem" : "0.85rem",
      fontWeight: "bold",
      display: "inline-flex",
      alignItems: "center",
      gap: "0.25rem",
    }}>
      {def.emoji} {def.rank}
    </span>
  );
}

// ── Pattern Card ──────────────────────────────────────────────────────────

function PatternCard({
  pattern,
  sm2Stat,
  locked,
  lockMessage,
  subscriptionTier,
}: {
  pattern: Pattern;
  sm2Stat?: PatternStat;
  locked: boolean;
  lockMessage?: string;
  subscriptionTier: ReturnType<typeof getSubscriptionTier>;
}) {
  const [expanded, setExpanded] = useState(false);
  const legacyStats = useMemo(() => getLegacyPatternStats(pattern), [pattern]);
  const colors = TIER_COLORS[pattern.tier];

  const hasSM2 = sm2Stat && sm2Stat.totalAttempts > 0;
  const solveRate = hasSM2 ? sm2Stat.solveRate : 0;
  const totalAttempts = hasSM2 ? sm2Stat.totalAttempts : legacyStats.attemptCount;
  const dueCount = hasSM2 ? sm2Stat.dueCount : 0;
  const lastPracticed = hasSM2 ? sm2Stat.lastPracticed : null;
  const avgSolveTimeMs = hasSM2 ? sm2Stat.avgSolveTimeMs : null;
  const personalBestMs = hasSM2 ? sm2Stat.personalBestMs : null;
  const recentSolveTimes = hasSM2 ? sm2Stat.recentSolveTimes : [];
  const fluencyScore = hasSM2 ? sm2Stat.fluencyScore : null;
  const rateColor = solveRateColor(solveRate);
  const rateLabel = solveRateLabel(solveRate);
  const legacyMastered = legacyStats.total > 0 && legacyStats.solved === legacyStats.total;

  // Pattern rank
  const rank = calculatePatternRank(totalAttempts, solveRate, avgSolveTimeMs);
  const nextProgress = getNextRankProgress(totalAttempts, solveRate, avgSolveTimeMs);

  // Sprint 8: Percentile data
  const MIN_ATTEMPTS_FOR_PERCENTILE = 10;
  const canShowPercentile = canSeePercentile(subscriptionTier, pattern.tier);
  const hasEnoughAttempts = (sm2Stat?.totalAttempts ?? 0) >= MIN_ATTEMPTS_FOR_PERCENTILE;
  const percentile = canShowPercentile && hasEnoughAttempts && hasSM2
    ? calcPercentile(pattern.name, solveRate)
    : null;
  const communityAvgSec = getCommunityAvgTimeSec(pattern.name);

  if (locked) {
    return (
      <div style={{
        backgroundColor: "#0f1219",
        border: "1px solid #1e2a3a",
        borderRadius: "12px",
        padding: "1.25rem",
        opacity: 0.75,
        cursor: "default",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.5rem", filter: "grayscale(100%)" }}>{pattern.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "#64748b", fontWeight: "bold", fontSize: "0.95rem" }}>
                🔒 {pattern.name}
              </span>
            </div>
            <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.25rem" }}>
              {lockMessage ?? "Complete previous tier to unlock"}
            </div>
            {/* Sprint 8: Social proof on locked cards */}
            <div style={{
              color: "#f59e0b",
              fontSize: "0.7rem",
              marginTop: "0.5rem",
              backgroundColor: "#1a1508",
              borderRadius: "4px",
              padding: "0.3rem 0.5rem",
              display: "inline-block",
            }}>
              📈 Improver users who master this pattern gain an average of +43 rating points
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "#1a1a2e",
        border: `1px solid ${legacyMastered ? colors.accent : "#2e3a5c"}`,
        borderRadius: "12px",
        padding: "1.25rem",
        cursor: "pointer",
        transition: "border-color 0.2s",
      }}
      onClick={() => setExpanded((e) => !e)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
          <span style={{ fontSize: "1.5rem" }}>{pattern.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem" }}>
                {pattern.name}
              </span>
              {legacyMastered && (
                <span style={{ backgroundColor: colors.bg, color: colors.accent, border: `1px solid ${colors.border}`, borderRadius: "4px", padding: "0.1rem 0.4rem", fontSize: "0.65rem", fontWeight: "bold" }}>
                  MASTERED
                </span>
              )}
              {hasSM2 && (
                <span style={{ backgroundColor: "#162030", color: rateColor, border: `1px solid ${rateColor}40`, borderRadius: "4px", padding: "0.1rem 0.4rem", fontSize: "0.65rem", fontWeight: "bold" }}>
                  {rateLabel}
                </span>
              )}
              {/* Rank Badge */}
              {totalAttempts > 0 && <RankBadge rank={rank} />}
              {/* Sprint 8: Percentile badge */}
              {canShowPercentile && hasEnoughAttempts && percentile !== null && (
                <span style={{
                  backgroundColor: "#0a1f12",
                  color: "#4ade80",
                  border: "1px solid #1a4a2a",
                  borderRadius: "4px",
                  padding: "0.1rem 0.4rem",
                  fontSize: "0.65rem",
                  fontWeight: "bold",
                }}>
                  {topPercentLabel(percentile)}
                </span>
              )}
              {/* Sprint 10: Fluency score badge */}
              {fluencyScore !== null && (
                <span style={{
                  backgroundColor: `${getFluencyColor(fluencyScore)}18`,
                  color: getFluencyColor(fluencyScore),
                  border: `1px solid ${getFluencyColor(fluencyScore)}50`,
                  borderRadius: "4px",
                  padding: "0.1rem 0.4rem",
                  fontSize: "0.65rem",
                  fontWeight: "bold",
                }}
                >
                  {getFluencyLabel(fluencyScore)} {fluencyScore}
                </span>
              )}
              {/* Free user teaser on unlocked patterns */}
              {subscriptionTier === "free" && totalAttempts >= MIN_ATTEMPTS_FOR_PERCENTILE && (
                <span style={{
                  backgroundColor: "#1a1508",
                  color: "#f59e0b",
                  border: "1px solid #4a3a0a",
                  borderRadius: "4px",
                  padding: "0.1rem 0.4rem",
                  fontSize: "0.62rem",
                  cursor: "help",
                }}
                  title="Upgrade to see how you rank against other players"
                >
                  📊 Rank hidden
                </span>
              )}
            </div>

            {hasSM2 ? (
              <div style={{ marginTop: "0.6rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.72rem" }}>
                    {sm2Stat!.solvedFirstTry}/{sm2Stat!.totalAttempts} solved first try
                  </span>
                  <span style={{ color: rateColor, fontSize: "0.72rem", fontWeight: "bold" }}>
                    {Math.round(solveRate * 100)}%
                  </span>
                </div>
                <div style={{ backgroundColor: "#0d1621", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.round(solveRate * 100)}%`,
                    height: "100%",
                    backgroundColor: rateColor,
                    borderRadius: "4px",
                    transition: "width 0.4s ease",
                  }} />
                </div>
              </div>
            ) : legacyStats.total > 0 ? (
              <div style={{ marginTop: "0.6rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.72rem" }}>{legacyStats.solved}/{legacyStats.total} puzzles solved</span>
                  <span style={{ color: "#94a3b8", fontSize: "0.72rem" }}>{legacyStats.total === 0 ? 0 : Math.round((legacyStats.solved / legacyStats.total) * 100)}%</span>
                </div>
                <div style={{ backgroundColor: "#0d1621", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                  <div style={{
                    width: `${legacyStats.total === 0 ? 0 : Math.round((legacyStats.solved / legacyStats.total) * 100)}%`,
                    height: "100%",
                    backgroundColor: "#2e75b6",
                    borderRadius: "4px",
                  }} />
                </div>
              </div>
            ) : (
              <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.4rem" }}>No puzzles attempted yet</div>
            )}

            {/* Next rank progress */}
            {nextProgress && totalAttempts > 0 && (
              <div style={{ color: "#64748b", fontSize: "0.68rem", marginTop: "0.3rem" }}>
                {nextProgress.message}
              </div>
            )}
          </div>
        </div>
        <span style={{ color: "#475569", fontSize: "0.8rem", flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: "0.85rem", paddingTop: "0.85rem", borderTop: "1px solid #2e3a5c" }}>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.6, margin: 0, marginBottom: "0.75rem" }}>
            {pattern.description}
          </p>

          {/* Sprint 8: Percentile detail section */}
          {canShowPercentile && hasSM2 && (
            <div style={{ marginBottom: "0.85rem" }}>
              {hasEnoughAttempts && percentile !== null ? (
                <div style={{
                  backgroundColor: "#0a1520",
                  border: "1px solid #1e3a5c",
                  borderRadius: "8px",
                  padding: "0.85rem",
                  marginBottom: "0.5rem",
                }}>
                  <div style={{ color: "#4ade80", fontSize: "1rem", fontWeight: "bold", marginBottom: "0.3rem" }}>
                    You&apos;re in the {topPercentLabel(percentile)} for {pattern.name}
                  </div>
                  <BellCurve
                    patternName={pattern.name}
                    userSolveRate={solveRate}
                    percentile={percentile}
                    width={280}
                    height={110}
                  />
                  {communityAvgSec !== null && (
                    <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: "0.5rem" }}>
                      Players at your level average ~{communityAvgSec}s on this pattern
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: "#475569", fontSize: "0.75rem", marginBottom: "0.5rem", fontStyle: "italic" }}>
                  📊 Not enough data yet — solve {MIN_ATTEMPTS_FOR_PERCENTILE - (sm2Stat?.totalAttempts ?? 0)} more puzzles to see your percentile rank
                </div>
              )}
            </div>
          )}

          {/* Free user upgrade teaser in expanded view */}
          {subscriptionTier === "free" && totalAttempts >= MIN_ATTEMPTS_FOR_PERCENTILE && (
            <div style={{
              backgroundColor: "#1a1508",
              border: "1px solid #4a3a0a",
              borderRadius: "8px",
              padding: "0.7rem",
              marginBottom: "0.75rem",
              fontSize: "0.78rem",
              color: "#94a3b8",
            }}>
              📊 <a href="/pricing" style={{ color: "#f59e0b", textDecoration: "none", fontWeight: "bold" }}>Upgrade to see how you rank against other players</a>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.2rem" }}>TOTAL ATTEMPTS</div>
              <div style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "bold" }}>{totalAttempts}</div>
            </div>
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.2rem" }}>SOLVE RATE</div>
              <div style={{ color: rateColor, fontSize: "1rem", fontWeight: "bold" }}>
                {hasSM2 ? `${Math.round(solveRate * 100)}%` : "—"}
              </div>
            </div>
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.2rem" }}>AVG SOLVE TIME</div>
              <div style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "bold" }}>{formatTime(avgSolveTimeMs)}</div>
            </div>
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.2rem" }}>PERSONAL BEST</div>
              <div style={{ color: personalBestMs ? "#4ade80" : "#e2e8f0", fontSize: "1rem", fontWeight: "bold" }}>
                {formatTime(personalBestMs)} {personalBestMs ? "⚡" : ""}
              </div>
            </div>
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.2rem" }}>DUE FOR REVIEW</div>
              <div style={{ color: dueCount > 0 ? "#f59e0b" : "#4ade80", fontSize: "1rem", fontWeight: "bold" }}>
                {dueCount > 0 ? `${dueCount} puzzle${dueCount !== 1 ? "s" : ""}` : "None"}
              </div>
            </div>
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.2rem" }}>MASTERY RANK</div>
              <div style={{ fontSize: "0.9rem" }}><RankBadge rank={rank} size="large" /></div>
            </div>
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.2rem" }}>LAST PRACTICED</div>
              <div style={{ color: "#e2e8f0", fontSize: "0.85rem", fontWeight: "bold" }}>{formatDate(lastPracticed)}</div>
            </div>
            {/* Sprint 10: Fluency Score detail */}
            {fluencyScore !== null && (
              <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
                <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.2rem" }}>FLUENCY SCORE</div>
                <div style={{ color: getFluencyColor(fluencyScore), fontSize: "1rem", fontWeight: "bold" }}>
                  {fluencyScore}/100 — {getFluencyLabel(fluencyScore)}
                </div>
              </div>
            )}
          </div>

          {/* Sprint 10: Sparkline of last 20 solve times */}
          {recentSolveTimes.length >= 2 && (
            <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.7rem 0.75rem", marginTop: "0.5rem" }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.5rem" }}>
                LAST {recentSolveTimes.length} SOLVE TIMES (first-try)
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Sparkline times={recentSolveTimes} width={120} height={28} />
                <div style={{ color: "#64748b", fontSize: "0.7rem" }}>
                  {recentSolveTimes.length >= 2 && (() => {
                    const firstHalf = recentSolveTimes.slice(0, Math.floor(recentSolveTimes.length / 2));
                    const secondHalf = recentSolveTimes.slice(Math.floor(recentSolveTimes.length / 2));
                    const avgFirst = firstHalf.reduce((s, t) => s + t, 0) / firstHalf.length;
                    const avgSecond = secondHalf.reduce((s, t) => s + t, 0) / secondHalf.length;
                    const trend = avgSecond < avgFirst ? "↓ Getting faster" : avgSecond > avgFirst ? "↑ Slowing down" : "→ Consistent";
                    const trendColor = avgSecond < avgFirst ? "#4ade80" : avgSecond > avgFirst ? "#f59e0b" : "#94a3b8";
                    return <span style={{ color: trendColor }}>{trend}</span>;
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tier Section ──────────────────────────────────────────────────────────

function TierSection({
  tier,
  tierPatterns,
  overallStats,
  sm2Stats,
  locked,
  progressToUnlock,
  subscriptionTier,
}: {
  tier: number;
  tierPatterns: Pattern[];
  overallStats: { total: number; solved: number };
  sm2Stats: Map<string, PatternStat>;
  locked: boolean;
  progressToUnlock?: { at70: number; total: number; prevTier: number };
  subscriptionTier: ReturnType<typeof getSubscriptionTier>;
}) {
  const colors = TIER_COLORS[tier];
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
        <div style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "0.3rem 0.85rem", color: colors.accent, fontSize: "0.8rem", fontWeight: "bold", letterSpacing: "0.05em" }}>
          TIER {tier} — {colors.label.toUpperCase()}
        </div>
        <span style={{ color: "#475569", fontSize: "0.8rem" }}>
          {overallStats.solved}/{overallStats.total} classic puzzles solved
        </span>
        {locked && <span style={{ color: "#ef4444", fontSize: "0.75rem", fontWeight: "bold" }}>🔒 LOCKED</span>}
      </div>

      {/* Unlock progress bar */}
      {locked && progressToUnlock && (
        <div style={{
          backgroundColor: "#1a1a2e",
          border: "1px solid #2e3a5c",
          borderRadius: "10px",
          padding: "0.9rem 1.25rem",
          marginBottom: "0.75rem",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
            <span style={{ color: "#e2e8f0", fontSize: "0.85rem" }}>
              Tier {progressToUnlock.prevTier}: {progressToUnlock.at70}/{progressToUnlock.total} patterns at 70%+
            </span>
            <span style={{ color: "#f59e0b", fontSize: "0.8rem" }}>
              {progressToUnlock.total - progressToUnlock.at70} more to unlock Tier {tier}
            </span>
          </div>
          <div style={{ backgroundColor: "#0d1621", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
            <div style={{
              width: `${(progressToUnlock.at70 / progressToUnlock.total) * 100}%`,
              height: "100%",
              backgroundColor: "#f59e0b",
              borderRadius: "4px",
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "0.75rem" }}>
        {tierPatterns.map((p) => {
          const sm2Stat = sm2Stats.get(p.name.toUpperCase());
          return (
            <PatternCard
              key={p.name}
              pattern={p}
              sm2Stat={sm2Stat}
              locked={locked}
              lockMessage={`Complete Tier ${tier - 1} to unlock`}
              subscriptionTier={subscriptionTier}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function Patterns() {
  const tiers = [1, 2, 3];
  const subscriptionTier = useMemo(() => getSubscriptionTier(), []);

  const { tierData, sm2StatsMap } = useMemo(() => {
    const allSM2Stats = getAllPatternStats();
    const sm2Map = new Map<string, PatternStat>();
    for (const stat of allSM2Stats) {
      sm2Map.set(stat.theme, stat);
    }

    const data = tiers.map((tier) => {
      const tierPatterns = patterns.filter((p) => p.tier === tier);
      const attempts = getAttempts();
      const solvedIds = new Set(
        attempts.filter((a) => a.outcome === "solved").map((a) => a.puzzleId)
      );
      let totalPuzzles = 0;
      let solvedPuzzles = 0;
      tierPatterns.forEach((pattern) => {
        const matching = puzzles.filter((p) =>
          pattern.themes.includes(p.theme.toUpperCase())
        );
        totalPuzzles += matching.length;
        solvedPuzzles += matching.filter((p) => solvedIds.has(p.id)).length;
      });
      return { tier, tierPatterns, total: totalPuzzles, solved: solvedPuzzles };
    });

    return { tierData: data, sm2StatsMap: sm2Map };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate tier progression lockout
  const tierLockInfo = useMemo(() => {
    const result: Record<number, { locked: boolean; progress?: { at70: number; total: number; prevTier: number } }> = {};

    for (const tier of [2, 3]) {
      const prevTier = tier - 1;
      const prevTierPatterns = patterns.filter((p) => p.tier === prevTier);
      const totalPatterns = prevTierPatterns.length;
      let at70Count = 0;

      for (const pattern of prevTierPatterns) {
        const stat = sm2StatsMap.get(pattern.name.toUpperCase());
        const solveRate = stat ? stat.solveRate : 0;
        if (solveRate >= 0.7) at70Count++;
      }

      const locked = at70Count < totalPatterns;
      result[tier] = {
        locked,
        progress: locked ? { at70: at70Count, total: totalPatterns, prevTier } : undefined,
      };
    }

    return result;
  }, [sm2StatsMap]);

  const grandTotal = tierData.reduce((s, t) => s + t.total, 0);
  const grandSolved = tierData.reduce((s, t) => s + t.solved, 0);

  const allSM2 = useMemo(() => getAllPatternStats(), []);
  const totalSM2Attempts = allSM2.reduce((sum, s) => sum + s.totalAttempts, 0);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold" }}>Tactical Patterns</h1>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          <span style={{ color: "#64748b", fontSize: "0.9rem" }}>{grandSolved}/{grandTotal} classic solved</span>
          {totalSM2Attempts > 0 && (
            <span style={{ color: "#4ade80", fontSize: "0.9rem" }}>{totalSM2Attempts} Lichess attempts tracked</span>
          )}
        </div>
      </div>
      {tierData.map(({ tier, tierPatterns, total, solved }) => (
        <TierSection
          key={tier}
          tier={tier}
          tierPatterns={tierPatterns}
          overallStats={{ total, solved }}
          sm2Stats={sm2StatsMap}
          locked={tier > 1 ? (tierLockInfo[tier]?.locked ?? false) : false}
          progressToUnlock={tierLockInfo[tier]?.progress}
          subscriptionTier={subscriptionTier}
        />
      ))}
    </div>
  );
}
