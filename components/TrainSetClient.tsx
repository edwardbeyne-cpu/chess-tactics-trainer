"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";
import patterns from "@/data/patterns";
import {
  getCreatorSetByCode,
  setActiveCreatorSet,
  incrementSetTimesUsed,
  FEATURED_SETS,
  type CreatorSet,
} from "@/lib/creator";
import PuzzlePage from "@/components/Puzzle";

// ── Featured Set puzzle resolution ───────────────────────────────────────
const PATTERN_TO_DB_KEY: Record<string, string> = {
  "fork": "fork",
  "pin": "pin",
  "skewer": "skewer",
  "back rank mate": "backRankMate",
  "smothered mate": "smotheredMate",
  "double check": "doubleCheck",
  "overloading": "overloading",
  "deflection": "deflection",
  "decoy": "attraction",
  "interference": "interference",
  "zugzwang": "zugzwang",
  "trapped piece": "trappedPiece",
  "discovered attack": "discoveredAttack",
};

function resolveFeaturedPuzzleIds(set: CreatorSet): string[] {
  if (set.puzzleIds.length > 0) return set.puzzleIds;
  // Resolve from DB
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const patternName of set.patterns) {
    const dbKey = PATTERN_TO_DB_KEY[patternName.toLowerCase()] ?? patternName.toLowerCase();
    const pool = cachedPuzzlesByTheme[dbKey] ?? [];
    for (const p of pool) {
      if (!seen.has(p.id) && p.rating >= set.minRating && p.rating <= set.maxRating) {
        seen.add(p.id);
        ids.push(p.id);
        if (ids.length >= 50) break;
      }
    }
    if (ids.length >= 50) break;
  }
  return ids;
}

function resolveCreatorSet(code: string): CreatorSet | null {
  // Check featured sets first
  const featured = FEATURED_SETS.find((s) => s.shareCode.toUpperCase() === code.toUpperCase());
  if (featured) {
    const puzzleIds = resolveFeaturedPuzzleIds(featured);
    return { ...featured, puzzleIds };
  }
  // Check localStorage
  return getCreatorSetByCode(code);
}

// ── Progress tracking for creator set ────────────────────────────────────
const CREATOR_PROGRESS_PREFIX = "ctt_creator_progress_";

function getCreatorSetProgress(shareCode: string): { solved: number; total: number } {
  if (typeof window === "undefined") return { solved: 0, total: 0 };
  try {
    const stored = localStorage.getItem(`${CREATOR_PROGRESS_PREFIX}${shareCode}`);
    return stored ? JSON.parse(stored) : { solved: 0, total: 0 };
  } catch {
    return { solved: 0, total: 0 };
  }
}

// ── Set Landing Page ──────────────────────────────────────────────────────

function SetLanding({ set, code, onStart }: { set: CreatorSet; code: string; onStart: () => void }) {
  const progress = getCreatorSetProgress(code);

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center" }}>
      {/* Icon */}
      <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🎯</div>

      {/* Set name */}
      <h1 style={{ color: "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", marginBottom: "0.75rem", lineHeight: 1.3 }}>
        {set.name}
      </h1>

      {/* Description */}
      {set.description && (
        <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, marginBottom: "1.5rem" }}>
          {set.description}
        </p>
      )}

      {/* Stats */}
      <div style={{
        display: "flex",
        gap: "1.5rem",
        justifyContent: "center",
        flexWrap: "wrap",
        marginBottom: "2rem",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#4ade80", fontSize: "1.6rem", fontWeight: "bold" }}>{set.puzzleIds.length}</div>
          <div style={{ color: "#64748b", fontSize: "0.78rem" }}>puzzles</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#4ade80", fontSize: "1.6rem", fontWeight: "bold" }}>{set.patterns.join(", ")}</div>
          <div style={{ color: "#64748b", fontSize: "0.78rem" }}>pattern{set.patterns.length > 1 ? "s" : ""}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#fbbf24", fontSize: "1.6rem", fontWeight: "bold" }}>★ {set.minRating}–{set.maxRating}</div>
          <div style={{ color: "#64748b", fontSize: "0.78rem" }}>rating range</div>
        </div>
      </div>

      {/* Progress bar */}
      {progress.total > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            Your progress: {progress.solved}/{progress.total} solved
          </div>
          <div style={{
            backgroundColor: "#1a1a2e",
            borderRadius: "999px",
            height: "6px",
            overflow: "hidden",
          }}>
            <div style={{
              backgroundColor: "#4ade80",
              height: "100%",
              width: `${Math.round((progress.solved / progress.total) * 100)}%`,
              borderRadius: "999px",
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>
      )}

      {/* Share code pill */}
      <div style={{ marginBottom: "2rem" }}>
        <span style={{ color: "#64748b", fontSize: "0.8rem" }}>Share code: </span>
        <code style={{
          backgroundColor: "#0a0f1a",
          border: "1px solid #1e2a3c",
          borderRadius: "6px",
          padding: "0.2rem 0.5rem",
          color: "#4ade80",
          fontSize: "0.85rem",
          fontFamily: "monospace",
          letterSpacing: "0.08em",
        }}>
          {set.shareCode}
        </code>
      </div>

      {/* CTA */}
      <button
        onClick={onStart}
        style={{
          backgroundColor: "#4ade80",
          color: "#0f0f1a",
          border: "none",
          borderRadius: "12px",
          padding: "1rem 2.5rem",
          cursor: "pointer",
          fontWeight: "bold",
          fontSize: "1.1rem",
          display: "block",
          width: "100%",
          maxWidth: "320px",
          margin: "0 auto",
        }}
      >
        {progress.total > 0 ? "▶ Continue Training" : "▶ Start Training"}
      </button>

      <div style={{ marginTop: "1.5rem" }}>
        <Link href="/app/puzzles" style={{ color: "#475569", fontSize: "0.8rem", textDecoration: "none" }}>
          ← Back to Puzzles
        </Link>
      </div>
    </div>
  );
}

// ── Not Found ────────────────────────────────────────────────────────────

function SetNotFound({ code }: { code: string }) {
  return (
    <div style={{ maxWidth: "500px", margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔍</div>
      <h1 style={{ color: "#e2e8f0", fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.75rem" }}>
        Set not found
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "0.5rem" }}>
        No puzzle set found for code <code style={{ color: "#fbbf24" }}>{code}</code>.
      </p>
      <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "2rem" }}>
        This set may have been created on a different device. Ask the creator for the correct link.
      </p>
      <Link
        href="/app/puzzles"
        style={{
          backgroundColor: "#4ade80",
          color: "#0f0f1a",
          borderRadius: "10px",
          padding: "0.75rem 1.75rem",
          textDecoration: "none",
          fontWeight: "bold",
          fontSize: "0.95rem",
        }}
      >
        Train with all puzzles →
      </Link>
      <div style={{ marginTop: "1rem" }}>
        <Link href="/sets" style={{ color: "#475569", fontSize: "0.8rem", textDecoration: "none" }}>
          Browse featured sets →
        </Link>
      </div>
    </div>
  );
}

// ── Creator Set Puzzle Mode Wrapper ───────────────────────────────────────
// Injects a creator set override into localStorage so Puzzle.tsx uses it.

function CreatorPuzzleTrainer({ set }: { set: CreatorSet }) {
  useEffect(() => {
    setActiveCreatorSet(set);
    incrementSetTimesUsed(set.id);
    return () => {
      // Don't clear on unmount — let user navigate back and see progress
    };
  }, [set]);

  // Determine a pattern theme for the puzzle component
  const patternName = set.patterns[0] ?? "fork";
  const matchingPattern = patterns.find(
    (p) => p.name.toLowerCase() === patternName.toLowerCase()
  );
  const patternKey = patternName.toLowerCase().replace(/ /g, "_");

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1rem" }}>
      {/* Set header */}
      <div style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #2e3a5c",
        borderRadius: "12px",
        padding: "1rem 1.25rem",
        marginBottom: "1.5rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.75rem",
      }}>
        <div>
          <div style={{ color: "#4ade80", fontSize: "0.72rem", fontWeight: "bold", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>
            🎯 CREATOR SET
          </div>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem" }}>{set.name}</div>
          {set.description && (
            <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.15rem" }}>{set.description}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: "1rem", flexShrink: 0 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#4ade80", fontWeight: "bold" }}>{set.puzzleIds.length}</div>
            <div style={{ color: "#64748b", fontSize: "0.7rem" }}>puzzles</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#fbbf24", fontWeight: "bold" }}>★ {set.minRating}–{set.maxRating}</div>
            <div style={{ color: "#64748b", fontSize: "0.7rem" }}>rating</div>
          </div>
        </div>
      </div>

      {/* Use the standard Puzzle component in mixed mode — it will pick up creator set puzzles */}
      <Suspense fallback={<div style={{ color: "#94a3b8", textAlign: "center", padding: "2rem" }}>Loading puzzle...</div>}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <PuzzlePage defaultMode="mixed" {...({ creatorSetIds: set.puzzleIds } as any)} />
      </Suspense>
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────

export default function TrainSetClient({ code }: { code: string }) {
  const [set, setSet] = useState<CreatorSet | null | "loading">("loading");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const resolved = resolveCreatorSet(code);
    setSet(resolved);
  }, [code]);

  if (set === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
        <div style={{ color: "#94a3b8" }}>Loading puzzle set...</div>
      </div>
    );
  }

  if (!set) {
    return <SetNotFound code={code} />;
  }

  if (!started) {
    return <SetLanding set={set} code={code} onStart={() => setStarted(true)} />;
  }

  return <CreatorPuzzleTrainer set={set} />;
}
