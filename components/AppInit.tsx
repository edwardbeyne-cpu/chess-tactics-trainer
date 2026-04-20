"use client";

import { useEffect } from "react";
import { initStorageMaintenance } from "@/lib/safe-storage";
import { initAnalytics } from "@/lib/analytics";
import { loadPuzzleData } from "@/lib/puzzle-data";

// Mounted once at the root layout. Runs client-side initialization that must
// happen before user interaction: storage pruning, analytics SDK init, and a
// background warm-up of the puzzle DB so first puzzle render isn't blocked.
export default function AppInit() {
  useEffect(() => {
    initStorageMaintenance();
    initAnalytics();
    // Fire-and-forget; the dynamic import resolves in the background.
    void loadPuzzleData();
  }, []);
  return null;
}
