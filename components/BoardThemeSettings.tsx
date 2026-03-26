"use client";

import { useState } from "react";
import {
  getBoardTheme,
  saveBoardTheme,
  getPieceStyle,
  savePieceStyle,
  getSubscriptionTier,
  BOARD_THEMES,
  PIECE_STYLES,
  THEME_TIER_ACCESS,
  PIECE_TIER_ACCESS,
  type BoardTheme,
  type PieceStyle,
} from "@/lib/storage";

// Tier label helpers
const TIER_LABELS = ["Free", "Improver", "Serious"];
const TIER_COLORS = ["#64748b", "#4ade80", "#f59e0b"];

function TierBadge({ tier }: { tier: number }) {
  return (
    <span style={{
      fontSize: "0.65rem",
      fontWeight: "bold",
      padding: "0.2rem 0.45rem",
      borderRadius: "4px",
      backgroundColor: tier === 2 ? "#1a1200" : tier === 1 ? "#0a1f12" : "#0d1621",
      color: TIER_COLORS[tier],
      border: `1px solid ${TIER_COLORS[tier]}40`,
      whiteSpace: "nowrap",
    }}>
      {TIER_LABELS[tier]}+
    </span>
  );
}

// Mini chess board preview
function BoardPreview({ lightColor, darkColor }: { lightColor: string; darkColor: string }) {
  const SIZE = 4; // 4x4 mini board
  const cellSize = 28;

  return (
    <div style={{
      display: "inline-grid",
      gridTemplateColumns: `repeat(${SIZE}, ${cellSize}px)`,
      borderRadius: "4px",
      overflow: "hidden",
      border: "1px solid #2e3a5c",
      flexShrink: 0,
    }}>
      {Array.from({ length: SIZE * SIZE }).map((_, i) => {
        const row = Math.floor(i / SIZE);
        const col = i % SIZE;
        const isLight = (row + col) % 2 === 0;
        return (
          <div
            key={i}
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: isLight ? lightColor : darkColor,
            }}
          />
        );
      })}
    </div>
  );
}

// Large preview for selected theme
function LargeBoardPreview({ lightColor, darkColor }: { lightColor: string; darkColor: string }) {
  const SIZE = 8;
  const cellSize = 36;

  const pieces: Record<string, string> = {
    "0,0": "♜", "0,1": "♞", "0,2": "♝", "0,3": "♛",
    "0,4": "♚", "0,5": "♝", "0,6": "♞", "0,7": "♜",
    "1,0": "♟", "1,1": "♟", "1,2": "♟", "1,3": "♟",
    "1,4": "♟", "1,5": "♟", "1,6": "♟", "1,7": "♟",
    "6,0": "♙", "6,1": "♙", "6,2": "♙", "6,3": "♙",
    "6,4": "♙", "6,5": "♙", "6,6": "♙", "6,7": "♙",
    "7,0": "♖", "7,1": "♘", "7,2": "♗", "7,3": "♕",
    "7,4": "♔", "7,5": "♗", "7,6": "♘", "7,7": "♖",
  };

  return (
    <div style={{
      display: "inline-grid",
      gridTemplateColumns: `repeat(${SIZE}, ${cellSize}px)`,
      borderRadius: "6px",
      overflow: "hidden",
      border: "2px solid #2e3a5c",
    }}>
      {Array.from({ length: SIZE * SIZE }).map((_, i) => {
        const row = Math.floor(i / SIZE);
        const col = i % SIZE;
        const isLight = (row + col) % 2 === 0;
        const piece = pieces[`${row},${col}`];
        return (
          <div
            key={i}
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: isLight ? lightColor : darkColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.1rem",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            {piece}
          </div>
        );
      })}
    </div>
  );
}

export default function BoardThemeSettings() {
  const [currentTheme, setCurrentTheme] = useState<BoardTheme>(() => getBoardTheme());
  const [currentPiece, setCurrentPiece] = useState<PieceStyle>(() => getPieceStyle());
  const [saved, setSaved] = useState(false);
  const tier = getSubscriptionTier();

  function selectTheme(theme: BoardTheme) {
    const requiredTier = THEME_TIER_ACCESS[theme];
    if (tier < requiredTier) return; // blocked
    setCurrentTheme(theme);
    saveBoardTheme(theme);
    flashSaved();
  }

  function selectPieceStyle(style: PieceStyle) {
    const requiredTier = PIECE_TIER_ACCESS[style];
    if (tier < requiredTier) return; // blocked
    setCurrentPiece(style);
    savePieceStyle(style);
    flashSaved();
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const selectedConfig = BOARD_THEMES[currentTheme];

  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
            🎨 Board & Piece Themes
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.82rem", margin: 0 }}>
            Customize your board appearance. Changes take effect immediately.
          </p>
        </div>
        {saved && (
          <span style={{ color: "#4ade80", fontSize: "0.82rem", fontWeight: "bold" }}>✓ Saved</span>
        )}
      </div>

      {/* Live Preview */}
      <div style={{
        backgroundColor: "#162030",
        borderRadius: "10px",
        padding: "1.25rem",
        marginBottom: "1.5rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
        flexWrap: "wrap",
      }}>
        <LargeBoardPreview
          lightColor={selectedConfig.light}
          darkColor={selectedConfig.dark}
        />
        <div>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem" }}>
            {selectedConfig.emoji} {selectedConfig.name} Theme
          </div>
          <div style={{ color: "#64748b", fontSize: "0.82rem", marginTop: "0.25rem" }}>
            {currentPiece.charAt(0).toUpperCase() + currentPiece.slice(1)} pieces
          </div>
          <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "0.5rem" }}>
            Light: <code style={{ color: "#94a3b8" }}>{selectedConfig.light}</code> ·{" "}
            Dark: <code style={{ color: "#94a3b8" }}>{selectedConfig.dark}</code>
          </div>
        </div>
      </div>

      {/* Board Themes */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ color: "#94a3b8", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
          Board Color
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.65rem" }}>
          {(Object.entries(BOARD_THEMES) as [BoardTheme, typeof BOARD_THEMES[BoardTheme]][]).map(([key, config]) => {
            const requiredTier = THEME_TIER_ACCESS[key];
            const locked = tier < requiredTier;
            const selected = currentTheme === key;

            return (
              <div
                key={key}
                onClick={() => !locked && selectTheme(key)}
                style={{
                  backgroundColor: selected ? "#0a1f12" : "#162030",
                  border: selected ? "2px solid #4ade80" : "2px solid transparent",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  cursor: locked ? "not-allowed" : "pointer",
                  opacity: locked ? 0.5 : 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  transition: "border-color 0.15s, opacity 0.15s",
                  position: "relative",
                }}
              >
                {locked && (
                  <div style={{
                    position: "absolute",
                    top: "6px",
                    right: "6px",
                    fontSize: "0.75rem",
                  }}>
                    🔒
                  </div>
                )}
                <BoardPreview lightColor={config.light} darkColor={config.dark} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.35rem" }}>
                  <span style={{ color: "#e2e8f0", fontSize: "0.82rem" }}>
                    {config.emoji} {config.name}
                  </span>
                  {requiredTier > 0 && <TierBadge tier={requiredTier} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Piece Styles */}
      <div>
        <div style={{ color: "#94a3b8", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>
          Piece Style
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.65rem" }}>
          {(Object.entries(PIECE_STYLES) as [PieceStyle, { name: string; description: string }][]).map(([key, config]) => {
            const requiredTier = PIECE_TIER_ACCESS[key];
            const locked = tier < requiredTier;
            const selected = currentPiece === key;

            return (
              <div
                key={key}
                onClick={() => !locked && selectPieceStyle(key)}
                style={{
                  backgroundColor: selected ? "#0a1f12" : "#162030",
                  border: selected ? "2px solid #4ade80" : "2px solid transparent",
                  borderRadius: "8px",
                  padding: "0.9rem",
                  cursor: locked ? "not-allowed" : "pointer",
                  opacity: locked ? 0.5 : 1,
                  position: "relative",
                  transition: "border-color 0.15s",
                }}
              >
                {locked && (
                  <div style={{ position: "absolute", top: "6px", right: "6px", fontSize: "0.75rem" }}>
                    🔒
                  </div>
                )}
                <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.9rem", marginBottom: "0.25rem" }}>
                  {config.name}
                </div>
                <div style={{ color: "#64748b", fontSize: "0.78rem" }}>{config.description}</div>
                {requiredTier > 0 && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <TierBadge tier={requiredTier} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upgrade note for locked themes */}
      {tier < 2 && (
        <div style={{ marginTop: "1.25rem", backgroundColor: "#162030", borderRadius: "8px", padding: "0.75rem 1rem", fontSize: "0.78rem", color: "#475569" }}>
          🔒 Dark and Purple board themes, plus Neo and Alpha piece styles, are available on the{" "}
          <strong style={{ color: "#f59e0b" }}>Serious</strong> plan.{" "}
          {tier === 0 && (
            <>Blue and Green themes require <strong style={{ color: "#4ade80" }}>Improver</strong> or above.</>
          )}{" "}
          <a href="/pricing" style={{ color: "#4ade80", textDecoration: "none" }}>View plans →</a>
        </div>
      )}
    </div>
  );
}
