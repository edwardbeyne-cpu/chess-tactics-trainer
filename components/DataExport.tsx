"use client";

import { useState } from "react";
import {
  exportHistoryAsCSV,
  exportStatsAsJSON,
  downloadFile,
  getSubscriptionTier,
  getTotalAttempts,
  getPersonalPuzzles,
} from "@/lib/storage";

function UpgradePrompt() {
  return (
    <div style={{
      backgroundColor: "#162030",
      borderRadius: "8px",
      padding: "1rem",
      marginTop: "0.75rem",
      fontSize: "0.82rem",
      color: "#64748b",
    }}>
      🔒 Data export is available on the{" "}
      <strong style={{ color: "#f59e0b" }}>Serious</strong> plan.{" "}
      <a href="/pricing" style={{ color: "#4ade80", textDecoration: "none" }}>Upgrade →</a>
    </div>
  );
}

export default function DataExport() {
  const tier = getSubscriptionTier();
  const [csvDownloaded, setCsvDownloaded] = useState(false);
  const [jsonDownloaded, setJsonDownloaded] = useState(false);

  const totalAttempts = typeof window !== "undefined" ? getTotalAttempts() : 0;
  const personalPuzzles = typeof window !== "undefined" ? getPersonalPuzzles().length : 0;

  function handleCSVExport() {
    if (tier < 2) return;
    const csv = exportHistoryAsCSV();
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`chess-trainer-history-${date}.csv`, csv, "text/csv;charset=utf-8;");
    setCsvDownloaded(true);
    setTimeout(() => setCsvDownloaded(false), 2000);
  }

  function handleJSONExport() {
    if (tier < 2) return;
    const json = exportStatsAsJSON();
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`chess-trainer-stats-${date}.json`, json, "application/json");
    setJsonDownloaded(true);
    setTimeout(() => setJsonDownloaded(false), 2000);
  }

  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", margin: 0 }}>
          💾 Data Export
        </h2>
        <span style={{
          backgroundColor: "#1a1200",
          border: "1px solid #f59e0b40",
          color: "#f59e0b",
          fontSize: "0.65rem",
          fontWeight: "bold",
          padding: "0.2rem 0.45rem",
          borderRadius: "4px",
        }}>
          SERIOUS
        </span>
      </div>
      <p style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "1.25rem" }}>
        Download all your training data for backup or analysis. Exports run entirely in your browser — no data is sent to a server.
      </p>

      {/* Data summary */}
      <div style={{
        backgroundColor: "#162030",
        borderRadius: "8px",
        padding: "0.75rem 1rem",
        marginBottom: "1.25rem",
        display: "flex",
        gap: "2rem",
        flexWrap: "wrap",
      }}>
        <div>
          <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Puzzle attempts: </span>
          <strong style={{ color: "#e2e8f0" }}>{totalAttempts.toLocaleString()}</strong>
        </div>
        <div>
          <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Personal puzzles: </span>
          <strong style={{ color: "#e2e8f0" }}>{personalPuzzles}</strong>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {/* CSV Export */}
        <div style={{
          backgroundColor: "#162030",
          borderRadius: "8px",
          padding: "1rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{ color: "#e2e8f0", fontSize: "0.95rem", fontWeight: "bold", marginBottom: "0.2rem" }}>
              📊 Puzzle History (.csv)
            </div>
            <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
              All attempts with timestamps, themes, outcomes, and solve times. Open in Excel or Google Sheets.
            </div>
          </div>
          <button
            onClick={handleCSVExport}
            disabled={tier < 2}
            style={{
              backgroundColor: tier >= 2 ? (csvDownloaded ? "#0a1f12" : "#4ade80") : "#162030",
              color: tier >= 2 ? (csvDownloaded ? "#4ade80" : "#0f0f1a") : "#475569",
              border: tier >= 2 ? "none" : "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.5rem 1.25rem",
              cursor: tier >= 2 ? "pointer" : "not-allowed",
              fontWeight: "bold",
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "all 0.2s",
            }}
          >
            {csvDownloaded ? "✓ Downloaded!" : tier < 2 ? "🔒 Locked" : "Download CSV"}
          </button>
        </div>

        {/* JSON Export */}
        <div style={{
          backgroundColor: "#162030",
          borderRadius: "8px",
          padding: "1rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{ color: "#e2e8f0", fontSize: "0.95rem", fontWeight: "bold", marginBottom: "0.2rem" }}>
              📋 Personal Stats (.json)
            </div>
            <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
              Rating history, pattern stats, achievements, XP, streaks, and personal puzzles summary.
            </div>
          </div>
          <button
            onClick={handleJSONExport}
            disabled={tier < 2}
            style={{
              backgroundColor: tier >= 2 ? (jsonDownloaded ? "#0a1f12" : "#2e75b6") : "#162030",
              color: tier >= 2 ? (jsonDownloaded ? "#4ade80" : "white") : "#475569",
              border: tier >= 2 ? "none" : "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.5rem 1.25rem",
              cursor: tier >= 2 ? "pointer" : "not-allowed",
              fontWeight: "bold",
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "all 0.2s",
            }}
          >
            {jsonDownloaded ? "✓ Downloaded!" : tier < 2 ? "🔒 Locked" : "Download JSON"}
          </button>
        </div>
      </div>

      {tier < 2 && <UpgradePrompt />}

      <div style={{ marginTop: "1rem", color: "#475569", fontSize: "0.75rem" }}>
        🔐 All data is processed locally in your browser. Nothing is sent to our servers during export.
      </div>
    </div>
  );
}
