"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getUserProfile } from "@/lib/auth";

/**
 * Hero call-to-action that adapts to returning users. New visitors see
 * "Start Free"; people who already have an account or completed calibration
 * get a direct "Continue Training" path back into the app.
 */
export default function HeroCTA() {
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    try {
      const hasProfile = !!getUserProfile();
      const calibrated = localStorage.getItem("ctt_calibration_complete") === "true";
      setReturning(hasProfile || calibrated);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
      <Link
        href={returning ? "/app" : "/app/calibration"}
        style={{
          backgroundColor: "#4ade80",
          color: "#0f0f1a",
          padding: "0.85rem 2rem",
          borderRadius: "10px",
          textDecoration: "none",
          fontWeight: "bold",
          fontSize: "1rem",
        }}
      >
        {returning ? "Continue Training →" : "Start Free — No credit card required"}
      </Link>
      <Link
        href="/how-it-works"
        style={{
          backgroundColor: "transparent",
          color: "#e2e8f0",
          padding: "0.85rem 2rem",
          borderRadius: "10px",
          textDecoration: "none",
          fontWeight: "600",
          fontSize: "1rem",
          border: "1px solid #2e3a5c",
        }}
      >
        See How It Works →
      </Link>
    </div>
  );
}
