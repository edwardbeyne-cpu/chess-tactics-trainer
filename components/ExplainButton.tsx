"use client";

import { useState, useCallback } from "react";
import { getCachedExplanation, setCachedExplanation } from "@/lib/storage";

interface ExplainButtonProps {
  puzzleId: string;
  fen: string;
  solution: string[];
  theme: string;
}

export default function ExplainButton({ puzzleId, fen, solution, theme }: ExplainButtonProps) {
  const [explanation, setExplanation] = useState<string | null>(() => getCachedExplanation(puzzleId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<boolean>(() => !!getCachedExplanation(puzzleId));

  const handleExplain = useCallback(async () => {
    // Check cache first
    const cached = getCachedExplanation(puzzleId);
    if (cached) {
      setExplanation(cached);
      setShown(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ puzzleId, fen, solution, theme }),
      });

      const data = await res.json();
      const text = data.explanation ?? "Could not generate explanation.";
      setCachedExplanation(puzzleId, text);
      setExplanation(text);
      setShown(true);
    } catch {
      setError("Failed to load explanation.");
    } finally {
      setLoading(false);
    }
  }, [puzzleId, fen, solution, theme]);

  return (
    <>
      {/* Explain button — shows in Controls panel */}
      <button
        onClick={shown ? () => setShown(false) : handleExplain}
        disabled={loading}
        style={{
          backgroundColor: shown ? "#0a1f12" : "#1a2e0a",
          color: shown ? "#4ade80" : "#86efac",
          border: `1px solid ${shown ? "#1a4a2a" : "#2a5a1a"}`,
          borderRadius: "8px",
          padding: "0.6rem",
          cursor: loading ? "wait" : "pointer",
          fontSize: "0.85rem",
          fontWeight: "600",
          transition: "background 0.15s, color 0.15s",
          textAlign: "center" as const,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            e.currentTarget.style.backgroundColor = "#152e0a";
            e.currentTarget.style.color = "#4ade80";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = shown ? "#0a1f12" : "#1a2e0a";
          e.currentTarget.style.color = shown ? "#4ade80" : "#86efac";
        }}
      >
        {loading ? (
          <>⟳ Explaining...</>
        ) : shown ? (
          <>💡 Hide Explanation</>
        ) : (
          <>💡 Explain this</>
        )}
      </button>

      {/* Explanation card */}
      {shown && explanation && (
        <div style={{
          backgroundColor: "#0a1f12",
          border: "1px solid #1a4a2a",
          borderRadius: "10px",
          padding: "1rem 1.1rem",
          marginTop: "0.25rem",
        }}>
          <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
            💡 Why This Works
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.65 }}>
            {explanation}
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: "#ef4444", fontSize: "0.75rem", marginTop: "0.25rem" }}>
          {error}
        </div>
      )}
    </>
  );
}
