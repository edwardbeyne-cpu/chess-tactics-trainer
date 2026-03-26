'use client';

import MarketingNav from "@/components/MarketingNav";
import PricingCard from "@/components/PricingCard";
import UpgradeModal from "@/components/UpgradeModal";
import Link from "next/link";
import { useState } from "react";



const freeFeatures = [
  "10 puzzles per day",
  "Tier 1 patterns (8 basic tactics)",
  "Basic stats & 30-day activity calendar",
  "Spaced repetition review queue",
  "Streak tracking",
  "No credit card required",
];

const proFeatures = [
  "Unlimited puzzles per day",
  "All 28 tactical patterns across 3 tiers",
  "Chess.com game import & blunder analysis",
  "Full SRS with custom intervals",
  "Pattern analytics & weakness heatmap",
  "Puzzle rating & milestone tracking",
  "Priority support",
  "Early access to new features",
];

export default function PricingPage() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f0f1a" }}>
      <MarketingNav />
      {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}

      <section style={{ maxWidth: "900px", margin: "0 auto", padding: "5rem 2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <h1 style={{ color: "#e2e8f0", fontSize: "2.5rem", fontWeight: "900", marginBottom: "1rem" }}>
            Simple, honest pricing
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "1rem", maxWidth: "500px", margin: "0 auto" }}>
            Start free and train forever. Upgrade when you want unlimited access and personalization.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem", marginBottom: "4rem" }}>
          <PricingCard
            tier="free"
            features={freeFeatures}
            cta="Start Free — No credit card"
            ctaHref="/app/dashboard"
          />
          {/* Pro card with updated pricing */}
          <div
            style={{
              backgroundColor: "#0d2218",
              border: `2px solid #4ade80`,
              borderRadius: "16px",
              padding: "2rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-14px",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "#4ade80",
                color: "#0f0f1a",
                padding: "0.25rem 1rem",
                borderRadius: "20px",
                fontSize: "0.75rem",
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}
            >
              MOST POPULAR
            </div>

            <div>
              <div
                style={{
                  color: "#4ade80",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: "0.5rem",
                }}
              >
                Pro
              </div>
              <div>
                <span
                  style={{ color: "#e2e8f0", fontSize: "2.5rem", fontWeight: "bold" }}
                >
                  $9.99
                </span>
                <span style={{ color: "#64748b", fontSize: "0.9rem" }}>/month</span>
                <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                  or $69.99/year (save 42%)
                </div>
              </div>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {proFeatures.map((f, i) => (
                <li
                  key={i}
                  style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", color: "#cbd5e1", fontSize: "0.9rem" }}
                >
                  <span style={{ color: "#4ade80", flexShrink: 0, marginTop: "2px" }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => setShowUpgradeModal(true)}
              style={{
                backgroundColor: "#4ade80",
                color: "#0f0f1a",
                border: `2px solid #4ade80`,
                borderRadius: "8px",
                padding: "0.75rem",
                textAlign: "center",
                textDecoration: "none",
                fontWeight: "bold",
                fontSize: "0.95rem",
                display: "block",
                width: "100%",
                cursor: "pointer",
              }}
            >
              Start Free Trial
            </button>
          </div>
        </div>

        {/* Comparison note */}
        <div
          style={{
            backgroundColor: "#1a1a2e",
            border: "1px solid #2e3a5c",
            borderRadius: "12px",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>🎯</div>
          <h3 style={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "0.5rem" }}>
            Not sure? Start free.
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "1.5rem", maxWidth: "420px", margin: "0 auto 1.5rem" }}>
            The free tier is genuinely useful — 10 puzzles a day is enough to build real habits. Upgrade when you want more.
          </p>
          <Link
            href="/app/dashboard"
            style={{
              backgroundColor: "#4ade80",
              color: "#0f0f1a",
              padding: "0.75rem 2rem",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: "0.95rem",
            }}
          >
            Start Free Today
          </Link>
        </div>
      </section>
    </div>
  );
}
