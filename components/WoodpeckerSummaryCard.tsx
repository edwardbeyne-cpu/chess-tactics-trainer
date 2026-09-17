"use client";

import { useEffect, useState } from "react";
import {
  activeSet,
  loadStore,
  setsOfKind,
  solvedToday,
  summarize,
  type SetKind,
  type WoodpeckerSet,
} from "@/lib/woodpecker";

interface Row {
  kind: SetKind;
  set: WoodpeckerSet | null;
  completed: number;
}

/**
 * Training Plan card: where you are in the current Woodpecker sets.
 * Read-only; the trainer itself lives at /app/training.
 */
export default function WoodpeckerSummaryCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [today, setToday] = useState(0);

  useEffect(() => {
    const store = loadStore();
    setRows([
      { kind: "speed", set: activeSet(store, "speed"), completed: setsOfKind(store, "speed").filter((s) => s.completedAt).length },
      { kind: "calculation", set: activeSet(store, "calculation"), completed: setsOfKind(store, "calculation").filter((s) => s.completedAt).length },
    ]);
    setToday(solvedToday(store));
  }, []);

  if (!rows) return null;

  const anySet = rows.some((r) => r.set);

  return (
    <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "16px", padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ color: "#94a3b8", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Woodpecker Progress
        </div>
        {anySet && (
          <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
            Today: <strong style={{ color: "#e2e8f0" }}>{today}</strong> solved
          </div>
        )}
      </div>

      {!anySet ? (
        <div style={{ textAlign: "center", padding: "1rem 0" }}>
          <div style={{ color: "#94a3b8", marginBottom: "1rem", fontSize: "0.9rem" }}>
            Your first 200 will be built the moment you open Training.
          </div>
          <a href="/app/training" style={{ backgroundColor: "#4ade80", color: "#0f0f1a", padding: "0.6rem 1.5rem", borderRadius: "8px", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
            Start Set 1 →
          </a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {rows.map(({ kind, set, completed }) => {
            if (!set) return null;
            const sum = summarize(set);
            const pct = sum.total ? Math.round((sum.mastered / sum.total) * 100) : 0;
            const accent = kind === "speed" ? "#4ade80" : "#a78bfa";
            const label = kind === "speed" ? `Speed Set ${set.setNumber}` : `Calculation Set ${set.setNumber}`;
            const sub = kind === "speed"
              ? `${set.ratingFloor}–${set.ratingCeiling} · under 10s each`
              : `${set.ratingFloor}–${set.ratingCeiling} · no time limit`;
            return (
              <div key={set.id} style={{ backgroundColor: "#0d1621", border: "1px solid #1e3a5c", borderRadius: "10px", padding: "0.85rem 1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.45rem", flexWrap: "wrap", gap: "0.4rem" }}>
                  <div>
                    <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "0.9rem" }}>{label}</span>
                    <span style={{ color: "#64748b", fontSize: "0.75rem", marginLeft: "0.5rem" }}>{sub}</span>
                    {completed > 0 && (
                      <span style={{ color: "#64748b", fontSize: "0.72rem", marginLeft: "0.5rem" }}>· {completed} completed</span>
                    )}
                  </div>
                  <span style={{ color: accent, fontWeight: 800, fontSize: "0.9rem" }}>
                    {sum.mastered}/{sum.total}
                  </span>
                </div>
                <div style={{ height: "6px", backgroundColor: "#0f0f1a", borderRadius: "999px", overflow: "hidden", border: "1px solid #1e2a3a" }}>
                  <div style={{ height: "100%", width: `${pct}%`, backgroundColor: accent, transition: "width 0.4s" }} />
                </div>
                {kind === "speed" && (
                  <div style={{ display: "flex", gap: "0.9rem", marginTop: "0.5rem", fontSize: "0.72rem", color: "#64748b", flexWrap: "wrap" }}>
                    <span><strong style={{ color: "#93c5fd" }}>{sum.fast}</strong> under 30s</span>
                    <span><strong style={{ color: "#fcd34d" }}>{sum.slow}</strong> over 30s</span>
                    <span><strong style={{ color: "#fca5a5" }}>{sum.missed}</strong> missed</span>
                    <span><strong style={{ color: "#94a3b8" }}>{sum.fresh}</strong> not tried</span>
                  </div>
                )}
              </div>
            );
          })}
          <a href="/app/training" style={{ display: "block", textAlign: "center", backgroundColor: "#4ade80", color: "#0f0f1a", padding: "0.7rem", borderRadius: "10px", fontWeight: 700, fontSize: "0.92rem", textDecoration: "none", marginTop: "0.25rem" }}>
            Continue Training →
          </a>
        </div>
      )}
    </div>
  );
}
