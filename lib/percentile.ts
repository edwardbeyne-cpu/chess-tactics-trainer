import { isBetaTester } from "@/lib/beta";

/**
 * Sprint 8 — Per-Pattern Percentile Rankings
 *
 * Uses a seed distribution (normal curve, mean ~55% solve rate, std dev ~15%)
 * per pattern. Replace `SEED_DISTRIBUTIONS` with real Supabase aggregate data later.
 *
 * Tier gating:
 *   Free:     No percentile. Teaser only.
 *   Improver: Tier 1 patterns only.
 *   Serious:  All 28 patterns.
 */

// ── Seed distribution per pattern ────────────────────────────────────────
// Each entry: mean solve rate and std dev for that pattern community distribution.
// Avg solve time in seconds (community median).
// Generated from realistic chess pedagogy estimates.

export interface PatternSeedData {
  patternName: string;
  meanSolveRate: number;    // 0-1
  stdDevSolveRate: number;  // 0-1
  avgSolveTimeSec: number;  // community median seconds at user level
}

export const PATTERN_SEED_DATA: PatternSeedData[] = [
  // Tier 1 — Basic Tactics
  { patternName: "Fork",                 meanSolveRate: 0.60, stdDevSolveRate: 0.14, avgSolveTimeSec: 18 },
  { patternName: "Pin",                  meanSolveRate: 0.58, stdDevSolveRate: 0.15, avgSolveTimeSec: 22 },
  { patternName: "Skewer",               meanSolveRate: 0.57, stdDevSolveRate: 0.14, avgSolveTimeSec: 20 },
  { patternName: "Discovered Attack",    meanSolveRate: 0.53, stdDevSolveRate: 0.16, avgSolveTimeSec: 28 },
  { patternName: "Back Rank Mate",       meanSolveRate: 0.62, stdDevSolveRate: 0.13, avgSolveTimeSec: 15 },
  { patternName: "Smothered Mate",       meanSolveRate: 0.55, stdDevSolveRate: 0.15, avgSolveTimeSec: 24 },
  { patternName: "Double Check",         meanSolveRate: 0.52, stdDevSolveRate: 0.16, avgSolveTimeSec: 26 },
  { patternName: "Overloading",          meanSolveRate: 0.50, stdDevSolveRate: 0.16, avgSolveTimeSec: 32 },
  // Tier 2 — Intermediate
  { patternName: "Greek Gift Sacrifice", meanSolveRate: 0.48, stdDevSolveRate: 0.17, avgSolveTimeSec: 40 },
  { patternName: "Zwischenzug",          meanSolveRate: 0.45, stdDevSolveRate: 0.17, avgSolveTimeSec: 38 },
  { patternName: "Deflection",           meanSolveRate: 0.51, stdDevSolveRate: 0.16, avgSolveTimeSec: 35 },
  { patternName: "Decoy",                meanSolveRate: 0.49, stdDevSolveRate: 0.16, avgSolveTimeSec: 36 },
  { patternName: "X-Ray Attack",         meanSolveRate: 0.47, stdDevSolveRate: 0.17, avgSolveTimeSec: 42 },
  { patternName: "Removing the Defender",meanSolveRate: 0.50, stdDevSolveRate: 0.16, avgSolveTimeSec: 38 },
  { patternName: "Interference",         meanSolveRate: 0.44, stdDevSolveRate: 0.17, avgSolveTimeSec: 45 },
  { patternName: "Perpetual Check",      meanSolveRate: 0.58, stdDevSolveRate: 0.15, avgSolveTimeSec: 22 },
  // Tier 3 — Advanced
  { patternName: "Windmill",             meanSolveRate: 0.42, stdDevSolveRate: 0.18, avgSolveTimeSec: 55 },
  { patternName: "Zugzwang",             meanSolveRate: 0.38, stdDevSolveRate: 0.18, avgSolveTimeSec: 65 },
  { patternName: "Rook Lift",            meanSolveRate: 0.46, stdDevSolveRate: 0.17, avgSolveTimeSec: 50 },
  { patternName: "Queen Sacrifice",      meanSolveRate: 0.40, stdDevSolveRate: 0.18, avgSolveTimeSec: 60 },
  { patternName: "Positional Sacrifice", meanSolveRate: 0.38, stdDevSolveRate: 0.18, avgSolveTimeSec: 70 },
  { patternName: "Trapped Piece",        meanSolveRate: 0.52, stdDevSolveRate: 0.16, avgSolveTimeSec: 35 },
  { patternName: "Fortress",             meanSolveRate: 0.36, stdDevSolveRate: 0.18, avgSolveTimeSec: 75 },
  { patternName: "King March",           meanSolveRate: 0.39, stdDevSolveRate: 0.17, avgSolveTimeSec: 68 },
];

// ── Normal CDF approximation (Abramowitz & Stegun) ───────────────────────

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 +
            t * 1.330274429))));
  const result = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  return x >= 0 ? result : 1 - result;
}

/**
 * Calculate user's percentile rank for a pattern.
 * Returns 0-100 (higher = better). E.g., 85 = better than 85% of users.
 *
 * @param patternName  Pattern name (matches PATTERN_SEED_DATA)
 * @param userSolveRate  User's solve rate 0-1
 * @returns percentile 0-100 or null if pattern not found
 */
export function calcPercentile(patternName: string, userSolveRate: number): number | null {
  const seed = PATTERN_SEED_DATA.find(
    (d) => d.patternName.toLowerCase() === patternName.toLowerCase()
  );
  if (!seed) return null;

  const z = (userSolveRate - seed.meanSolveRate) / seed.stdDevSolveRate;
  const percentile = Math.round(normalCDF(z) * 100);
  return Math.max(1, Math.min(99, percentile));
}

/**
 * "Top X%" framing: if percentile = 85, user is in "top 15%"
 */
export function topPercentLabel(percentile: number): string {
  const top = 100 - percentile;
  return `Top ${top}%`;
}

/**
 * "Better than X%" framing: percentile = 85 → "Better than 85%"
 */
export function betterThanLabel(percentile: number): string {
  return `Better than ${percentile}%`;
}

/**
 * Get community average solve time for a pattern.
 */
export function getCommunityAvgTimeSec(patternName: string): number | null {
  const seed = PATTERN_SEED_DATA.find(
    (d) => d.patternName.toLowerCase() === patternName.toLowerCase()
  );
  return seed ? seed.avgSolveTimeSec : null;
}

/**
 * Get bell curve data points for SVG rendering.
 * Returns array of {x, y} normalized 0-1 for rendering a bell curve
 * with a marker at the user's solve rate position.
 *
 * @param patternName  Pattern name
 * @param userSolveRate  User's solve rate
 * @param points  Number of SVG data points (default 60)
 */
export interface BellCurvePoint {
  x: number; // 0-1 (normalized solve rate domain 0-1)
  y: number; // 0-1 (normalized density)
}

export function getBellCurvePoints(
  patternName: string,
  userSolveRate: number,
  points = 60
): { curve: BellCurvePoint[]; userX: number; userY: number; mean: number } | null {
  const seed = PATTERN_SEED_DATA.find(
    (d) => d.patternName.toLowerCase() === patternName.toLowerCase()
  );
  if (!seed) return null;

  const { meanSolveRate: mean, stdDevSolveRate: std } = seed;

  // Domain: mean ± 3.5 std, clamped to [0, 1]
  const domainMin = Math.max(0, mean - 3.5 * std);
  const domainMax = Math.min(1, mean + 3.5 * std);

  function gaussianPDF(x: number): number {
    return Math.exp(-0.5 * ((x - mean) / std) ** 2) / (std * Math.sqrt(2 * Math.PI));
  }

  const rawPoints: BellCurvePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const x = domainMin + (i / points) * (domainMax - domainMin);
    rawPoints.push({ x, y: gaussianPDF(x) });
  }

  const maxY = Math.max(...rawPoints.map((p) => p.y));
  const curve: BellCurvePoint[] = rawPoints.map((p) => ({
    x: (p.x - domainMin) / (domainMax - domainMin), // normalize to 0-1
    y: p.y / maxY, // normalize to 0-1
  }));

  // User marker position
  const clampedUserX = Math.max(domainMin, Math.min(domainMax, userSolveRate));
  const userXNorm = (clampedUserX - domainMin) / (domainMax - domainMin);
  const userYNorm = gaussianPDF(clampedUserX) / maxY;

  // Mean position
  const meanNorm = (mean - domainMin) / (domainMax - domainMin);

  return { curve, userX: userXNorm, userY: userYNorm, mean: meanNorm };
}

// ── Tier gating for percentile access ────────────────────────────────────

export type SubscriptionTier = "free" | "improver" | "serious";

export function getSubscriptionTier(): SubscriptionTier {
  if (typeof window === "undefined") return "free";
  if (isBetaTester()) return "serious";
  const status = localStorage.getItem("subscription_status");
  if (status === "active") return "serious"; // legacy flag — treat as serious
  if (status === "improver") return "improver";
  if (status === "serious") return "serious";
  // Trial users get improver-level access
  const trialStart = localStorage.getItem("trial_start");
  if (trialStart) return "improver";
  return "free";
}

/**
 * Can user see percentile for a given pattern tier?
 */
export function canSeePercentile(
  subscriptionTier: SubscriptionTier,
  patternTier: number
): boolean {
  if (subscriptionTier === "free") return false;
  if (subscriptionTier === "improver") return patternTier === 1;
  return true; // serious: all tiers
}
