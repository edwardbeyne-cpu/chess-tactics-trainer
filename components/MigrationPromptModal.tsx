"use client";

/**
 * MigrationPromptModal — shown when a user signs in and we detect
 * meaningful data both locally and in their cloud account.
 *
 * Three options:
 *   Use this device  → push local data to cloud, overwrite cloud
 *   Use cloud        → pull cloud data to local, overwrite local
 *   Merge both       → apply per-key mergers (recommended, default)
 */

import { useState } from "react";
import type { MergeStrategy } from "@/lib/sync";

interface Props {
  onChoose: (strategy: MergeStrategy) => void;
}

export default function MigrationPromptModal({ onChoose }: Props) {
  const [loading, setLoading] = useState<MergeStrategy | null>(null);

  const choose = async (strategy: MergeStrategy) => {
    setLoading(strategy);
    onChoose(strategy);
  };

  const options: { strategy: MergeStrategy; label: string; sub: string; accent: string }[] = [
    {
      strategy: "merge",
      label: "Merge both (recommended)",
      sub: "Combines progress from this device and your account — no data lost.",
      accent: "#4ade80",
    },
    {
      strategy: "local",
      label: "Use this device",
      sub: "Keep only the data on this device. Cloud data will be overwritten.",
      accent: "#60a5fa",
    },
    {
      strategy: "cloud",
      label: "Use my account",
      sub: "Keep only the data from your account. Local data will be overwritten.",
      accent: "#f59e0b",
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "#1a1a2e",
          border: "1px solid #2e3a5c",
          borderRadius: "14px",
          padding: "2rem",
          maxWidth: "480px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: "1.3rem", fontWeight: "bold", color: "#e2e8f0", marginBottom: "0.5rem" }}>
          Data found in two places
        </div>
        <div style={{ fontSize: "0.9rem", color: "#94a3b8", marginBottom: "1.75rem", lineHeight: 1.5 }}>
          We found training progress on this device <em>and</em> in your account.
          How would you like to proceed?
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {options.map(({ strategy, label, sub, accent }) => (
            <button
              key={strategy}
              onClick={() => choose(strategy)}
              disabled={loading !== null}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "0.25rem",
                backgroundColor: loading === strategy ? "#0f0f1a" : "transparent",
                border: `1px solid ${loading === strategy ? accent : "#2e3a5c"}`,
                borderRadius: "10px",
                padding: "0.85rem 1rem",
                cursor: loading !== null ? "default" : "pointer",
                textAlign: "left",
                opacity: loading !== null && loading !== strategy ? 0.45 : 1,
                transition: "border-color 0.15s, opacity 0.15s",
              }}
              onMouseOver={(e) => {
                if (!loading) e.currentTarget.style.borderColor = accent;
              }}
              onMouseOut={(e) => {
                if (!loading) e.currentTarget.style.borderColor = "#2e3a5c";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {loading === strategy && (
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(255,255,255,0.2)",
                      borderTopColor: accent,
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span style={{ color: accent, fontWeight: "bold", fontSize: "0.9rem" }}>{label}</span>
              </div>
              <span style={{ color: "#64748b", fontSize: "0.8rem" }}>{sub}</span>
            </button>
          ))}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
