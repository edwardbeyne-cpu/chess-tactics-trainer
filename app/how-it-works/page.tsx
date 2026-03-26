import MarketingNav from "@/components/MarketingNav";
import Link from "next/link";

export const metadata = {
  title: "How It Works — ChessTrainer",
  description: "Learn how ChessTrainer uses spaced repetition and pattern tracking to accelerate your chess improvement.",
};

const steps = [
  {
    number: "01",
    icon: "🔗",
    title: "Connect",
    headline: "Import your games, find your weaknesses",
    desc: "Link your Chess.com account and we analyze your last 100+ games. We identify the tactical patterns you missed — forks you didn't see, pins you walked into, back rank mates you overlooked.",
    note: "Chess.com import coming in next sprint — train manually now.",
  },
  {
    number: "02",
    icon: "♟️",
    title: "Train",
    headline: "Solve puzzles targeted to your gaps",
    desc: "Your personal queue is filled with puzzles that match the patterns you struggle with. Solve them on a real interactive board. Every correct move advances your interval — every missed move resets it.",
    note: "The board supports drag-to-move, arrow drawing, and square highlighting.",
  },
  {
    number: "03",
    icon: "📈",
    title: "Improve",
    headline: "Watch your pattern recognition transform",
    desc: "Track your progress per pattern across 3 tiers. See which patterns you've mastered, which need work, and when your next reviews are due. Your weaknesses become strengths over weeks, not years.",
    note: "28 patterns tracked: 8 basic, 8 intermediate, 8 advanced.",
  },
];

export default function HowItWorksPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f0f1a" }}>
      <MarketingNav />

      <section style={{ maxWidth: "800px", margin: "0 auto", padding: "5rem 2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "5rem" }}>
          <h1 style={{ color: "#e2e8f0", fontSize: "2.5rem", fontWeight: "900", marginBottom: "1rem" }}>
            How It Works
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "1.05rem", maxWidth: "520px", margin: "0 auto" }}>
            Three steps. Science-backed. Built to actually move the needle on your chess.
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem", marginBottom: "5rem" }}>
          {steps.map((step, i) => (
            <div
              key={step.number}
              style={{
                backgroundColor: "#1a1a2e",
                border: "1px solid #2e3a5c",
                borderRadius: "16px",
                padding: "2rem",
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "1.5rem",
                alignItems: "start",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>{step.icon}</div>
                <div style={{ color: "#4ade80", fontSize: "0.75rem", fontWeight: "bold", letterSpacing: "0.1em" }}>
                  STEP {step.number}
                </div>
              </div>
              <div>
                <div
                  style={{
                    display: "inline-block",
                    backgroundColor: "#0d2218",
                    border: "1px solid #1a4a2a",
                    borderRadius: "6px",
                    padding: "0.2rem 0.6rem",
                    color: "#4ade80",
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                    marginBottom: "0.75rem",
                  }}
                >
                  {step.title.toUpperCase()}
                </div>
                <h3 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", marginBottom: "0.75rem" }}>
                  {step.headline}
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, margin: "0 0 0.75rem" }}>
                  {step.desc}
                </p>
                <div style={{ color: "#475569", fontSize: "0.8rem", fontStyle: "italic" }}>
                  {step.note}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Spaced repetition explainer */}
        <div
          style={{
            backgroundColor: "#0d2218",
            border: "1px solid #1a4a2a",
            borderRadius: "16px",
            padding: "2rem",
            marginBottom: "2rem",
          }}
        >
          <h2 style={{ color: "#4ade80", fontSize: "1.2rem", fontWeight: "bold", marginBottom: "1rem" }}>
            🧠 What is spaced repetition?
          </h2>
          <p style={{ color: "#cbd5e1", fontSize: "0.9rem", lineHeight: 1.7, margin: "0 0 1rem" }}>
            Spaced repetition is a learning technique backed by decades of cognitive science research. The core insight: you remember things better when you review them at the right intervals — right before you&apos;d forget them.
          </p>
          <p style={{ color: "#cbd5e1", fontSize: "0.9rem", lineHeight: 1.7, margin: "0 0 1rem" }}>
            We use the <strong style={{ color: "#e2e8f0" }}>SM-2 algorithm</strong> — the same one powering Anki, the most popular flashcard app used by medical students worldwide. When you solve a puzzle correctly, its next review gets pushed further out (1 day → 3 days → 7 days → 14 days → 30 days). When you fail, it resets to tomorrow.
          </p>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
            The result: you spend your training time on the patterns you&apos;re about to forget — not the ones you already know cold.
          </p>
        </div>

        {/* Pattern tracking explainer */}
        <div
          style={{
            backgroundColor: "#150e1f",
            border: "1px solid #3a1f5a",
            borderRadius: "16px",
            padding: "2rem",
            marginBottom: "4rem",
          }}
        >
          <h2 style={{ color: "#a855f7", fontSize: "1.2rem", fontWeight: "bold", marginBottom: "1rem" }}>
            📊 How pattern tracking works
          </h2>
          <p style={{ color: "#cbd5e1", fontSize: "0.9rem", lineHeight: 1.7, margin: "0 0 1rem" }}>
            Most tactics trainers tell you your overall rating. We tell you which specific patterns you&apos;re weak at.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1rem" }}>
            {[
              { tier: "Tier 1", color: "#22c55e", patterns: "Fork, Pin, Skewer, Back Rank Mate, Smothered Mate, Double Check, Overloading, Discovered Attack" },
              { tier: "Tier 2", color: "#f59e0b", patterns: "Greek Gift, Zwischenzug, Deflection, Decoy, X-Ray, Removing the Defender, Interference, Perpetual Check" },
              { tier: "Tier 3", color: "#a855f7", patterns: "Windmill, Zugzwang, Rook Lift, Queen Sacrifice, Positional Sacrifice, Trapped Piece, Fortress, King March" },
            ].map((t) => (
              <div key={t.tier} style={{ backgroundColor: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "0.75rem" }}>
                <div style={{ color: t.color, fontSize: "0.75rem", fontWeight: "bold", marginBottom: "0.4rem" }}>{t.tier}</div>
                <div style={{ color: "#64748b", fontSize: "0.72rem", lineHeight: 1.5 }}>{t.patterns}</div>
              </div>
            ))}
          </div>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.6, margin: 0 }}>
            Each pattern has its own progress bar showing how many puzzles you&apos;ve solved. Click any pattern to see its description and your attempt history.
          </p>
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <Link
            href="/app/dashboard"
            style={{
              backgroundColor: "#4ade80",
              color: "#0f0f1a",
              padding: "1rem 2.5rem",
              borderRadius: "10px",
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: "1.1rem",
            }}
          >
            Start Training Free →
          </Link>
        </div>
      </section>
    </div>
  );
}
