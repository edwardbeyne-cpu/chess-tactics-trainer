"use client";

import { useState, useRef } from "react";
import { Chess } from "chess.js";
import {
  getPGNs,
  savePGN,
  deletePGN,
  type StoredPGN,
  getUserSettings,
  saveUserSettings,
  fetchAndSavePlatformRatings,
  getDailyTargetSettings,
  saveDailyTargetSettings,
} from "@/lib/storage";
import BoardThemeSettings from "./BoardThemeSettings";
import DataExport from "./DataExport";

// TODO Sprint 4: run Stockfish on each position to identify tactical moments

interface ParsedPGN {
  gameCount: number;
  positionCount: number;
  games: string[];
}

function parsePGN(content: string): ParsedPGN {
  const gameStrings = splitPGNIntoGames(content);
  let totalPositions = 0;
  const validGames: string[] = [];

  for (const gameStr of gameStrings) {
    if (!gameStr.trim()) continue;
    try {
      const chess = new Chess();
      chess.loadPgn(gameStr.trim());
      const history = chess.history();
      totalPositions += history.length + 1;
      validGames.push(gameStr.trim());
    } catch {
      // Skip invalid games
    }
  }

  return { gameCount: validGames.length, positionCount: totalPositions, games: validGames };
}

function splitPGNIntoGames(pgn: string): string[] {
  const lines = pgn.split("\n");
  const games: string[] = [];
  let currentGame: string[] = [];
  let inMoves = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      if (inMoves && currentGame.length > 0) {
        games.push(currentGame.join("\n"));
        currentGame = [];
        inMoves = false;
      }
    } else if (trimmed.length > 0) {
      inMoves = true;
    }

    currentGame.push(line);

    if (
      inMoves &&
      (trimmed.endsWith("1-0") || trimmed.endsWith("0-1") || trimmed.endsWith("1/2-1/2") || trimmed === "*")
    ) {
      games.push(currentGame.join("\n"));
      currentGame = [];
      inMoves = false;
    }
  }

  if (currentGame.length > 0 && currentGame.some((l) => l.trim())) {
    games.push(currentGame.join("\n"));
  }

  return games;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Toggle Switch ──────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      style={{
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        border: "none",
        cursor: "pointer",
        backgroundColor: enabled ? "#4ade80" : "#2e3a5c",
        position: "relative",
        transition: "background-color 0.2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: "18px",
        height: "18px",
        borderRadius: "9px",
        backgroundColor: "white",
        position: "absolute",
        top: "3px",
        left: enabled ? "23px" : "3px",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

// ── Rating Tracking Section ────────────────────────────────────────────────

function RatingTrackingSection() {
  const [settings, setSettings] = useState(getUserSettings);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<"chesscom" | "lichess" | null>(null);
  const [testResult, setTestResult] = useState<{ platform: string; success: boolean; message: string } | null>(null);
  const [fetching, setFetching] = useState(false);

  async function handleSave(newSettings = settings) {
    saveUserSettings(newSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleToggleChesscom(enabled: boolean) {
    const newSettings = { ...settings, trackChesscom: enabled };
    setSettings(newSettings);
    saveUserSettings(newSettings);
    if (enabled && newSettings.chesscomUsername) {
      setFetching(true);
      await fetchAndSavePlatformRatings();
      setFetching(false);
    }
  }

  async function handleToggleLichess(enabled: boolean) {
    const newSettings = { ...settings, trackLichess: enabled };
    setSettings(newSettings);
    saveUserSettings(newSettings);
    if (enabled && newSettings.lichessUsername) {
      setFetching(true);
      await fetchAndSavePlatformRatings();
      setFetching(false);
    }
  }

  async function testChesscom() {
    if (!settings.chesscomUsername) return;
    setTesting("chesscom");
    setTestResult(null);
    try {
      const res = await fetch(`https://api.chess.com/pub/player/${settings.chesscomUsername}/stats`);
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json();
        const blitz = data?.chess_blitz?.last?.rating ?? "N/A";
        setTestResult({ platform: "Chess.com", success: true, message: `✅ Connected! Blitz rating: ${blitz}` });
      } else {
        setTestResult({ platform: "Chess.com", success: false, message: `❌ User not found: ${settings.chesscomUsername}` });
      }
    } catch {
      setTestResult({ platform: "Chess.com", success: false, message: "❌ Could not reach Chess.com API" });
    } finally {
      setTesting(null);
    }
  }

  async function testLichess() {
    if (!settings.lichessUsername) return;
    setTesting("lichess");
    setTestResult(null);
    try {
      const res = await fetch(`https://lichess.org/api/user/${settings.lichessUsername}`);
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json();
        const blitz = data?.perfs?.blitz?.rating ?? "N/A";
        setTestResult({ platform: "Lichess", success: true, message: `✅ Connected! Blitz rating: ${blitz}` });
      } else {
        setTestResult({ platform: "Lichess", success: false, message: `❌ User not found: ${settings.lichessUsername}` });
      }
    } catch {
      setTestResult({ platform: "Lichess", success: false, message: "❌ Could not reach Lichess API" });
    } finally {
      setTesting(null);
    }
  }

  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
      <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
        📈 Rating Tracking
      </h2>
      <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
        Optionally connect your Chess.com and/or Lichess accounts to overlay your platform ratings on the dashboard chart.
        Both are disabled by default. No login required — just your username.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* ── Chess.com Section ── */}
        <div style={{ backgroundColor: "#162030", borderRadius: "10px", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div>
              <div style={{ color: "#e2e8f0", fontSize: "0.95rem", fontWeight: "bold" }}>♟ Track Chess.com rating</div>
              <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.15rem" }}>
                Shows bullet, blitz, rapid ratings on your dashboard
              </div>
            </div>
            <Toggle enabled={settings.trackChesscom} onChange={handleToggleChesscom} />
          </div>
          {settings.trackChesscom && (
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
              <input
                type="text"
                value={settings.chesscomUsername}
                onChange={(e) => setSettings({ ...settings, chesscomUsername: e.target.value.trim() })}
                placeholder="Chess.com username (e.g. hikaru)"
                style={{
                  flex: 1,
                  backgroundColor: "#0d1621",
                  border: "1px solid #2e3a5c",
                  borderRadius: "8px",
                  padding: "0.6rem 0.9rem",
                  color: "#e2e8f0",
                  fontSize: "0.9rem",
                }}
              />
              <button
                onClick={testChesscom}
                disabled={!settings.chesscomUsername || testing === "chesscom"}
                style={{
                  backgroundColor: settings.chesscomUsername ? "#2e75b6" : "#1a2535",
                  color: settings.chesscomUsername ? "white" : "#4a6a8a",
                  border: "none", borderRadius: "8px",
                  padding: "0.6rem 1rem",
                  cursor: settings.chesscomUsername ? "pointer" : "not-allowed",
                  fontSize: "0.85rem", whiteSpace: "nowrap",
                }}
              >
                {testing === "chesscom" ? "Testing..." : "Test"}
              </button>
              <button
                onClick={() => handleSave({ ...settings })}
                style={{
                  backgroundColor: "#4ade80",
                  color: "#0f0f1a",
                  border: "none", borderRadius: "8px",
                  padding: "0.6rem 1rem",
                  cursor: "pointer",
                  fontSize: "0.85rem", fontWeight: "bold",
                }}
              >
                Save
              </button>
            </div>
          )}
        </div>

        {/* ── Lichess Section ── */}
        <div style={{ backgroundColor: "#162030", borderRadius: "10px", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div>
              <div style={{ color: "#e2e8f0", fontSize: "0.95rem", fontWeight: "bold" }}>🔵 Track Lichess rating</div>
              <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: "0.15rem" }}>
                Shows bullet, blitz, rapid, classical ratings on your dashboard
              </div>
            </div>
            <Toggle enabled={settings.trackLichess} onChange={handleToggleLichess} />
          </div>
          {settings.trackLichess && (
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
              <input
                type="text"
                value={settings.lichessUsername}
                onChange={(e) => setSettings({ ...settings, lichessUsername: e.target.value.trim() })}
                placeholder="Lichess username (e.g. DrNykterstein)"
                style={{
                  flex: 1,
                  backgroundColor: "#0d1621",
                  border: "1px solid #2e3a5c",
                  borderRadius: "8px",
                  padding: "0.6rem 0.9rem",
                  color: "#e2e8f0",
                  fontSize: "0.9rem",
                }}
              />
              <button
                onClick={testLichess}
                disabled={!settings.lichessUsername || testing === "lichess"}
                style={{
                  backgroundColor: settings.lichessUsername ? "#2e75b6" : "#1a2535",
                  color: settings.lichessUsername ? "white" : "#4a6a8a",
                  border: "none", borderRadius: "8px",
                  padding: "0.6rem 1rem",
                  cursor: settings.lichessUsername ? "pointer" : "not-allowed",
                  fontSize: "0.85rem", whiteSpace: "nowrap",
                }}
              >
                {testing === "lichess" ? "Testing..." : "Test"}
              </button>
              <button
                onClick={() => handleSave({ ...settings })}
                style={{
                  backgroundColor: "#4ade80",
                  color: "#0f0f1a",
                  border: "none", borderRadius: "8px",
                  padding: "0.6rem 1rem",
                  cursor: "pointer",
                  fontSize: "0.85rem", fontWeight: "bold",
                }}
              >
                Save
              </button>
            </div>
          )}
        </div>

        {fetching && (
          <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Fetching ratings...</div>
        )}

        {testResult && (
          <div style={{
            backgroundColor: testResult.success ? "#0a1f12" : "#1a0a0a",
            border: `1px solid ${testResult.success ? "#1a4a2a" : "#ef444440"}`,
            borderRadius: "8px",
            padding: "0.75rem 1rem",
          }}>
            <span style={{ color: testResult.success ? "#4ade80" : "#ef4444", fontSize: "0.85rem" }}>
              {testResult.message}
            </span>
          </div>
        )}

        {saved && (
          <div style={{ color: "#4ade80", fontSize: "0.85rem" }}>✅ Settings saved!</div>
        )}
      </div>

      <div style={{ marginTop: "1.25rem", backgroundColor: "#162030", borderRadius: "8px", padding: "0.75rem 1rem", fontSize: "0.8rem", color: "#475569" }}>
        💡 Ratings are fetched once per day (23-hour cooldown). Both APIs are public — no API keys required.
        Disabled platforms are completely hidden from your dashboard.
      </div>
    </div>
  );
}

// ── Aggregate Data Opt-In (Sprint 8) ──────────────────────────────────────

function AggregateDataSettings({
  settings,
  onSave,
}: {
  settings: import("@/lib/storage").UserSettings;
  onSave: (s: import("@/lib/storage").UserSettings) => void;
}) {
  const enabled = settings.contributeAnonymousData ?? false;

  function handleToggle(val: boolean) {
    const updated = { ...settings, contributeAnonymousData: val };
    onSave(updated);
  }

  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
      <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem", marginBottom: "0.5rem" }}>
        📊 Anonymized Usage Data
      </div>
      <p style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.6, marginBottom: "0.85rem" }}>
        Help improve percentile rankings for everyone. When enabled, anonymous solve rate and
        speed data is stored locally for future Supabase sync. No account data, no PII,
        no puzzle IDs — only aggregate statistics.
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
          Contribute anonymous data
        </span>
        <Toggle enabled={enabled} onChange={handleToggle} />
      </div>
      {enabled && (
        <div style={{ marginTop: "0.75rem", color: "#4ade80", fontSize: "0.78rem" }}>
          ✓ Contributing — data stored in localStorage under <code style={{ backgroundColor: "#0d1621", padding: "0.1rem 0.3rem", borderRadius: "3px" }}>ctt_aggregate_contribution</code>
        </div>
      )}
    </div>
  );
}

// ── Main Settings Component ────────────────────────────────────────────────

export default function Settings() {
  const [pgns, setPGNs] = useState<StoredPGN[]>(() => getPGNs());
  const [parseResult, setParseResult] = useState<ParsedPGN | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastFilename, setLastFilename] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sprint 10: Daily goal
  const [dailyGoal, setDailyGoalState] = useState<number>(() => {
    if (typeof window === "undefined") return 10;
    return getDailyTargetSettings().dailyGoal;
  });
  const [customGoal, setCustomGoal] = useState<string>("");
  const [goalSaved, setGoalSaved] = useState(false);

  function handleGoalSelect(goal: number) {
    setDailyGoalState(goal);
    setCustomGoal("");
    saveDailyTargetSettings({ dailyGoal: goal });
    setGoalSaved(true);
    setTimeout(() => setGoalSaved(false), 1500);
  }

  function handleCustomGoal() {
    const val = parseInt(customGoal, 10);
    if (isNaN(val) || val < 1 || val > 200) return;
    handleGoalSelect(val);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".pgn") && !file.name.endsWith(".txt")) {
      setUploadError("Please upload a .pgn file.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setParseResult(null);
    setLastFilename(file.name);

    try {
      const content = await file.text();
      const parsed = parsePGN(content);
      setParseResult(parsed);

      if (parsed.gameCount > 0) {
        const stored: StoredPGN = {
          id: `pgn_${Date.now()}`,
          filename: file.name,
          content,
          uploadedAt: new Date().toISOString(),
          gameCount: parsed.gameCount,
          positionCount: parsed.positionCount,
        };
        savePGN(stored);
        setPGNs(getPGNs());
      }
    } catch (err) {
      setUploadError(`Parse error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDelete(id: string) {
    deletePGN(id);
    setPGNs(getPGNs());
    if (parseResult) setParseResult(null);
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", marginBottom: "2rem" }}>
        Settings
      </h1>

      {/* Sprint 10: Daily Puzzle Goal */}
      <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", marginBottom: "0.4rem" }}>
          🎯 Daily Puzzle Goal
        </h2>
        <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
          Set how many puzzles you want to solve each day. Your streak counts days where you hit this goal.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          {[10, 20, 30].map((g) => (
            <button
              key={g}
              onClick={() => handleGoalSelect(g)}
              style={{
                backgroundColor: dailyGoal === g ? "#2e75b6" : "#162030",
                color: dailyGoal === g ? "white" : "#94a3b8",
                border: `1px solid ${dailyGoal === g ? "#2e75b6" : "#2e3a5c"}`,
                borderRadius: "8px",
                padding: "0.6rem 1.25rem",
                cursor: "pointer",
                fontWeight: dailyGoal === g ? "bold" : "normal",
                fontSize: "0.9rem",
              }}
            >
              {g} puzzles
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="number"
            min={1}
            max={200}
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            placeholder="Custom (1-200)"
            style={{
              backgroundColor: "#162030",
              border: "1px solid #2e3a5c",
              borderRadius: "6px",
              padding: "0.5rem 0.75rem",
              color: "#e2e8f0",
              fontSize: "0.9rem",
              width: "140px",
            }}
          />
          <button
            onClick={handleCustomGoal}
            disabled={!customGoal}
            style={{
              backgroundColor: customGoal ? "#2e75b6" : "#162030",
              color: customGoal ? "white" : "#475569",
              border: "none", borderRadius: "6px",
              padding: "0.5rem 1rem", cursor: customGoal ? "pointer" : "not-allowed", fontSize: "0.85rem",
            }}
          >
            Set Custom
          </button>
          {goalSaved && <span style={{ color: "#4ade80", fontSize: "0.85rem" }}>✓ Saved!</span>}
        </div>
        <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.6rem" }}>
          Current goal: <strong style={{ color: "#e2e8f0" }}>{dailyGoal} puzzles/day</strong>
        </div>
      </div>

      {/* Sprint 9: Board & Piece Themes */}
      <BoardThemeSettings />

      {/* Rating Tracking Section — Sprint 4 */}
      <RatingTrackingSection />

      {/* Sprint 8: Aggregate Data Opt-In */}
      <AggregateDataSettings
        settings={getUserSettings()}
        onSave={(s) => { saveUserSettings(s); }}
      />

      {/* Sprint 9: Data Export */}
      <DataExport />

      {/* PGN Upload Section */}
      <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
          ♟ Chess.com / Lichess Game Import
        </h2>
        <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
          Upload a PGN file to import your games. Your game positions will be analyzed in a future sprint.
        </p>

        <div
          style={{
            border: "2px dashed #2e3a5c",
            borderRadius: "10px",
            padding: "2rem",
            textAlign: "center",
            marginBottom: "1rem",
            cursor: "pointer",
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && fileInputRef.current) {
              const dt = new DataTransfer();
              dt.items.add(file);
              fileInputRef.current.files = dt.files;
              fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }}
        >
          <input ref={fileInputRef} type="file" accept=".pgn,.txt" style={{ display: "none" }} onChange={handleFileUpload} />
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📂</div>
          <div style={{ color: "#94a3b8", fontSize: "0.95rem", marginBottom: "0.4rem" }}>
            Click to upload or drag & drop
          </div>
          <div style={{ color: "#475569", fontSize: "0.8rem" }}>
            .pgn files only (exported from Chess.com, Lichess, or any PGN source)
          </div>
        </div>

        {uploading && (
          <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "1rem", textAlign: "center", marginBottom: "1rem" }}>
            <div style={{ color: "#94a3b8" }}>Parsing {lastFilename}...</div>
          </div>
        )}

        {uploadError && (
          <div style={{ backgroundColor: "#1a0a0a", border: "1px solid #ef4444", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ color: "#ef4444", fontSize: "0.9rem" }}>{uploadError}</div>
          </div>
        )}

        {parseResult && (
          <div style={{ backgroundColor: "#0a1f12", border: "1px solid #1a4a2a", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ color: "#4ade80", fontWeight: "bold", marginBottom: "0.5rem" }}>
              ✅ {lastFilename} parsed successfully
            </div>
            <div style={{ color: "#e2e8f0", fontSize: "1.1rem", marginBottom: "0.5rem" }}>
              Found <strong>{parseResult.gameCount}</strong> game{parseResult.gameCount !== 1 ? "s" : ""},{" "}
              <strong>{parseResult.positionCount}</strong> position{parseResult.positionCount !== 1 ? "s" : ""}
            </div>
            <div style={{ color: "#64748b", fontSize: "0.8rem" }}>
              📌 Stockfish analysis coming in a future sprint — will identify tactical moments from your games.
            </div>
          </div>
        )}

        <div style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.75rem 1rem", fontSize: "0.8rem", color: "#475569" }}>
          💡 <strong style={{ color: "#64748b" }}>How to export:</strong>{" "}
          Chess.com → My Games → Download .pgn | Lichess → Profile → Games → Export
        </div>
      </div>

      {/* Uploaded PGN files list */}
      {pgns.length > 0 && (
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "1rem" }}>
            Uploaded Game Files
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {pgns.map((pgn) => (
              <div
                key={pgn.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#162030", borderRadius: "8px", padding: "0.75rem 1rem" }}
              >
                <div>
                  <div style={{ color: "#e2e8f0", fontSize: "0.9rem", fontWeight: "bold" }}>{pgn.filename}</div>
                  <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.2rem" }}>
                    {pgn.gameCount} games · {pgn.positionCount} positions · {formatBytes(pgn.content.length)} · Uploaded {formatDate(pgn.uploadedAt)}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(pgn.id)}
                  style={{ backgroundColor: "#1a0a0a", color: "#ef4444", border: "1px solid #ef444440", borderRadius: "6px", padding: "0.4rem 0.75rem", cursor: "pointer", fontSize: "0.8rem" }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* localStorage info */}
      <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "0.75rem" }}>
          Data Storage
        </h2>
        <p style={{ color: "#64748b", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
          All data (attempts, SRS state, XP, streaks, uploaded PGNs, rating history) is stored locally in your browser&apos;s localStorage.
          No account or cloud storage is used in this version.
        </p>
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {[
            { key: "ctt_attempts", label: "Classic Attempts" },
            { key: "ctt_sm2_attempts", label: "Lichess Attempts" },
            { key: "ctt_srs", label: "SRS State" },
            { key: "ctt_pgns", label: "PGN Files" },
            { key: "ctt_xp", label: "XP Data" },
            { key: "ctt_streak", label: "Streak Data" },
            { key: "ctt_quests", label: "Daily Quests" },
            { key: "ctt_ratings", label: "Rating History" },
          ].map(({ key, label }) => {
            const size =
              typeof window !== "undefined"
                ? new Blob([localStorage.getItem(key) || ""]).size
                : 0;
            return (
              <div key={key} style={{ backgroundColor: "#162030", borderRadius: "8px", padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>
                <span style={{ color: "#94a3b8" }}>{label}: </span>
                <span style={{ color: "#4ade80" }}>{formatBytes(size)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
