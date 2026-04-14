"use client";

import { useEffect, useState } from "react";
import { isBetaTester } from "@/lib/beta";

const DEBUG_KEYS = [
  "ctt_beta_tester",
  "ctt_custom_analysis",
  "ctt_custom_puzzles_generated",
  "ctt_custom_mastery_set",
  "ctt_mastery_progress",
  "ctt_beta_feedback",
  "ctt_feedback_responses",
  "ctt_sub_tier",
  "ctt_game_analysis",
];

export default function DebugPage() {
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const beta = isBetaTester();
    setAllowed(beta);
    if (!beta) return;
    const next: Record<string, string> = {};
    DEBUG_KEYS.forEach((key) => {
      next[key] = localStorage.getItem(key) || "(empty)";
    });
    setPayload(next);
  }, []);

  if (!allowed) {
    return <div style={{ padding: "2rem", color: "#94a3b8" }}>Debug page is only available for beta testers.</div>;
  }

  return (
    <div style={{ padding: "2rem", color: "#e2e8f0" }}>
      <h1 style={{ marginBottom: "1rem" }}>Debug</h1>
      <div style={{ display: "grid", gap: "1rem" }}>
        {Object.entries(payload).map(([key, value]) => (
          <div key={key} style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1rem" }}>
            <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "0.45rem" }}>{key}</div>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{value}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
