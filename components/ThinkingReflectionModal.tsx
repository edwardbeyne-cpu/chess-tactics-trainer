"use client";

import { useState, useEffect } from "react";

interface ThinkingReflectionModalProps {
  puzzleId: string;
  onComplete: (sawTactic: boolean, candidateMoves: number) => void;
}

export default function ThinkingReflectionModal({ puzzleId, onComplete }: ThinkingReflectionModalProps) {
  const [step, setStep] = useState<"saw-tactic" | "candidates" | "done">("saw-tactic");
  const [sawTactic, setSawTactic] = useState<boolean | null>(null);
  const [countdown, setCountdown] = useState(5);

  // Auto-dismiss after 5 seconds with defaults
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          // Auto-dismiss with defaults
          const tactic = sawTactic ?? false;
          onComplete(tactic, 1);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step === "done") return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 3000,
        padding: "1rem",
        paddingBottom: "2rem",
      }}
    >
      <div
        style={{
          backgroundColor: "#1a1a2e",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "1.25rem 1.5rem",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.6)",
        }}
      >
        {/* Auto-dismiss bar */}
        <div style={{
          height: "3px",
          backgroundColor: "#1e2a3a",
          borderRadius: "2px",
          marginBottom: "1rem",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            backgroundColor: "#2e75b6",
            width: `${(countdown / 5) * 100}%`,
            transition: "width 1s linear",
          }} />
        </div>

        {step === "saw-tactic" && (
          <>
            <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem", marginBottom: "0.5rem" }}>
              🎯 Did you see the tactic before moving?
            </div>
            <div style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "1rem" }}>
              Auto-dismisses in {countdown}s
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => { setSawTactic(false); setStep("candidates"); setCountdown(5); }}
                style={{
                  flex: 1,
                  backgroundColor: "#1e2a3a",
                  color: "#e2e8f0",
                  border: "1px solid #2e3a5c",
                  borderRadius: "10px",
                  padding: "0.65rem",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  fontWeight: "600",
                }}
              >
                ❌ No
              </button>
              <button
                onClick={() => { setSawTactic(true); setStep("candidates"); setCountdown(5); }}
                style={{
                  flex: 1,
                  backgroundColor: "#0a1f12",
                  color: "#4ade80",
                  border: "1px solid #1a4a2a",
                  borderRadius: "10px",
                  padding: "0.65rem",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  fontWeight: "600",
                }}
              >
                ✅ Yes
              </button>
            </div>
          </>
        )}

        {step === "candidates" && (
          <>
            <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.95rem", marginBottom: "0.5rem" }}>
              🤔 How many candidate moves did you consider?
            </div>
            <div style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: "1rem" }}>
              Auto-dismisses in {countdown}s
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    const tactic = sawTactic ?? false;
                    onComplete(tactic, n);
                    setStep("done");
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: "#1e2a3a",
                    color: "#e2e8f0",
                    border: "1px solid #2e3a5c",
                    borderRadius: "10px",
                    padding: "0.65rem",
                    cursor: "pointer",
                    fontSize: "0.95rem",
                    fontWeight: "600",
                  }}
                >
                  {n === 3 ? "3+" : n}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
