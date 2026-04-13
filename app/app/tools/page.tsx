"use client";

import { useState } from "react";
import Link from "next/link";
import CalculationGym from "@/components/CalculationGym";
import BlunderSimulation from "@/components/BlunderSimulation";

export default function ToolsPage() {
  const [activeTool, setActiveTool] = useState<"calculation" | "blunder" | null>(null);

  if (activeTool === "calculation") {
    return (
      <div>
        <button
          onClick={() => setActiveTool(null)}
          style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
        >
          ← Back to Tools
        </button>
        <CalculationGym />
      </div>
    );
  }

  if (activeTool === "blunder") {
    return (
      <div>
        <button
          onClick={() => setActiveTool(null)}
          style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
        >
          ← Back to Tools
        </button>
        <BlunderSimulation />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "700", marginBottom: "0.25rem" }}>Tools</div>
        <div style={{ color: "#64748b", fontSize: "0.85rem" }}>Specialized training modes. Use alongside your main training set.</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Calculation Gym */}
        <button
          onClick={() => setActiveTool("calculation")}
          style={{
            backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "14px",
            padding: "1.25rem 1.5rem", textAlign: "left", cursor: "pointer", width: "100%",
            transition: "border-color 0.15s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = "#4ade80")}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = "#2e3a5c")}
        >
          <div style={{ color: "#4ade80", fontWeight: "700", fontSize: "0.95rem", marginBottom: "0.4rem" }}>
            🧠 Calculation Gym
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.5 }}>
            Train visualization without moving pieces. See the position, calculate the full sequence in your head, then pick your answer. The skill that separates 1400 from 1800 players.
          </div>
          <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.5rem" }}>Best for: 1200+ rated players</div>
        </button>

        {/* Blunder Prevention */}
        <button
          onClick={() => setActiveTool("blunder")}
          style={{
            backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "14px",
            padding: "1.25rem 1.5rem", textAlign: "left", cursor: "pointer", width: "100%",
            transition: "border-color 0.15s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = "#ef4444")}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = "#2e3a5c")}
        >
          <div style={{ color: "#ef4444", fontWeight: "700", fontSize: "0.95rem", marginBottom: "0.4rem" }}>
            ⚠️ Blunder Prevention
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.5 }}>
            Three moves are highlighted on the board. One is a blunder. Tap the safe move. Trains your instinct to resist tempting but losing moves — the skill most players never practice.
          </div>
          <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.5rem" }}>Best for: all levels</div>
        </button>

        {/* CCT Trainer */}
        <Link
          href="/app/cct-trainer"
          style={{
            backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "14px",
            padding: "1.25rem 1.5rem", textAlign: "left", cursor: "pointer", width: "100%",
            transition: "border-color 0.15s", display: "block", textDecoration: "none",
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = "#60a5fa")}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = "#2e3a5c")}
        >
          <div style={{ color: "#60a5fa", fontWeight: "700", fontSize: "0.95rem", marginBottom: "0.4rem" }}>
            ⚡ CCT Trainer — Scan Before You Move
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.5 }}>
            Practice the Checks, Captures, Threats scanning habit in a focused environment. Build the tactical pattern recognition that works in real games.
          </div>
          <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.5rem" }}>Best for: all levels</div>
        </Link>
      </div>
    </div>
  );
}
