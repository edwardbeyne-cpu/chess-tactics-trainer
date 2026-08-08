"use client";

import { useRef, useState } from "react";
import {
  exportHistoryAsCSV,
  exportStatsAsJSON,
  downloadFile,
  getTotalAttempts,
  getPersonalPuzzles,
} from "@/lib/storage";

// Full-state backup format. Version lets us migrate the shape later if needed.
interface FullBackup {
  format: "ctt-full-backup";
  version: 1;
  exportedAt: string;
  keys: Record<string, string>;
}

function buildFullBackup(): FullBackup {
  const keys: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key);
    if (value !== null) keys[key] = value;
  }
  return {
    format: "ctt-full-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    keys,
  };
}

export default function DataExport() {
  const [csvDownloaded, setCsvDownloaded] = useState(false);
  const [jsonDownloaded, setJsonDownloaded] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<null | { ok: boolean; message: string }>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAttempts = typeof window !== "undefined" ? getTotalAttempts() : 0;
  const personalPuzzles = typeof window !== "undefined" ? getPersonalPuzzles().length : 0;

  function handleCSVExport() {
    const csv = exportHistoryAsCSV();
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`chess-trainer-history-${date}.csv`, csv, "text/csv;charset=utf-8;");
    setCsvDownloaded(true);
    setTimeout(() => setCsvDownloaded(false), 2000);
  }

  function handleJSONExport() {
    const json = exportStatsAsJSON();
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`chess-trainer-stats-${date}.json`, json, "application/json");
    setJsonDownloaded(true);
    setTimeout(() => setJsonDownloaded(false), 2000);
  }

  function handleFullBackup() {
    const backup = buildFullBackup();
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`chess-trainer-backup-${date}.json`, JSON.stringify(backup, null, 2), "application/json");
    setBackupDownloaded(true);
    setTimeout(() => setBackupDownloaded(false), 2000);
  }

  function handleRestoreFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as FullBackup;
        if (parsed?.format !== "ctt-full-backup" || !parsed.keys || typeof parsed.keys !== "object") {
          setRestoreStatus({ ok: false, message: "Not a valid backup file (expected a Full Backup .json)." });
          return;
        }
        const keyCount = Object.keys(parsed.keys).length;
        const confirmed = window.confirm(
          `Restore backup from ${parsed.exportedAt?.slice(0, 10) ?? "unknown date"}?\n\n` +
          `This will overwrite your current training data with ${keyCount} stored entries, then reload the app.`
        );
        if (!confirmed) return;
        for (const [key, value] of Object.entries(parsed.keys)) {
          try { localStorage.setItem(key, value); } catch { /* quota — keep going */ }
        }
        setRestoreStatus({ ok: true, message: `Restored ${keyCount} entries. Reloading…` });
        setTimeout(() => window.location.reload(), 800);
      } catch {
        setRestoreStatus({ ok: false, message: "Could not read that file as JSON." });
      }
    };
    reader.readAsText(file);
  }

  const rowStyle: React.CSSProperties = {
    backgroundColor: "#162030",
    borderRadius: "8px",
    padding: "1rem 1.25rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "1rem",
    flexWrap: "wrap",
  };

  const buttonStyle = (bg: string, fg: string): React.CSSProperties => ({
    backgroundColor: bg,
    color: fg,
    border: "none",
    borderRadius: "8px",
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "0.85rem",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "all 0.2s",
  });

  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
      <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", margin: "0 0 0.5rem" }}>
        💾 Backup &amp; Data Export
      </h2>
      <p style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "1.25rem" }}>
        All training data lives in this browser. Take a full backup regularly — everything runs locally, nothing is sent to a server.
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
        {/* Full backup */}
        <div style={{ ...rowStyle, border: "1px solid #1a4a2a" }}>
          <div>
            <div style={{ color: "#e2e8f0", fontSize: "0.95rem", fontWeight: "bold", marginBottom: "0.2rem" }}>
              🗄 Full Backup (.json)
            </div>
            <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
              Complete snapshot of every stored key — mastery sets, ratings, history, settings. Restores everything exactly.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            <button onClick={handleFullBackup} style={buttonStyle(backupDownloaded ? "#0a1f12" : "#4ade80", backupDownloaded ? "#4ade80" : "#0f0f1a")}>
              {backupDownloaded ? "✓ Saved!" : "Download Backup"}
            </button>
            <button onClick={() => fileInputRef.current?.click()} style={{ ...buttonStyle("transparent", "#94a3b8"), border: "1px solid #2e3a5c" }}>
              Restore…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleRestoreFile(f);
                e.target.value = ""; // allow re-selecting the same file
              }}
            />
          </div>
        </div>

        {restoreStatus && (
          <div style={{
            color: restoreStatus.ok ? "#4ade80" : "#ef4444",
            backgroundColor: restoreStatus.ok ? "#0a1f12" : "#1f0a0a",
            border: `1px solid ${restoreStatus.ok ? "#1a4a2a" : "#4a1a1a"}`,
            borderRadius: "8px",
            padding: "0.6rem 1rem",
            fontSize: "0.82rem",
          }}>
            {restoreStatus.message}
          </div>
        )}

        {/* CSV Export */}
        <div style={rowStyle}>
          <div>
            <div style={{ color: "#e2e8f0", fontSize: "0.95rem", fontWeight: "bold", marginBottom: "0.2rem" }}>
              📊 Puzzle History (.csv)
            </div>
            <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
              All attempts with timestamps, themes, outcomes, and solve times. Open in Excel or Google Sheets.
            </div>
          </div>
          <button onClick={handleCSVExport} style={buttonStyle(csvDownloaded ? "#0a1f12" : "#4ade80", csvDownloaded ? "#4ade80" : "#0f0f1a")}>
            {csvDownloaded ? "✓ Downloaded!" : "Download CSV"}
          </button>
        </div>

        {/* JSON Export */}
        <div style={rowStyle}>
          <div>
            <div style={{ color: "#e2e8f0", fontSize: "0.95rem", fontWeight: "bold", marginBottom: "0.2rem" }}>
              📋 Personal Stats (.json)
            </div>
            <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
              Rating history, pattern stats, achievements, XP, streaks, and personal puzzles summary.
            </div>
          </div>
          <button onClick={handleJSONExport} style={buttonStyle(jsonDownloaded ? "#0a1f12" : "#2e75b6", jsonDownloaded ? "#4ade80" : "white")}>
            {jsonDownloaded ? "✓ Downloaded!" : "Download JSON"}
          </button>
        </div>
      </div>
    </div>
  );
}
