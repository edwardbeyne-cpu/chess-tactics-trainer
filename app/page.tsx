import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import PricingCard from "@/components/PricingCard";

const features = [
  {
    icon: "♟️",
    title: "Your Games, Your Puzzles",
    desc: "Connect Chess.com and we analyze your blunders, then build a personal puzzle queue targeting your exact weaknesses — not generic positions.",
  },
  {
    icon: "🧠",
    title: "Spaced Repetition",
    desc: "The SM-2 algorithm shows you the right puzzle at the right time. Nail a pattern and it fades from your queue. Miss it and it comes back tomorrow.",
  },
  {
    icon: "📊",
    title: "Pattern Tracking",
    desc: "28 tactical patterns across 3 tiers — from forks and pins to windmills and zugzwang. Track your weakness per pattern, not just your overall score.",
  },
];

const faqs = [
  {
    q: "Is this really free?",
    a: "Yes. The free tier gives you 10 puzzles per day and full access to Tier 1 patterns — no credit card required, ever.",
  },
  {
    q: "How is this different from Chess.com Tactics?",
    a: "Chess.com shows you random puzzles. We show you the puzzles you need based on your actual game history and spaced repetition science. We're not competitors — we're complementary.",
  },
  {
    q: "What is spaced repetition?",
    a: "It's a learning technique backed by cognitive science. You review material at increasing intervals — right before you'd forget it. The SM-2 algorithm (used by Anki) optimizes this timing automatically.",
  },
  {
    q: "Do I need a Chess.com account?",
    a: "No. You can train with the full puzzle library without connecting Chess.com. The Chess.com integration just lets us personalize your queue based on your actual blunders.",
  },
  {
    q: "When is the Chess.com import available?",
    a: "Chess.com game import and full personalization is available on the Improver plan. Sign up free now to get early access.",
  },
];

export default function HomePage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f0f1a" }}>
      <MarketingNav />

      {/* Hero */}
      <section style={{ maxWidth: "900px", margin: "0 auto", padding: "6rem 2rem 4rem", textAlign: "center" }}>
        <div
          style={{
            display: "inline-block",
            backgroundColor: "#0d2218",
            border: "1px solid #1a4a2a",
            borderRadius: "20px",
            padding: "0.35rem 1rem",
            color: "#4ade80",
            fontSize: "0.8rem",
            fontWeight: "bold",
            marginBottom: "1.5rem",
            letterSpacing: "0.05em",
          }}
        >
          ♔ SCIENCE-BASED CHESS TRAINING
        </div>
        <h1
          style={{
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            fontWeight: "900",
            color: "#e2e8f0",
            lineHeight: 1.15,
            marginBottom: "1.25rem",
          }}
        >
          Chess.com is where you{" "}
          <span style={{ color: "#94a3b8" }}>play</span>.{" "}
          <br />
          This is where you{" "}
          <span style={{ color: "#4ade80" }}>improve</span>.
        </h1>
        <p
          style={{
            fontSize: "1.15rem",
            color: "#94a3b8",
            lineHeight: 1.7,
            marginBottom: "2.5rem",
            maxWidth: "640px",
            margin: "0 auto 2.5rem",
          }}
        >
          Science-based tactics training with spaced repetition — built around
          your games and your weaknesses.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/app/calibration"
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
            Start Free — No credit card required
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
      </section>

      {/* Stats bar */}
      <div style={{ backgroundColor: "#13132b", borderTop: "1px solid #2e3a5c", borderBottom: "1px solid #2e3a5c" }}>
        <div
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            padding: "1.5rem 2rem",
            display: "flex",
            justifyContent: "center",
            gap: "3rem",
            flexWrap: "wrap",
          }}
        >
          {[
            { val: "3M+", label: "Lichess puzzles" },
            { val: "28", label: "Tactical patterns" },
            { val: "SM-2", label: "Science-backed algorithm" },
          ].map((s) => (
            <div key={s.val} style={{ textAlign: "center" }}>
              <div style={{ color: "#4ade80", fontSize: "1.5rem", fontWeight: "bold" }}>{s.val}</div>
              <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature cards */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "5rem 2rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.75rem", fontWeight: "bold", textAlign: "center", marginBottom: "3rem" }}>
          Train smarter, not more
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                backgroundColor: "#1a1a2e",
                border: "1px solid #2e3a5c",
                borderRadius: "16px",
                padding: "2rem",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>{f.icon}</div>
              <h3 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "0.75rem" }}>
                {f.title}
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing preview */}
      <section style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 2rem 5rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.75rem", fontWeight: "bold", textAlign: "center", marginBottom: "0.5rem" }}>
          Simple pricing
        </h2>
        <p style={{ color: "#64748b", textAlign: "center", marginBottom: "3rem", fontSize: "0.95rem" }}>
          Start free. Upgrade when you&apos;re serious.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
          <PricingCard
            tier="free"
            features={[
              "10 puzzles per day",
              "Tier 1 patterns (8 patterns)",
              "Basic stats & streak tracking",
              "Spaced repetition queue",
              "No credit card required",
            ]}
            cta="Start Free"
            ctaHref="/app/dashboard"
          />
          <PricingCard
            tier="pro"
            price="$9.99"
            priceAnnual="$99"
            features={[
              "Unlimited puzzles",
              "All 28 patterns across 3 tiers",
              "Chess.com game import",
              "Full SRS with custom intervals",
              "Pattern analytics & weakness map",
              "Priority support",
            ]}
            cta="Start Free Trial"
            ctaHref="/app/dashboard"
            highlighted
          />
        </div>
        <p style={{ textAlign: "center", color: "#475569", fontSize: "0.8rem", marginTop: "1.5rem" }}>
          <Link href="/pricing" style={{ color: "#4ade80", textDecoration: "none" }}>
            See full pricing details →
          </Link>
        </p>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: "700px", margin: "0 auto", padding: "2rem 2rem 6rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1.75rem", fontWeight: "bold", textAlign: "center", marginBottom: "3rem" }}>
          FAQ
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {faqs.map((faq) => (
            <div
              key={faq.q}
              style={{
                backgroundColor: "#1a1a2e",
                border: "1px solid #2e3a5c",
                borderRadius: "12px",
                padding: "1.5rem",
              }}
            >
              <h3 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
                {faq.q}
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.65, margin: 0 }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section
        style={{
          backgroundColor: "#0d2218",
          borderTop: "1px solid #1a4a2a",
          padding: "4rem 2rem",
          textAlign: "center",
        }}
      >
        <h2 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", marginBottom: "1rem" }}>
          Ready to stop blundering the same patterns?
        </h2>
        <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>
          Join thousands of players training smarter with spaced repetition.
        </p>
        <Link
          href="/app/calibration"
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
          Start Free — No credit card required
        </Link>
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
