"use client";

import { useEffect, useState } from "react";
import { ensurePersonalBootstrap, isPersonalSeeded } from "@/lib/personal";

/**
 * First-run gate for the personal edition. Children render only after the
 * bootstrap has seeded ratings/identity — otherwise a deep link (e.g.
 * straight to /app/training) on a fresh browser would generate and persist
 * the first mastery set at the 800 default rating before the real Chess.com
 * rating arrives.
 *
 * Renders the splash on both server and initial client paint (no hydration
 * mismatch); on an already-seeded browser the gate opens on the first
 * effect tick (~one frame) and refreshers run in the background.
 */
export default function PersonalBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isPersonalSeeded()) {
      // Seeded: open immediately, refresh ratings/analysis in the background.
      ensurePersonalBootstrap().catch(() => {});
      setReady(true);
    } else {
      // Fresh browser: hold children until the seed completes.
      ensurePersonalBootstrap()
        .catch(() => { /* offline — fallback defaults were written */ })
        .finally(() => setReady(true));
    }
  }, []);

  if (!ready) {
    return (
      <div style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        color: "#94a3b8",
      }}>
        <div style={{ fontSize: "3rem", color: "#4ade80" }}>♔</div>
        <div style={{ fontSize: "0.95rem" }}>Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
