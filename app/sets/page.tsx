"use client";

import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { FEATURED_SETS } from "@/lib/creator";

const SET_ICONS: Record<string, string> = {
  FORK01: "⚔️",
  PIN001: "📌",
  BACK01: "🏰",
};

const CREATOR_NAMES: Record<string, string> = {
  FORK01: "ChessTrainer Team",
  PIN001: "ChessTrainer Team",
  BACK01: "ChessTrainer Team",
};

export default function SetsPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f0f1a" }}>
      <MarketingNav />

      {/* Hero */}
      <section style={{ maxWidth: "800px", margin: "0 auto", padding: "4rem 2rem 2rem", textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎯</div>
        <h1 style={{
          color: "#e2e8f0",
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          fontWeight: "bold",
          marginBottom: "0.75rem",
        }}>
          Featured Puzzle Sets
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, maxWidth: "520px", margin: "0 auto 1.5rem" }}>
          Curated puzzle sets built for targeted improvement.
          Click any set to start training — no account required.
        </p>
        <div style={{
          display: "inline-block",
          backgroundColor: "#0d2218",
          border: "1px solid #1a4a2a",
          borderRadius: "20px",
          padding: "0.35rem 1rem",
          color: "#4ade80",
          fontSize: "0.8rem",
          fontWeight: "bold",
          marginBottom: "0.5rem",
        }}>
          ✨ CREATOR MODE — SPRINT 23
        </div>
      </section>

      {/* Featured Sets */}
      <section style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem 2rem 4rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {FEATURED_SETS.map((set) => (
            <Link
              key={set.shareCode}
              href={`/app/train/${set.shareCode}`}
              style={{ textDecoration: "none" }}
            >
              <div style={{
                backgroundColor: "#1a1a2e",
                border: "1px solid #2e3a5c",
                borderRadius: "16px",
                padding: "1.5rem",
                transition: "border-color 0.15s, background-color 0.15s",
                cursor: "pointer",
                display: "flex",
                gap: "1.25rem",
                alignItems: "center",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#4ade80";
                (e.currentTarget as HTMLDivElement).style.backgroundColor = "#1a2e1a";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#2e3a5c";
                (e.currentTarget as HTMLDivElement).style.backgroundColor = "#1a1a2e";
              }}
              >
                {/* Icon */}
                <div style={{
                  fontSize: "2.5rem",
                  flexShrink: 0,
                  width: "56px",
                  height: "56px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#0a0f1a",
                  borderRadius: "12px",
                }}>
                  {SET_ICONS[set.shareCode] ?? "🎯"}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1.1rem", marginBottom: "0.3rem" }}>
                    {set.name}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.6, marginBottom: "0.6rem" }}>
                    {set.description}
                  </div>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "#4ade80", fontSize: "0.78rem", fontWeight: "bold" }}>
                      📦 50 puzzles
                    </span>
                    <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                      🎯 {set.patterns.join(", ")}
                    </span>
                    <span style={{ color: "#fbbf24", fontSize: "0.78rem" }}>
                      ★ {set.minRating}–{set.maxRating}
                    </span>
                    <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                      by {CREATOR_NAMES[set.shareCode] ?? "ChessTrainer"}
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ color: "#4ade80", fontSize: "1.25rem", flexShrink: 0 }}>→</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Creator CTA */}
        <div style={{
          marginTop: "3rem",
          backgroundColor: "#0a1520",
          border: "1px solid #1e3a5c",
          borderRadius: "16px",
          padding: "2rem",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🎬</div>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", marginBottom: "0.6rem" }}>
            Create Your Own Set
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: "1.25rem", maxWidth: "480px", margin: "0 auto 1.25rem" }}>
            Chess coaches, streamers, and YouTubers — build a custom puzzle set
            and share it with your audience in seconds.
          </p>
          <Link
            href="/app/creator"
            style={{
              backgroundColor: "#4ade80",
              color: "#0f0f1a",
              padding: "0.75rem 1.75rem",
              borderRadius: "10px",
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: "0.95rem",
              display: "inline-block",
            }}
          >
            Open Creator Mode →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: "#0a0a14", borderTop: "1px solid #1a1a2e", padding: "2rem", textAlign: "center" }}>
        <div style={{ color: "#4ade80", fontWeight: "bold", marginBottom: "0.5rem" }}>
          ♔ ChessTrainer
        </div>
        <div style={{ color: "#475569", fontSize: "0.8rem" }}>
          Science-based tactics training with spaced repetition
        </div>
      </footer>
    </div>
  );
}
