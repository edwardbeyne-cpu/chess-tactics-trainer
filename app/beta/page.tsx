"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { enableBetaAccess } from "@/lib/beta";

export default function BetaPage() {
  const router = useRouter();

  useEffect(() => {
    enableBetaAccess();
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0b1020 0%, #13132b 100%)",
      color: "#e2e8f0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "720px",
        backgroundColor: "rgba(19,19,43,0.92)",
        border: "1px solid #2e3a5c",
        borderRadius: "20px",
        padding: "2rem 2rem 2.2rem",
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
      }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <span style={{
            backgroundColor: "#7c3aed",
            color: "#ede9fe",
            borderRadius: "999px",
            padding: "0.22rem 0.6rem",
            fontSize: "0.72rem",
            fontWeight: "bold",
            letterSpacing: "0.08em",
          }}>
            BETA
          </span>
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "0.8rem" }}>
          Welcome to the Chess Tactics Trainer Beta
        </h1>
        <p style={{ color: "#94a3b8", lineHeight: 1.7, marginBottom: "1.4rem" }}>
          You&apos;re in. Beta access is unlocked automatically so you can test the full experience.
        </p>
        <ul style={{ color: "#cbd5e1", lineHeight: 1.9, marginBottom: "1.8rem", paddingLeft: "1.2rem" }}>
          <li>Train on tactical puzzles personalized to your weaknesses</li>
          <li>Connect your Chess.com or Lichess account for custom analysis</li>
          <li>Track your improvement with mastery-based spaced repetition</li>
          <li>Your feedback shapes the product — tell us what works and what doesn&apos;t</li>
        </ul>
        <button
          onClick={() => router.push("/app/training-plan")}
          style={{
            backgroundColor: "#4ade80",
            color: "#0f0f1a",
            border: "none",
            borderRadius: "12px",
            padding: "0.9rem 1.35rem",
            fontWeight: "bold",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          Get Started →
        </button>
      </div>
    </div>
  );
}
