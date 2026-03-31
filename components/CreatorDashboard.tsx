"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import patterns from "@/data/patterns";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";
import {
  getCreatorSets,
  getCreatorProfile,
  saveCreatorProfile,
  addCreatorSet,
  updateCreatorSet,
  deleteCreatorSet,
  generateUniqueShareCode,
  type CreatorSet,
  type CreatorProfile,
} from "@/lib/creator";

// ── Pattern key mapping (pattern name → db key) ───────────────────────────
const PATTERN_TO_DB_KEY: Record<string, string> = {
  "Fork": "fork",
  "Pin": "pin",
  "Skewer": "skewer",
  "Discovered Attack": "discoveredAttack",
  "Back Rank Mate": "backRankMate",
  "Smothered Mate": "smotheredMate",
  "Double Check": "doubleCheck",
  "Overloading": "overloading",
  "Greek Gift Sacrifice": "attraction",
  "Zwischenzug": "interference",
  "Deflection": "deflection",
  "Decoy": "attraction",
  "X-Ray Attack": "trappedPiece",
  "Removing the Defender": "clearance",
  "Interference": "interference",
  "Perpetual Check": "zugzwang",
  "Windmill": "skewer",
  "Zugzwang": "zugzwang",
  "Rook Lift": "kingsideAttack",
  "Queen Sacrifice": "overloading",
  "Positional Sacrifice": "discoveredAttack",
  "Trapped Piece": "trappedPiece",
  "Fortress": "zugzwang",
  "King March": "kingsideAttack",
};

function getDbKeyForPattern(patternName: string): string {
  return PATTERN_TO_DB_KEY[patternName] ?? patternName.toLowerCase().replace(/ /g, "");
}

// ── Match puzzles from DB based on patterns + rating range ────────────────
function matchPuzzles(patternNames: string[], minRating: number, maxRating: number, limit = 50): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  // For each selected pattern, pull matching puzzles
  for (const name of patternNames) {
    const dbKey = getDbKeyForPattern(name);
    const pool = cachedPuzzlesByTheme[dbKey] ?? [];
    for (const p of pool) {
      if (!seen.has(p.id) && p.rating >= minRating && p.rating <= maxRating) {
        seen.add(p.id);
        ids.push(p.id);
        if (ids.length >= limit) return ids;
      }
    }
  }
  return ids.slice(0, limit);
}

function getPreviewPuzzles(patternNames: string[], minRating: number, maxRating: number) {
  const ids = matchPuzzles(patternNames, minRating, maxRating, 5);
  const preview: Array<{ id: string; rating: number; pattern: string }> = [];
  for (const name of patternNames) {
    const dbKey = getDbKeyForPattern(name);
    const pool = cachedPuzzlesByTheme[dbKey] ?? [];
    for (const p of pool) {
      if (ids.includes(p.id)) {
        preview.push({ id: p.id, rating: p.rating, pattern: name });
      }
    }
  }
  return preview.slice(0, 5);
}

// ── Sub-components ────────────────────────────────────────────────────────

function ProfileSection({ profile, onSave }: { profile: CreatorProfile; onSave: (p: CreatorProfile) => void }) {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "16px",
      padding: "1.5rem",
      marginBottom: "2rem",
    }}>
      <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "1rem" }}>
        🎙️ Creator Profile
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label style={{ color: "#94a3b8", fontSize: "0.8rem", display: "block", marginBottom: "0.35rem" }}>
            Creator Name *
          </label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. GothamChess"
            style={{
              width: "100%",
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.6rem 0.75rem",
              color: "#e2e8f0",
              fontSize: "0.9rem",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label style={{ color: "#94a3b8", fontSize: "0.8rem", display: "block", marginBottom: "0.35rem" }}>
            YouTube URL (optional)
          </label>
          <input
            type="url"
            value={draft.youtubeUrl}
            onChange={(e) => setDraft({ ...draft, youtubeUrl: e.target.value })}
            placeholder="https://youtube.com/@..."
            style={{
              width: "100%",
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.6rem 0.75rem",
              color: "#e2e8f0",
              fontSize: "0.9rem",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label style={{ color: "#94a3b8", fontSize: "0.8rem", display: "block", marginBottom: "0.35rem" }}>
            Twitter/X URL (optional)
          </label>
          <input
            type="url"
            value={draft.twitterUrl}
            onChange={(e) => setDraft({ ...draft, twitterUrl: e.target.value })}
            placeholder="https://x.com/..."
            style={{
              width: "100%",
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.6rem 0.75rem",
              color: "#e2e8f0",
              fontSize: "0.9rem",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label style={{ color: "#94a3b8", fontSize: "0.8rem", display: "block", marginBottom: "0.35rem" }}>
            Website URL (optional)
          </label>
          <input
            type="url"
            value={draft.websiteUrl}
            onChange={(e) => setDraft({ ...draft, websiteUrl: e.target.value })}
            placeholder="https://..."
            style={{
              width: "100%",
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.6rem 0.75rem",
              color: "#e2e8f0",
              fontSize: "0.9rem",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>
      <button
        onClick={handleSave}
        style={{
          marginTop: "1rem",
          backgroundColor: saved ? "#166534" : "#4ade80",
          color: saved ? "#4ade80" : "#0f0f1a",
          border: "none",
          borderRadius: "8px",
          padding: "0.6rem 1.5rem",
          cursor: "pointer",
          fontWeight: "bold",
          fontSize: "0.9rem",
          transition: "background 0.2s",
        }}
      >
        {saved ? "✓ Saved" : "Save Profile"}
      </button>
    </div>
  );
}

function CreateSetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(800);
  const [maxRating, setMaxRating] = useState(1600);
  const [preview, setPreview] = useState<Array<{ id: string; rating: number; pattern: string }>>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedPatterns.length > 0) {
      const prev = getPreviewPuzzles(selectedPatterns, minRating, maxRating);
      setPreview(prev);
      const all = matchPuzzles(selectedPatterns, minRating, maxRating, 50);
      setMatchCount(all.length);
    } else {
      setPreview([]);
      setMatchCount(0);
    }
  }, [selectedPatterns, minRating, maxRating]);

  function togglePattern(name: string) {
    setSelectedPatterns((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  }

  function handleSave() {
    if (!name.trim()) { setError("Set name is required"); return; }
    if (selectedPatterns.length === 0) { setError("Select at least one pattern"); return; }
    if (matchCount === 0) { setError("No puzzles match your filters — try adjusting rating range"); return; }

    setSaving(true);
    const sets = getCreatorSets();
    const existingCodes = sets.map((s) => s.shareCode);
    const shareCode = generateUniqueShareCode(existingCodes);
    const puzzleIds = matchPuzzles(selectedPatterns, minRating, maxRating, 50);

    const newSet: CreatorSet = {
      id: `set_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      patterns: selectedPatterns,
      minRating,
      maxRating,
      puzzleIds,
      shareCode,
      createdAt: new Date().toISOString().slice(0, 10),
      timesUsed: 0,
    };

    addCreatorSet(newSet);
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: "1rem",
    }}>
      <div style={{
        backgroundColor: "#13132b",
        border: "1px solid #2e3a5c",
        borderRadius: "20px",
        padding: "2rem",
        width: "100%",
        maxWidth: "640px",
        maxHeight: "90vh",
        overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.3rem", fontWeight: "bold", margin: 0 }}>
            ✨ Create Puzzle Set
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "1.4rem", lineHeight: 1 }}>×</button>
        </div>

        {error && (
          <div style={{ backgroundColor: "#1f0505", border: "1px solid #ef4444", borderRadius: "8px", padding: "0.75rem", color: "#ef4444", fontSize: "0.85rem", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* Name */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ color: "#94a3b8", fontSize: "0.8rem", display: "block", marginBottom: "0.35rem" }}>Set Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder="e.g. GothamChess Fork Fundamentals"
            style={{
              width: "100%",
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.65rem 0.85rem",
              color: "#e2e8f0",
              fontSize: "0.9rem",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ color: "#94a3b8", fontSize: "0.8rem", display: "block", marginBottom: "0.35rem" }}>
            Description (1-2 sentences)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will users learn from this set?"
            rows={2}
            style={{
              width: "100%",
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.65rem 0.85rem",
              color: "#e2e8f0",
              fontSize: "0.9rem",
              boxSizing: "border-box",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Pattern Selection */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ color: "#94a3b8", fontSize: "0.8rem", display: "block", marginBottom: "0.6rem" }}>
            Select Patterns *
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {patterns.map((p) => {
              const isSelected = selectedPatterns.includes(p.name);
              return (
                <button
                  key={p.name}
                  onClick={() => { togglePattern(p.name); setError(""); }}
                  style={{
                    backgroundColor: isSelected ? "#0d2218" : "#0f1621",
                    border: `1px solid ${isSelected ? "#4ade80" : "#2e3a5c"}`,
                    borderRadius: "20px",
                    padding: "0.35rem 0.75rem",
                    color: isSelected ? "#4ade80" : "#64748b",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    fontWeight: isSelected ? "bold" : "normal",
                    transition: "all 0.15s",
                  }}
                >
                  {p.icon} {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rating Range */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ color: "#94a3b8", fontSize: "0.8rem", display: "block", marginBottom: "0.6rem" }}>
            Difficulty Range (puzzle rating)
          </label>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.25rem" }}>Min Rating</div>
              <input
                type="number"
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                min={400}
                max={2500}
                step={50}
                style={{
                  width: "100%",
                  backgroundColor: "#0f1621",
                  border: "1px solid #2e3a5c",
                  borderRadius: "8px",
                  padding: "0.55rem 0.75rem",
                  color: "#e2e8f0",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ color: "#475569", paddingTop: "1.2rem" }}>—</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "0.25rem" }}>Max Rating</div>
              <input
                type="number"
                value={maxRating}
                onChange={(e) => setMaxRating(Number(e.target.value))}
                min={400}
                max={2800}
                step={50}
                style={{
                  width: "100%",
                  backgroundColor: "#0f1621",
                  border: "1px solid #2e3a5c",
                  borderRadius: "8px",
                  padding: "0.55rem 0.75rem",
                  color: "#e2e8f0",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        {selectedPatterns.length > 0 && (
          <div style={{
            backgroundColor: "#0a0f1a",
            border: "1px solid #1e2a3c",
            borderRadius: "10px",
            padding: "1rem",
            marginBottom: "1.25rem",
          }}>
            <div style={{ color: "#4ade80", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
              {matchCount} puzzles match — up to 50 will be selected
            </div>
            {preview.length > 0 ? (
              <>
                <div style={{ color: "#64748b", fontSize: "0.72rem", marginBottom: "0.5rem" }}>Preview (first 5):</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {preview.map((p) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "0.8rem" }}>
                      <span>#{p.id}</span>
                      <span style={{ color: "#64748b" }}>{p.pattern}</span>
                      <span style={{ color: "#fbbf24" }}>★ {p.rating}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: "#64748b", fontSize: "0.8rem" }}>No puzzles found for this rating range</div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              border: "1px solid #2e3a5c",
              borderRadius: "8px",
              padding: "0.65rem 1.25rem",
              color: "#64748b",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              backgroundColor: "#4ade80",
              color: "#0f0f1a",
              border: "none",
              borderRadius: "8px",
              padding: "0.65rem 1.5rem",
              cursor: saving ? "default" : "pointer",
              fontWeight: "bold",
              fontSize: "0.9rem",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Creating..." : "✨ Create Set"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SetCard({ set, onDelete }: { set: CreatorSet; onDelete: () => void }) {
  const shareUrl = `https://chesstacticstrainer.com/train/${set.shareCode}`;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "14px",
      padding: "1.25rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.6rem" }}>
        <div>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem" }}>{set.name}</div>
          {set.description && (
            <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.2rem", lineHeight: 1.5 }}>{set.description}</div>
          )}
        </div>
        <button
          onClick={onDelete}
          title="Delete set"
          style={{
            background: "none",
            border: "none",
            color: "#475569",
            cursor: "pointer",
            fontSize: "1rem",
            padding: "0.25rem",
            lineHeight: 1,
          }}
        >
          🗑️
        </button>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
        <span style={{ color: "#4ade80", fontSize: "0.78rem" }}>📦 {set.puzzleIds.length} puzzles</span>
        <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>🎯 {set.patterns.join(", ")}</span>
        <span style={{ color: "#fbbf24", fontSize: "0.78rem" }}>★ {set.minRating}–{set.maxRating}</span>
        <span style={{ color: "#64748b", fontSize: "0.78rem" }}>👥 {set.timesUsed} uses</span>
      </div>

      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <code style={{
          backgroundColor: "#0a0f1a",
          border: "1px solid #1e2a3c",
          borderRadius: "6px",
          padding: "0.3rem 0.6rem",
          color: "#4ade80",
          fontSize: "0.85rem",
          fontFamily: "monospace",
          letterSpacing: "0.05em",
        }}>
          {set.shareCode}
        </code>

        <button
          onClick={copyLink}
          style={{
            backgroundColor: copied ? "#0d2218" : "#0f1621",
            border: `1px solid ${copied ? "#4ade80" : "#2e3a5c"}`,
            borderRadius: "8px",
            padding: "0.35rem 0.75rem",
            color: copied ? "#4ade80" : "#94a3b8",
            fontSize: "0.8rem",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {copied ? "✓ Copied!" : "📋 Copy Link"}
        </button>

        <Link
          href={`/app/train/${set.shareCode}`}
          style={{
            backgroundColor: "#0f1621",
            border: "1px solid #2e3a5c",
            borderRadius: "8px",
            padding: "0.35rem 0.75rem",
            color: "#94a3b8",
            fontSize: "0.8rem",
            textDecoration: "none",
            transition: "all 0.15s",
          }}
        >
          🔗 Preview
        </Link>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function CreatorDashboard() {
  const [sets, setSets] = useState<CreatorSet[]>([]);
  const [profile, setProfile] = useState<CreatorProfile>({ name: "", youtubeUrl: "", twitterUrl: "", websiteUrl: "" });
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadData = useCallback(() => {
    setSets(getCreatorSets());
    setProfile(getCreatorProfile());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleSaveProfile(p: CreatorProfile) {
    saveCreatorProfile(p);
    setProfile(p);
  }

  function handleDeleteSet(id: string) {
    if (!window.confirm("Delete this puzzle set?")) return;
    deleteCreatorSet(id);
    loadData();
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem 1rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", margin: "0 0 0.4rem" }}>
          🎬 Creator Mode
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0, lineHeight: 1.6 }}>
          Create custom puzzle sets and share them with your audience. Each set gets a unique link you can post anywhere.
        </p>
      </div>

      {/* Profile */}
      <ProfileSection profile={profile} onSave={handleSaveProfile} />

      {/* My Puzzle Sets */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "1rem",
      }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: 0 }}>
          My Puzzle Sets
          {sets.length > 0 && (
            <span style={{
              marginLeft: "0.6rem",
              backgroundColor: "#1e2a3c",
              color: "#94a3b8",
              borderRadius: "999px",
              padding: "0.15rem 0.55rem",
              fontSize: "0.75rem",
              fontWeight: "normal",
            }}>
              {sets.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            backgroundColor: "#4ade80",
            color: "#0f0f1a",
            border: "none",
            borderRadius: "10px",
            padding: "0.6rem 1.25rem",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "0.9rem",
          }}
        >
          + Create New Set
        </button>
      </div>

      {sets.length === 0 ? (
        <div style={{
          backgroundColor: "#1a1a2e",
          border: "1px dashed #2e3a5c",
          borderRadius: "16px",
          padding: "3rem",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🎯</div>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "0.5rem" }}>No sets yet</div>
          <div style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
            Create your first puzzle set and share it with your audience.
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              backgroundColor: "#4ade80",
              color: "#0f0f1a",
              border: "none",
              borderRadius: "10px",
              padding: "0.75rem 1.75rem",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.95rem",
            }}
          >
            + Create Your First Set
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {sets.map((set) => (
            <SetCard
              key={set.id}
              set={set}
              onDelete={() => handleDeleteSet(set.id)}
            />
          ))}
        </div>
      )}

      {/* Info box */}
      <div style={{
        marginTop: "2rem",
        backgroundColor: "#0a1520",
        border: "1px solid #1e3a5c",
        borderRadius: "12px",
        padding: "1.25rem",
      }}>
        <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          💡 How Creator Mode works
        </div>
        <ul style={{ color: "#64748b", fontSize: "0.82rem", margin: 0, paddingLeft: "1.25rem", lineHeight: 1.8 }}>
          <li>Create sets by selecting patterns and a difficulty range</li>
          <li>Each set gets a 6-character share code (e.g. FORK01)</li>
          <li>Share the link <code style={{ color: "#94a3b8" }}>chesstacticstrainer.com/train/FORK01</code> anywhere</li>
          <li>Your audience trains your exact puzzle selection</li>
          <li>Sets are stored locally — share codes work on any device</li>
        </ul>
      </div>

      {showCreateModal && (
        <CreateSetModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
