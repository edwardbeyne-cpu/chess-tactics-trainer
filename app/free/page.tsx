"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FreePage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ctt_sub_tier", "0");
    localStorage.setItem("ctt_beta_tester", "false");
    // Clear onboarding state so free testers get the full first-time experience
    try {
      localStorage.removeItem("ctt_calibration_complete");
      localStorage.removeItem("ctt_cct_onboarding_complete");
    } catch { /* ignore */ }
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
        maxWidth: "680px",
        backgroundColor: "rgba(19,19,43,0.92)",
        border: "1px solid #2e3a5c",
        borderRadius: "20px",
        padding: "2rem 2rem 2.2rem",
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
      }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <span style={{
            backgroundColor: "#334155",
            color: "#e2e8f0",
            borderRadius: "999px",
            padding: "0.22rem 0.6rem",
            fontSize: "0.72rem",
            fontWeight: "bold",
            letterSpacing: "0.08em",
          }}>
            FREE
          </span>
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "0.8rem" }}>
          Viewing as Free User
        </h1>
        <p style={{ color: "#94a3b8", lineHeight: 1.7, marginBottom: "1.6rem" }}>
          Pro and beta access are cleared on this device so you can test the full free-user experience, including paywalls and upgrade prompts.
        </p>
        <button
          onClick={() => router.push("/app/calibration")}
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
          Continue →
        </button>
      </div>
    </div>
  );
}
