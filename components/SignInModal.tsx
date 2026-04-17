"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

interface SignInModalProps {
  onClose: () => void;
  reason?: string;  // optional context line, e.g. "Sign in to unlock Custom Puzzles"
}

export default function SignInModal({ onClose, reason }: SignInModalProps) {
  const { signInWithGoogle, signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await signInWithEmail(email);
    setSubmitting(false);
    if (err) setError(err);
    else setSent(true);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.65)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#13132b",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "1.75rem",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <h2 style={{ color: "#e2e8f0", fontSize: "1.25rem", fontWeight: "bold", margin: "0 0 0.4rem" }}>
          Sign in
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
          {reason || "Sync your training across devices and unlock Pro features."}
        </p>

        {/* Google */}
        <button
          onClick={signInWithGoogle}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
            width: "100%",
            backgroundColor: "#ffffff",
            color: "#1f2937",
            border: "none",
            borderRadius: "10px",
            padding: "0.7rem",
            fontSize: "0.9rem",
            fontWeight: "bold",
            cursor: "pointer",
            marginBottom: "1rem",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", margin: "1rem 0", color: "#475569", fontSize: "0.75rem" }}>
          <div style={{ flex: 1, height: "1px", backgroundColor: "#2e3a5c" }} />
          OR
          <div style={{ flex: 1, height: "1px", backgroundColor: "#2e3a5c" }} />
        </div>

        {/* Magic link */}
        {sent ? (
          <div style={{
            backgroundColor: "rgba(74, 222, 128, 0.1)",
            border: "1px solid #4ade80",
            borderRadius: "10px",
            padding: "0.9rem",
            color: "#bbf7d0",
            fontSize: "0.85rem",
            lineHeight: 1.5,
          }}>
            ✓ Check your email — we sent a magic link to <strong>{email}</strong>. Click it to sign in.
          </div>
        ) : (
          <form onSubmit={handleEmail}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              style={{
                width: "100%",
                backgroundColor: "#0b1020",
                border: "1px solid #2e3a5c",
                borderRadius: "10px",
                padding: "0.7rem 0.85rem",
                color: "#e2e8f0",
                fontSize: "0.9rem",
                marginBottom: "0.6rem",
                boxSizing: "border-box",
              }}
            />
            {error && (
              <div style={{ color: "#fca5a5", fontSize: "0.8rem", marginBottom: "0.5rem" }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              style={{
                width: "100%",
                backgroundColor: "#4ade80",
                color: "#0f0f1a",
                border: "none",
                borderRadius: "10px",
                padding: "0.7rem",
                fontSize: "0.9rem",
                fontWeight: "bold",
                cursor: submitting ? "wait" : "pointer",
                opacity: submitting || !email.trim() ? 0.7 : 1,
              }}
            >
              {submitting ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}

        <button
          onClick={onClose}
          style={{
            display: "block",
            margin: "1rem auto 0",
            background: "none",
            border: "none",
            color: "#64748b",
            fontSize: "0.8rem",
            cursor: "pointer",
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
