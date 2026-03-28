"use client";

import { useState } from "react";
import { applyBetaCode, dismissBetaPrompt } from "@/lib/auth";

interface BetaAccessModalProps {
  onClose: () => void;
  onApplied?: () => void;
}

export default function BetaAccessModal({ onClose, onApplied }: BetaAccessModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError("Please enter a code.");
      return;
    }
    const ok = applyBetaCode(code.trim());
    if (!ok) {
      setError("Invalid code. Try again.");
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      onApplied?.();
    }, 1500);
  };

  const handleSkip = () => {
    dismissBetaPrompt();
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleSkip(); }}
    >
      <div
        style={{
          backgroundColor: "#1a1a2e",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "2rem",
          width: "100%",
          maxWidth: "420px",
          textAlign: "center",
        }}
      >
        {success ? (
          <>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
            <h2 style={{ color: "#4ade80", fontWeight: "bold", marginBottom: "0.5rem" }}>
              Beta Pro Unlocked!
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              You now have full access to all patterns, puzzles, and mixed mode.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔑</div>
            <h2 style={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "0.5rem" }}>
              Have a beta access code?
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              Enter your code to unlock full Pro access — all patterns, all puzzles, mixed mode. No credit card required.
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(""); }}
                placeholder="Enter code (e.g. BETA2026)"
                autoFocus
                style={{
                  width: "100%",
                  backgroundColor: "#0f0f1a",
                  border: error ? "1px solid #ef4444" : "1px solid #2e3a5c",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem",
                  color: "#e2e8f0",
                  fontSize: "1rem",
                  textAlign: "center",
                  letterSpacing: "0.1em",
                  fontWeight: "bold",
                  marginBottom: "0.5rem",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
              {error && (
                <div style={{ color: "#ef4444", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                style={{
                  width: "100%",
                  backgroundColor: "#4ade80",
                  color: "#0f0f1a",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  fontSize: "0.95rem",
                  fontWeight: "bold",
                  cursor: "pointer",
                  marginBottom: "0.75rem",
                }}
              >
                Unlock Pro Access
              </button>
            </form>

            <button
              onClick={handleSkip}
              style={{
                backgroundColor: "transparent",
                border: "none",
                color: "#475569",
                fontSize: "0.8rem",
                cursor: "pointer",
                padding: "0.25rem",
              }}
            >
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
