"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { saveFeedbackResponse, type FeedbackResponse } from "@/lib/feedback";

const FORMSPREE_ENDPOINT = process.env.NEXT_PUBLIC_FORMSPREE_ID
  ? `https://formspree.io/f/${process.env.NEXT_PUBLIC_FORMSPREE_ID}`
  : null;

type ChessLevel = FeedbackResponse["chessLevel"];

const defaultForm = {
  chessLevel: "" as ChessLevel | "",
  likedMost: "",
  frustrated: "",
  patternDifference: "",
  wouldPay: "",
};

export default function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.chessLevel) {
      setError("Please select your chess level.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Save locally
      saveFeedbackResponse({
        chessLevel: form.chessLevel as ChessLevel,
        likedMost: form.likedMost,
        frustrated: form.frustrated,
        patternDifference: form.patternDifference,
        wouldPay: form.wouldPay,
      });

      // Optionally submit to Formspree
      if (FORMSPREE_ENDPOINT) {
        const res = await fetch(FORMSPREE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            chessLevel: form.chessLevel,
            likedMost: form.likedMost,
            frustrated: form.frustrated,
            patternDifference: form.patternDifference,
            wouldPay: form.wouldPay,
          }),
        });
        if (!res.ok) {
          console.warn("Formspree submission failed — saved locally.");
        }
      }

      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Your feedback was saved locally.");
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSubmitted(false);
      setForm(defaultForm);
      setError("");
    }, 300);
  };

  const textAreaStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: "#0f0f1a",
    border: "1px solid #2e3a5c",
    borderRadius: "6px",
    padding: "0.6rem 0.75rem",
    color: "#e2e8f0",
    fontSize: "0.85rem",
    resize: "vertical",
    minHeight: "70px",
    fontFamily: "inherit",
    boxSizing: "border-box",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    color: "#94a3b8",
    fontSize: "0.8rem",
    fontWeight: "bold",
    display: "block",
    marginBottom: "0.4rem",
    marginTop: "1rem",
  };

  // Hide on calibration — it's a focused full-screen flow
  if (pathname === "/app/calibration") return null;

  return (
    <>
      {/* Persistent feedback button — bottom-right corner */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: "7rem",
          right: "1rem",
          backgroundColor: "#1a1a2e",
          border: "1px solid #2e3a5c",
          borderRadius: "24px",
          color: "#94a3b8",
          fontSize: "0.8rem",
          padding: "0.5rem 0.9rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          zIndex: 500,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = "#4ade80";
          e.currentTarget.style.color = "#e2e8f0";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = "#2e3a5c";
          e.currentTarget.style.color = "#94a3b8";
        }}
      >
        💬 Give Feedback
      </button>

      {/* Feedback modal */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1500,
            padding: "1rem",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            style={{
              backgroundColor: "#1a1a2e",
              border: "1px solid #2e3a5c",
              borderRadius: "16px",
              padding: "2rem",
              width: "100%",
              maxWidth: "520px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {submitted ? (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🙏</div>
                <h2 style={{ color: "#4ade80", fontWeight: "bold", marginBottom: "0.5rem" }}>
                  Thank you!
                </h2>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
                  Your feedback helps make ChessTrainer better for everyone.
                </p>
                <button
                  onClick={handleClose}
                  style={{
                    backgroundColor: "#4ade80",
                    color: "#0f0f1a",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.6rem 1.5rem",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <h2 style={{ color: "#e2e8f0", fontWeight: "bold", margin: 0, fontSize: "1.1rem" }}>
                    💬 Share your thoughts
                  </h2>
                  <button
                    onClick={handleClose}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#64748b",
                      fontSize: "1.2rem",
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSubmit}>
                  {/* Q1: Chess level */}
                  <label style={labelStyle}>
                    1. What&apos;s your chess level? <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {(["Beginner", "Intermediate", "Advanced"] as ChessLevel[]).map((level) => (
                      <label
                        key={level}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          backgroundColor: form.chessLevel === level ? "#0d2218" : "#0f0f1a",
                          border: `1px solid ${form.chessLevel === level ? "#4ade80" : "#2e3a5c"}`,
                          borderRadius: "6px",
                          padding: "0.4rem 0.75rem",
                          cursor: "pointer",
                          color: form.chessLevel === level ? "#4ade80" : "#94a3b8",
                          fontSize: "0.85rem",
                          transition: "all 0.15s",
                        }}
                      >
                        <input
                          type="radio"
                          name="chessLevel"
                          value={level}
                          checked={form.chessLevel === level}
                          onChange={() => handleChange("chessLevel", level)}
                          style={{ display: "none" }}
                        />
                        {level}
                      </label>
                    ))}
                  </div>

                  {/* Q2 */}
                  <label style={labelStyle}>2. What did you like most?</label>
                  <textarea
                    style={textAreaStyle}
                    value={form.likedMost}
                    onChange={(e) => handleChange("likedMost", e.target.value)}
                    placeholder="e.g. Pattern-based learning, puzzle quality..."
                  />

                  {/* Q3 */}
                  <label style={labelStyle}>3. What frustrated you or felt broken?</label>
                  <textarea
                    style={textAreaStyle}
                    value={form.frustrated}
                    onChange={(e) => handleChange("frustrated", e.target.value)}
                    placeholder="e.g. Loading speed, UI confusion..."
                  />

                  {/* Q4 */}
                  <label style={labelStyle}>
                    4. Did the pattern-based approach feel different from other trainers? How?
                  </label>
                  <textarea
                    style={textAreaStyle}
                    value={form.patternDifference}
                    onChange={(e) => handleChange("patternDifference", e.target.value)}
                    placeholder="Compared to Chess.com tactics, Lichess, etc."
                  />

                  {/* Q5 */}
                  <label style={labelStyle}>
                    5. Would you pay for this? If yes, what would feel fair per month?
                  </label>
                  <textarea
                    style={textAreaStyle}
                    value={form.wouldPay}
                    onChange={(e) => handleChange("wouldPay", e.target.value)}
                    placeholder="e.g. Yes, $5–10/month feels right..."
                  />

                  {error && (
                    <div style={{ color: "#ef4444", fontSize: "0.8rem", marginTop: "0.75rem" }}>{error}</div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      width: "100%",
                      backgroundColor: "#4ade80",
                      color: "#0f0f1a",
                      border: "none",
                      borderRadius: "8px",
                      padding: "0.75rem",
                      fontSize: "0.95rem",
                      fontWeight: "bold",
                      cursor: submitting ? "wait" : "pointer",
                      marginTop: "1.5rem",
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? "Submitting…" : "Submit Feedback"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
