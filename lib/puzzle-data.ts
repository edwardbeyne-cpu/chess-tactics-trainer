// Lazy-loader for the bundled Lichess puzzle database (~416KB).
// Top-level imports of @/data/lichess-puzzles bloat every route bundle that
// touches a puzzle component. This module gates the data behind a dynamic
// import, with a singleton cache and a React hook for render-path consumers.

import { useEffect, useState } from "react";
import type { LichessCachedPuzzle } from "@/data/lichess-puzzles";

export type { LichessCachedPuzzle };

export interface PuzzleData {
  cachedPuzzlesByTheme: Record<string, LichessCachedPuzzle[]>;
  PATTERN_PUZZLE_COUNTS: Record<string, number>;
  PUZZLES_PER_PATTERN: number;
}

let cache: PuzzleData | null = null;
let loadPromise: Promise<PuzzleData> | null = null;

export function getPuzzleDataSync(): PuzzleData | null {
  return cache;
}

export async function loadPuzzleData(): Promise<PuzzleData> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = import("@/data/lichess-puzzles").then((m) => {
      cache = {
        cachedPuzzlesByTheme: m.cachedPuzzlesByTheme,
        PATTERN_PUZZLE_COUNTS: m.PATTERN_PUZZLE_COUNTS,
        PUZZLES_PER_PATTERN: m.PUZZLES_PER_PATTERN,
      };
      return cache;
    });
  }
  return loadPromise;
}

// React hook for render-path consumers. Returns null until loaded; component
// should render a loading fallback in that case.
export function usePuzzleData(): PuzzleData | null {
  const [data, setData] = useState<PuzzleData | null>(() => cache);
  useEffect(() => {
    if (cache) {
      if (data !== cache) setData(cache);
      return;
    }
    let mounted = true;
    loadPuzzleData().then((d) => {
      if (mounted) setData(d);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}
