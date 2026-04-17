"use client";

/**
 * Sync layer — mirrors localStorage keys to Supabase user_data table.
 *
 * Usage:
 *   import { syncedSetItem } from "@/lib/sync";
 *   syncedSetItem(key, value); // drop-in for localStorage.setItem on sync keys
 *
 * Sync lifecycle:
 *   1. Every syncedSetItem call queues a debounced (2 s) upsert to user_data.
 *   2. On sign-in, AuthProvider calls pullAndMerge(userId) to fetch cloud data
 *      and either auto-merge or surface the MigrationPromptModal.
 *   3. On window focus, pullOnFocus() does an incremental pull.
 */

import { getSupabase } from "@/lib/supabase";

// ─── Keys that sync to Supabase ───────────────────────────────────────────────
// Excluded: ctt_game_analysis, ctt_custom_analysis, ctt_custom_queue,
//           ctt_analysis_debug, ctt_analysis_status  (large derived blobs)
//           ctt_sub_tier, ctt_beta_tester             (come from profile row)
export const SYNC_KEYS = new Set([
  "ctt_sm2_attempts",
  "ctt_puzzle_progress",
  "ctt_pattern_ratings",
  "ctt_mastery_progress",
  "ctt_custom_mastery_set",
  "ctt_threat_detection_progress",
  "ctt_streak",
  "ctt_xp",
  "ctt_activity_log",
  "ctt_achievements_v2",
  "ctt_settings",
  "ctt_puzzle_settings",
  "ctt_daily_target",
  "ctt_daily_habit",
  "ctt_calibration_rating",
  "ctt_board_theme",
  "ctt_piece_style",
  "ctt_tactics_rating",
  "ctt_platform_ratings",
  "ctt_attempts",
  "ctt_srs",
  "ctt_calc_gym_sessions",
  "ctt_pattern_solve_times",
  "ctt_pattern_mastery_totals",
]);

// ─── Debounced upload queue ───────────────────────────────────────────────────
const uploadQueue = new Set<string>();
let uploadTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleUpload() {
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(flushUploadQueue, 2000);
}

// ─── Read current user ID from localStorage (avoids getSession() hang) ───────
export function getSyncUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(
      /https:\/\/([^.]+)/
    )?.[1];
    if (!projectRef) return null;
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token) return null;
    if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) return null;
    return (parsed.user?.id as string) ?? null;
  } catch {
    return null;
  }
}

// ─── Drop-in replacement for localStorage.setItem on sync keys ───────────────
export function syncedSetItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
  if (SYNC_KEYS.has(key)) {
    uploadQueue.add(key);
    scheduleUpload();
  }
}

// ─── Flush queued keys to Supabase ───────────────────────────────────────────
async function flushUploadQueue(): Promise<void> {
  uploadTimer = null;
  if (typeof window === "undefined") return;
  const supabase = getSupabase();
  if (!supabase) return;
  const userId = getSyncUserId();
  if (!userId) return;

  const keys = [...uploadQueue];
  uploadQueue.clear();

  const rows = keys.flatMap((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      return [
        {
          user_id: userId,
          key,
          value: JSON.parse(raw),
          updated_at: new Date().toISOString(),
        },
      ];
    } catch {
      return [];
    }
  });

  if (rows.length === 0) return;
  await supabase
    .from("user_data")
    .upsert(rows, { onConflict: "user_id,key" });
}

// ─── Cloud row type ───────────────────────────────────────────────────────────
export type CloudRow = { key: string; value: unknown; updated_at: string };

// ─── Fetch all user_data rows for a user ─────────────────────────────────────
export async function fetchCloudData(userId: string): Promise<CloudRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("user_data")
    .select("key, value, updated_at")
    .eq("user_id", userId);
  if (error) return [];
  return (data ?? []) as CloudRow[];
}

// ─── Per-key merge strategies ─────────────────────────────────────────────────

type MergerFn = (local: unknown, cloud: unknown) => unknown;

// sm2_attempts: union by puzzleId+timestamp, deduplicated
function mergeAttempts(local: unknown, cloud: unknown): unknown {
  const localArr = Array.isArray(local) ? local : [];
  const cloudArr = Array.isArray(cloud) ? cloud : [];
  const seen = new Map<string, unknown>();
  for (const a of [...cloudArr, ...localArr]) {
    if (!a?.puzzleId || !a?.timestamp) continue;
    seen.set(`${a.puzzleId}__${a.timestamp}`, a);
  }
  return [...seen.values()].sort((a, b) => {
    const at = (a as { timestamp: string }).timestamp;
    const bt = (b as { timestamp: string }).timestamp;
    return at.localeCompare(bt);
  });
}

// puzzle_progress / mastery: union keys, keep max count per puzzle
function mergePuzzleMap(local: unknown, cloud: unknown): unknown {
  const l =
    local && typeof local === "object" && !Array.isArray(local)
      ? (local as Record<string, number>)
      : {};
  const c =
    cloud && typeof cloud === "object" && !Array.isArray(cloud)
      ? (cloud as Record<string, number>)
      : {};
  const result: Record<string, number> = { ...c };
  for (const [k, v] of Object.entries(l)) {
    result[k] = Math.max(result[k] ?? 0, v);
  }
  return result;
}

// MasteryProgress objects (nested structure keyed by set name)
function mergeMasteryProgress(local: unknown, cloud: unknown): unknown {
  const l =
    local && typeof local === "object" && !Array.isArray(local)
      ? (local as Record<string, Record<string, number>>)
      : {};
  const c =
    cloud && typeof cloud === "object" && !Array.isArray(cloud)
      ? (cloud as Record<string, Record<string, number>>)
      : {};
  const result: Record<string, Record<string, number>> = {};
  const allKeys = new Set([...Object.keys(l), ...Object.keys(c)]);
  for (const k of allKeys) {
    result[k] = mergePuzzleMap(l[k] ?? {}, c[k] ?? {}) as Record<
      string,
      number
    >;
  }
  return result;
}

// pattern_ratings: keep higher rating per pattern
function mergePatternRatings(local: unknown, cloud: unknown): unknown {
  const l =
    local && typeof local === "object" && !Array.isArray(local)
      ? (local as Record<string, number>)
      : {};
  const c =
    cloud && typeof cloud === "object" && !Array.isArray(cloud)
      ? (cloud as Record<string, number>)
      : {};
  const result: Record<string, number> = { ...c };
  for (const [k, v] of Object.entries(l)) {
    result[k] = Math.max(result[k] ?? 0, v);
  }
  return result;
}

// xp: keep higher totalXP
function mergeXP(local: unknown, cloud: unknown): unknown {
  const lxp = (local as { totalXP?: number })?.totalXP ?? 0;
  const cxp = (cloud as { totalXP?: number })?.totalXP ?? 0;
  return lxp >= cxp ? local : cloud;
}

// streak: keep higher currentStreak
function mergeStreak(local: unknown, cloud: unknown): unknown {
  const ls = (local as { currentStreak?: number })?.currentStreak ?? 0;
  const cs = (cloud as { currentStreak?: number })?.currentStreak ?? 0;
  return ls >= cs ? local : cloud;
}

// activity_log (array of YYYY-MM-DD strings): union
function mergeActivityLog(local: unknown, cloud: unknown): unknown {
  const l = Array.isArray(local) ? (local as string[]) : [];
  const c = Array.isArray(cloud) ? (cloud as string[]) : [];
  return [...new Set([...c, ...l])].sort();
}

// achievements_v2 (array of {id, earnedDate}): union by id
function mergeAchievements(local: unknown, cloud: unknown): unknown {
  const l = Array.isArray(local) ? local : [];
  const c = Array.isArray(cloud) ? cloud : [];
  const map = new Map<string, unknown>();
  for (const a of [...c, ...l]) {
    if (a?.id) map.set(a.id as string, a);
  }
  return [...map.values()];
}

// calc_gym_sessions (array): append, dedupe by startTime
function mergeGymSessions(local: unknown, cloud: unknown): unknown {
  const l = Array.isArray(local) ? local : [];
  const c = Array.isArray(cloud) ? cloud : [];
  const map = new Map<string, unknown>();
  for (const s of [...c, ...l]) {
    const key = s?.startTime ?? JSON.stringify(s);
    map.set(key as string, s);
  }
  return [...map.values()].slice(0, 50);
}

const MERGERS: Record<string, MergerFn> = {
  ctt_sm2_attempts: mergeAttempts,
  ctt_puzzle_progress: mergePuzzleMap,
  ctt_pattern_ratings: mergePatternRatings,
  ctt_mastery_progress: mergeMasteryProgress,
  ctt_custom_mastery_set: mergeMasteryProgress,
  ctt_xp: mergeXP,
  ctt_streak: mergeStreak,
  ctt_activity_log: mergeActivityLog,
  ctt_achievements_v2: mergeAchievements,
  ctt_calc_gym_sessions: mergeGymSessions,
};

// ─── Migration prompt detection ───────────────────────────────────────────────
// Show prompt only when both sides have meaningful puzzle/progress data.
const MEANINGFUL_KEYS = [
  "ctt_sm2_attempts",
  "ctt_puzzle_progress",
  "ctt_mastery_progress",
];

export function needsMigrationPrompt(cloudRows: CloudRow[]): boolean {
  if (typeof window === "undefined") return false;
  for (const key of MEANINGFUL_KEYS) {
    const cloudRow = cloudRows.find((r) => r.key === key);
    if (!cloudRow) continue;
    const localRaw = localStorage.getItem(key);
    if (!localRaw) continue;
    try {
      const local = JSON.parse(localRaw);
      const cloud = cloudRow.value;
      const localHas = Array.isArray(local)
        ? local.length > 0
        : Object.keys(local ?? {}).length > 0;
      const cloudHas = Array.isArray(cloud)
        ? (cloud as unknown[]).length > 0
        : Object.keys((cloud ?? {}) as object).length > 0;
      if (localHas && cloudHas) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

// ─── Merge strategy ───────────────────────────────────────────────────────────
export type MergeStrategy = "local" | "cloud" | "merge";

export async function applyMergeStrategy(
  strategy: MergeStrategy,
  cloudRows: CloudRow[],
  userId: string
): Promise<void> {
  if (typeof window === "undefined") return;
  const supabase = getSupabase();
  if (!supabase) return;

  const dispatchStorageEvent = (key: string) => {
    try {
      window.dispatchEvent(
        new StorageEvent("storage", { key, storageArea: localStorage })
      );
    } catch {
      // ignore
    }
  };

  if (strategy === "local") {
    // Push all local sync keys to cloud, overwrite everything
    const rows = [...SYNC_KEYS].flatMap((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      try {
        return [
          {
            user_id: userId,
            key,
            value: JSON.parse(raw),
            updated_at: new Date().toISOString(),
          },
        ];
      } catch {
        return [];
      }
    });
    if (rows.length > 0) {
      await supabase
        .from("user_data")
        .upsert(rows, { onConflict: "user_id,key" });
    }
    return;
  }

  if (strategy === "cloud") {
    // Pull all cloud rows, overwrite local
    for (const row of cloudRows) {
      if (!SYNC_KEYS.has(row.key)) continue;
      try {
        localStorage.setItem(row.key, JSON.stringify(row.value));
        dispatchStorageEvent(row.key);
      } catch {
        // ignore
      }
    }
    return;
  }

  // strategy === "merge" — apply per-key mergers, upload results
  const rowsToUpload: {
    user_id: string;
    key: string;
    value: unknown;
    updated_at: string;
  }[] = [];

  for (const key of SYNC_KEYS) {
    const cloudRow = cloudRows.find((r) => r.key === key);
    const localRaw = localStorage.getItem(key);

    if (!cloudRow && !localRaw) continue;

    if (!cloudRow && localRaw) {
      // Only local → upload
      try {
        rowsToUpload.push({
          user_id: userId,
          key,
          value: JSON.parse(localRaw),
          updated_at: new Date().toISOString(),
        });
      } catch {
        // ignore
      }
      continue;
    }

    if (cloudRow && !localRaw) {
      // Only cloud → write local
      try {
        localStorage.setItem(key, JSON.stringify(cloudRow.value));
        dispatchStorageEvent(key);
      } catch {
        // ignore
      }
      continue;
    }

    if (cloudRow && localRaw) {
      // Both exist → merge
      try {
        const localVal = JSON.parse(localRaw);
        const merger = MERGERS[key];
        const merged = merger
          ? merger(localVal, cloudRow.value)
          : // Last-write-wins for non-custom keys (local assumed more recent)
            localVal;

        localStorage.setItem(key, JSON.stringify(merged));
        dispatchStorageEvent(key);
        rowsToUpload.push({
          user_id: userId,
          key,
          value: merged,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // ignore
      }
    }
  }

  if (rowsToUpload.length > 0) {
    await supabase
      .from("user_data")
      .upsert(rowsToUpload, { onConflict: "user_id,key" });
  }
}

// ─── Incremental pull on window focus ────────────────────────────────────────
let lastSyncTime: string | null = null;

export async function pullOnFocus(): Promise<void> {
  if (typeof window === "undefined") return;
  const supabase = getSupabase();
  if (!supabase) return;
  const userId = getSyncUserId();
  if (!userId) return;

  const since =
    lastSyncTime ??
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("user_data")
    .select("key, value, updated_at")
    .eq("user_id", userId)
    .gt("updated_at", since);

  if (error || !data) return;
  lastSyncTime = new Date().toISOString();

  for (const row of data as CloudRow[]) {
    if (!SYNC_KEYS.has(row.key)) continue;
    const localRaw = localStorage.getItem(row.key);

    if (!localRaw) {
      try {
        localStorage.setItem(row.key, JSON.stringify(row.value));
        window.dispatchEvent(
          new StorageEvent("storage", { key: row.key, storageArea: localStorage })
        );
      } catch {
        // ignore
      }
      continue;
    }

    // If we have a custom merger, apply it; otherwise skip (local wins)
    const merger = MERGERS[row.key];
    if (!merger) continue;

    try {
      const localVal = JSON.parse(localRaw);
      const merged = merger(localVal, row.value);
      localStorage.setItem(row.key, JSON.stringify(merged));
      window.dispatchEvent(
        new StorageEvent("storage", { key: row.key, storageArea: localStorage })
      );
    } catch {
      // ignore
    }
  }
}
