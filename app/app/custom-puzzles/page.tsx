'use client';

import { Suspense, Component, type ReactNode } from "react";
import CustomPuzzles from "@/components/CustomPuzzles";
import { HelpModal, HelpBulletList } from "@/components/HelpModal";

// Error boundary to catch and display runtime errors instead of crashing the page
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</div>
          <h2 style={{ color: "#e2e8f0", marginBottom: "0.5rem" }}>Custom Puzzles failed to load</h2>
          <pre style={{
            color: "#ef4444", fontSize: "0.8rem", backgroundColor: "#1a1a2e",
            border: "1px solid #2e3a5c", borderRadius: "8px", padding: "1rem",
            textAlign: "left", maxWidth: "600px", margin: "1rem auto", overflow: "auto",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: "1rem", backgroundColor: "#4ade80", color: "#0f0f1a",
              border: "none", borderRadius: "8px", padding: "0.6rem 1.5rem",
              fontWeight: "bold", cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function CustomPuzzlesContent() {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
          <h1 style={{ color: "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", margin: 0 }}>
            Custom Puzzles
          </h1>
          <span style={{
            backgroundColor: '#a78bfa',
            color: '#1a0a2e',
            fontSize: '0.65rem',
            fontWeight: 'bold',
            padding: '0.2rem 0.5rem',
            borderRadius: '999px',
            letterSpacing: '0.05em',
          }}>
            PRO
          </span>
        </div>
        <p style={{ color: "#94a3b8", fontSize: "0.92rem", margin: "0 auto 0.75rem", maxWidth: "540px", lineHeight: 1.6 }}>
          Puzzles built from your own games — targeting the exact patterns you miss most
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <HelpModal title="How Custom Puzzles Works">
            <HelpBulletList items={[
              "Connect your Chess.com or Lichess account (no sign-in required — uses public APIs)",
              "We analyze your last 50 games to find tactical patterns you miss most",
              "A custom puzzle queue is built from your weakest patterns",
              "Train specifically on your weaknesses — not random puzzles",
              "Re-analyze anytime to refresh with your latest games",
              "Analysis uses heuristic pattern detection (Stockfish integration coming soon)",
            ]} />
          </HelpModal>
        </div>
      </div>
      <CustomPuzzles />
    </div>
  );
}

export default function CustomPuzzlesPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
          <div style={{ color: "#94a3b8", fontSize: "1rem" }}>Loading...</div>
        </div>
      }>
        <CustomPuzzlesContent />
      </Suspense>
    </ErrorBoundary>
  );
}
