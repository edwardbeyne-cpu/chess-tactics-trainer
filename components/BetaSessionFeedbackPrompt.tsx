"use client";

import { useState } from "react";
import { saveBetaFeedback, isBetaTester } from "@/lib/beta";

export default function BetaSessionFeedbackPrompt({
  page,
  onClose,
}: {
  page: string;
  onClose: () => void;
}) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");

  if (!isBetaTester()) return null;

  return (
    <div style={{
      backgroundColor: "#13132b",
      border: "1px solid #2e3a5c",
      borderRadius: "14px",
      padding: "1rem 1.1rem",
      marginTop: "1rem",
    }}>
      <div style={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "0.35rem" }}>
        How was that session?
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.8rem" }}>
        <button
          onClick={() => setRating("up")}
          style={{
            backgroundColor: rating === "up" ? "#0d2218" : "transparent",
            border: `1px solid ${rating === "up" ? "#4ade80" : "#2e3a5c"}`,
            borderRadius: "10px",
            color: rating === "up" ? "#4ade80" : "#94a3b8",
            padding: "0.45rem 0.8rem",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          👍
        </button>
        <button
          onClick={() => setRating("down")}
          style={{
            backgroundColor: rating === "down" ? "#2a1616" : "transparent",
            border: `1px solid ${rating === "down" ? "#ef4444" : "#2e3a5c"}`,
            borderRadius: "10px",
            color: rating === "down" ? "#ef4444" : "#94a3b8",
            padding: "0.45rem 0.8rem",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          👎
        </button>
      </div>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Any feedback? (optional)"
        style={{
          width: "100%",
          backgroundColor: "#0f0f1a",
          border: "1px solid #2e3a5c",
          borderRadius: "8px",
          color: "#e2e8f0",
          padding: "0.7rem 0.8rem",
          marginBottom: "0.8rem",
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{
            backgroundColor: "transparent",
            border: "1px solid #2e3a5c",
            borderRadius: "8px",
            color: "#94a3b8",
            padding: "0.6rem 0.9rem",
            cursor: "pointer",
          }}
        >
          Skip
        </button>
        <button
          onClick={() => {
            if (!rating) {
              onClose();
              return;
            }
            saveBetaFeedback({ page, rating, comment: comment.trim() });
            onClose();
          }}
          style={{
            backgroundColor: "#4ade80",
            border: "none",
            borderRadius: "8px",
            color: "#0f0f1a",
            padding: "0.6rem 1rem",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
