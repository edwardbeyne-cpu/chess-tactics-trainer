"use client";

import { useState, useEffect } from "react";

export interface PuzzleSettings {
  minRating: number;
  maxRating: number;
  timeLimit: number;
  autoAdvance: boolean;
  timeStandard: number; // Sprint 12: target seconds to "meet the standard"
}

const SETTINGS_KEY = "ctt_puzzle_settings";

export const DEFAULT_PUZZLE_SETTINGS: PuzzleSettings = {
  minRating: 600,
  maxRating: 2400,
  timeLimit: 0,
  autoAdvance: true,
  timeStandard: 30,
};

export function loadPuzzleSettings(): PuzzleSettings {
  if (typeof window === "undefined") return DEFAULT_PUZZLE_SETTINGS;
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_PUZZLE_SETTINGS,
        ...parsed,
        timeStandard: parsed.timeStandard ?? DEFAULT_PUZZLE_SETTINGS.timeStandard,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PUZZLE_SETTINGS;
}

export function savePuzzleSettings(settings: PuzzleSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export default function PuzzleSettingsModal({
  isOpen,
  onClose,
  onSave,
  currentSettings,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: PuzzleSettings) => void;
  currentSettings: PuzzleSettings;
}) {
  const [minRating, setMinRating] = useState(currentSettings.minRating);
  const [maxRating, setMaxRating] = useState(currentSettings.maxRating);
  const [timeLimit, setTimeLimit] = useState(currentSettings.timeLimit);
  const [autoAdvance, setAutoAdvance] = useState(currentSettings.autoAdvance);
  const [timeStandard, setTimeStandard] = useState(currentSettings.timeStandard ?? 30);

  useEffect(() => {
    if (isOpen) {
      setMinRating(currentSettings.minRating);
      setMaxRating(currentSettings.maxRating);
      setTimeLimit(currentSettings.timeLimit);
      setAutoAdvance(currentSettings.autoAdvance);
      setTimeStandard(currentSettings.timeStandard ?? 30);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  function handleSave() {
    const clampedMin = Math.max(0, Math.min(minRating || 0, 3000));
    const clampedMax = Math.max(clampedMin, Math.min(maxRating || 2400, 3000));
    const clampedTime = Math.max(0, timeLimit || 0);
    const clampedStandard = Math.max(5, Math.min(timeStandard || 30, 300));
    const settings: PuzzleSettings = {
      minRating: clampedMin,
      maxRating: clampedMax,
      timeLimit: clampedTime,
      autoAdvance,
      timeStandard: clampedStandard,
    };
    savePuzzleSettings(settings);
    onSave(settings);
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: "#0f1621",
    border: "1px solid #2e3a5c",
    borderRadius: "8px",
    padding: "0.6rem 0.75rem",
    color: "#e2e8f0",
    fontSize: "0.95rem",
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "#1a1a2e",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "1.75rem",
          width: "100%",
          maxWidth: "420px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
          }}
        >
          <h2
            style={{
              color: "#e2e8f0",
              fontSize: "1.05rem",
              fontWeight: "bold",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            🎚️ Puzzle Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#64748b",
              cursor: "pointer",
              fontSize: "1.2rem",
              lineHeight: 1,
              padding: "0.25rem",
            }}
          >
            ✕
          </button>
        </div>

        {/* Rating Range */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label
            style={{
              color: "#94a3b8",
              fontSize: "0.78rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              display: "block",
              marginBottom: "0.6rem",
            }}
          >
            Rating Range
          </label>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: "#64748b",
                  fontSize: "0.7rem",
                  marginBottom: "0.3rem",
                }}
              >
                Min Rating
              </div>
              <input
                type="number"
                value={minRating}
                onChange={(e) => setMinRating(parseInt(e.target.value) || 0)}
                min={0}
                max={3000}
                step={100}
                style={inputStyle}
              />
            </div>
            <span
              style={{ color: "#64748b", paddingBottom: "0.6rem", flexShrink: 0 }}
            >
              —
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: "#64748b",
                  fontSize: "0.7rem",
                  marginBottom: "0.3rem",
                }}
              >
                Max Rating
              </div>
              <input
                type="number"
                value={maxRating}
                onChange={(e) => setMaxRating(parseInt(e.target.value) || 2400)}
                min={0}
                max={3000}
                step={100}
                style={inputStyle}
              />
            </div>
          </div>
          <div
            style={{
              color: "#475569",
              fontSize: "0.7rem",
              marginTop: "0.4rem",
            }}
          >
            Puzzles outside this range are skipped when loading
          </div>
        </div>

        {/* Time Limit */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label
            style={{
              color: "#94a3b8",
              fontSize: "0.78rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              display: "block",
              marginBottom: "0.6rem",
            }}
          >
            Time Limit (seconds per puzzle)
          </label>
          <input
            type="number"
            value={timeLimit}
            onChange={(e) => setTimeLimit(parseInt(e.target.value) || 0)}
            min={0}
            max={600}
            step={10}
            style={inputStyle}
            placeholder="0"
          />
          <div
            style={{
              color: "#475569",
              fontSize: "0.7rem",
              marginTop: "0.4rem",
            }}
          >
            0 = no limit. Timer shows green → yellow → red as time runs out.
          </div>
        </div>

        {/* Time Standard */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label
            style={{
              color: "#94a3b8",
              fontSize: "0.78rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              display: "block",
              marginBottom: "0.6rem",
            }}
          >
            ⚡ Time Standard (seconds)
          </label>
          <input
            type="number"
            value={timeStandard}
            onChange={(e) => setTimeStandard(parseInt(e.target.value) || 30)}
            min={5}
            max={300}
            step={5}
            style={inputStyle}
            placeholder="30"
          />
          <div
            style={{
              color: "#475569",
              fontSize: "0.7rem",
              marginTop: "0.4rem",
            }}
          >
            Puzzles solved correctly under this time count as &quot;meeting the standard&quot; ⚡
          </div>
        </div>

        {/* Auto-Advance */}
        <div style={{ marginBottom: "1.75rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div>
              <div
                style={{
                  color: "#94a3b8",
                  fontSize: "0.78rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Auto-Advance
              </div>
              <div
                style={{
                  color: "#475569",
                  fontSize: "0.7rem",
                  marginTop: "0.25rem",
                }}
              >
                After correct answer: show solution 1.5s then load next puzzle
              </div>
            </div>
            <button
              onClick={() => setAutoAdvance((v) => !v)}
              aria-label={autoAdvance ? "Disable auto-advance" : "Enable auto-advance"}
              style={{
                width: "50px",
                height: "28px",
                backgroundColor: autoAdvance ? "#2e75b6" : "#1e2a3a",
                borderRadius: "14px",
                border: `1px solid ${autoAdvance ? "#2e75b6" : "#2e3a5c"}`,
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s, border-color 0.2s",
                flexShrink: 0,
                padding: 0,
              }}
            >
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  backgroundColor: "white",
                  borderRadius: "50%",
                  position: "absolute",
                  top: "2px",
                  left: autoAdvance ? "25px" : "2px",
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                }}
              />
            </button>
          </div>
        </div>

        {/* Save + Cancel */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              backgroundColor: "#1e2a3a",
              color: "#94a3b8",
              border: "1px solid #2e3a5c",
              borderRadius: "10px",
              padding: "0.8rem",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 2,
              backgroundColor: "#2e75b6",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "0.8rem",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.9rem",
            }}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
