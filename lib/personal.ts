/**
 * Personal edition bootstrap.
 *
 * This app trains exactly one person. Instead of an onboarding flow
 * (calibration quiz, account connect, plan selection), first run on a fresh
 * browser seeds everything from Chess.com automatically:
 *   - puzzle strength from the Chess.com tactics (puzzles) rating
 *   - identity keys for the game-analysis pipeline
 *   - sensible defaults (daily goal, full access)
 * and keeps ratings + game analysis fresh on subsequent visits.
 */

export const PERSONAL = {
  username: "eddy0302",
  platform: "chesscom" as const,
  fallbackTacticsRating: 1800,
  dailyGoal: 20,
};

const RATINGS_REFRESH_STAMP = "ctt_platform_ratings_refreshed";
const ANALYSIS_STAMP = "ctt_last_auto_analysis";
const RATINGS_REFRESH_MS = 24 * 60 * 60 * 1000; // daily
const ANALYSIS_REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // weekly

interface ChessComStats {
  tactics?: { highest?: { rating?: number }; lowest?: { rating?: number } };
  chess_bullet?: { last?: { rating?: number } };
  chess_blitz?: { last?: { rating?: number } };
  chess_rapid?: { last?: { rating?: number } };
}

async function fetchChessComStats(): Promise<ChessComStats | null> {
  try {
    const res = await fetch(
      `https://api.chess.com/pub/player/${PERSONAL.username}/stats`,
      { headers: { Accept: "application/json" }, redirect: "follow" }
    );
    if (!res.ok) return null;
    return (await res.json()) as ChessComStats;
  } catch {
    return null;
  }
}

function deriveTacticsRating(stats: ChessComStats | null): number {
  // Chess.com's puzzle rating is the best available proxy for solving strength.
  const puzzleHigh = stats?.tactics?.highest?.rating;
  if (typeof puzzleHigh === "number" && puzzleHigh > 0) {
    return Math.max(800, Math.min(2400, puzzleHigh));
  }
  // No puzzle history: game ratings run well below puzzle ratings, so bump.
  const rapid = stats?.chess_rapid?.last?.rating;
  if (typeof rapid === "number" && rapid > 0) {
    return Math.max(800, Math.min(2400, rapid + 400));
  }
  return PERSONAL.fallbackTacticsRating;
}

function writePlatformRatings(stats: ChessComStats): void {
  const bullet = stats.chess_bullet?.last?.rating ?? null;
  const blitz = stats.chess_blitz?.last?.rating ?? null;
  const rapid = stats.chess_rapid?.last?.rating ?? null;
  const main = rapid ?? blitz ?? bullet;
  if (main !== null) {
    localStorage.setItem("ctt_platform_rating", String(main));
  }
  localStorage.setItem(
    "ctt_platform_ratings_v2",
    JSON.stringify({
      bullet,
      blitz,
      rapid,
      main: rapid ? "rapid" : blitz ? "blitz" : "bullet",
    })
  );
  localStorage.setItem(RATINGS_REFRESH_STAMP, String(Date.now()));
}

function stampOlderThan(key: string, maxAgeMs: number): boolean {
  const raw = localStorage.getItem(key);
  if (!raw) return true;
  const ts = parseInt(raw, 10);
  return !Number.isFinite(ts) || Date.now() - ts > maxAgeMs;
}

/** Background: re-run the Chess.com game analysis if it has gone stale. */
function refreshAnalysisIfStale(): void {
  // Stamp-gated: the stamp is written before every run (success, empty, or
  // failure), so a run that finds nothing doesn't retry on every page load —
  // only after the TTL. A concurrent run in another tab is also skipped via
  // the analysis-status flag (best effort).
  if (!stampOlderThan(ANALYSIS_STAMP, ANALYSIS_REFRESH_MS)) return;
  if (localStorage.getItem("ctt_analysis_status") === "running") return;
  localStorage.setItem(ANALYSIS_STAMP, String(Date.now()));
  import("@/lib/game-analysis")
    .then(({ runGameAnalysis }) => runGameAnalysis(PERSONAL.username, PERSONAL.platform))
    .catch(() => { /* offline or fetch failure — next visit retries after TTL */ });
}

const FALLBACK_SEED_FLAG = "ctt_seed_used_fallback";

// Single-flight: /app/page.tsx and the app-shell PersonalBootstrap both call
// this on first paint — only one seed/refresh pass should run per page load.
let inflight: Promise<void> | null = null;

/**
 * Idempotent. Safe to call on every app entry; only the first call on a fresh
 * browser does the full seed (one network fetch), later calls just refresh.
 */
export function ensurePersonalBootstrap(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!inflight) {
    inflight = bootstrapOnce().finally(() => {
      // Allow later invocations (e.g. long-lived tab crossing the refresh
      // TTL) to run the cheap refresh pass again.
      setTimeout(() => { inflight = null; }, 60_000);
    });
  }
  return inflight;
}

async function bootstrapOnce(): Promise<void> {
  const alreadySeeded = localStorage.getItem("ctt_calibration_complete") === "true";

  if (alreadySeeded) {
    // Keep displayed platform ratings fresh (daily) and analysis fresh (weekly).
    if (stampOlderThan(RATINGS_REFRESH_STAMP, RATINGS_REFRESH_MS)) {
      fetchChessComStats()
        .then((stats) => {
          if (!stats) return;
          writePlatformRatings(stats);
          // If the original seed happened offline (fallback rating) and the
          // user hasn't trained yet, upgrade to the real Chess.com rating.
          if (localStorage.getItem(FALLBACK_SEED_FLAG) === "true") {
            try {
              const tactics = JSON.parse(localStorage.getItem("ctt_tactics_rating") || "null") as
                | { tacticsRatingHistory?: unknown[] }
                | null;
              const untouched = !tactics?.tacticsRatingHistory?.length;
              if (untouched) {
                const rating = deriveTacticsRating(stats);
                localStorage.setItem("ctt_calibration_rating", String(rating));
                localStorage.setItem(
                  "ctt_tactics_rating",
                  JSON.stringify({ tacticsRating: rating, tacticsRatingStart: rating, tacticsRatingHistory: [] })
                );
              }
              localStorage.removeItem(FALLBACK_SEED_FLAG);
            } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    }
    refreshAnalysisIfStale();
    return;
  }

  // ── Fresh browser: full seed ─────────────────────────────────────────────
  const stats = await fetchChessComStats();
  const tacticsRating = deriveTacticsRating(stats);

  try {
    localStorage.setItem("ctt_calibration_rating", String(tacticsRating));
    localStorage.setItem("ctt_calibration_complete", "true");
    if (!stats) localStorage.setItem(FALLBACK_SEED_FLAG, "true");
    if (!localStorage.getItem("ctt_tactics_rating")) {
      localStorage.setItem(
        "ctt_tactics_rating",
        JSON.stringify({
          tacticsRating,
          tacticsRatingStart: tacticsRating,
          tacticsRatingHistory: [],
        })
      );
    }
    localStorage.setItem("ctt_sub_tier", "2");
    localStorage.setItem("subscription_status", "active");
    localStorage.setItem("ctt_custom_username", PERSONAL.username);
    localStorage.setItem("ctt_custom_platform", PERSONAL.platform);
    if (!localStorage.getItem("ctt_daily_target")) {
      localStorage.setItem("ctt_daily_target", JSON.stringify({ dailyGoal: PERSONAL.dailyGoal }));
    }
    if (stats) writePlatformRatings(stats);
  } catch { /* quota — app still works with defaults */ }

  refreshAnalysisIfStale();
}

/** True once the one-time seed has been written (cheap sync check). */
export function isPersonalSeeded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem("ctt_calibration_complete") === "true";
  } catch {
    return true;
  }
}
