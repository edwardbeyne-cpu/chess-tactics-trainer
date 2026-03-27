// Login page

import Link from "next/link";

export const metadata = {
  title: "Sign In — ChessTrainer",
};

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0f0f1a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <Link
        href="/"
        style={{
          color: "#e2e8f0",
          fontWeight: "bold",
          fontSize: "1.2rem",
          textDecoration: "none",
          marginBottom: "3rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        ♔ <span style={{ color: "#4ade80" }}>Chess</span>Trainer
      </Link>

      <div
        style={{
          backgroundColor: "#1a1a2e",
          border: "1px solid #2e3a5c",
          borderRadius: "16px",
          padding: "3rem",
          width: "100%",
          maxWidth: "420px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            color: "#e2e8f0",
            fontSize: "1.5rem",
            fontWeight: "bold",
            marginBottom: "0.5rem",
          }}
        >
          Welcome back
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "2rem" }}>
          Sign in to access your training dashboard
        </p>

        <div
          style={{
            backgroundColor: "#0d2218",
            border: "1px solid #1a4a2a",
            borderRadius: "8px",
            padding: "0.75rem",
            color: "#4ade80",
            fontSize: "0.8rem",
            marginBottom: "1.5rem",
          }}
        >
          Training data is saved locally in your browser. No account required to get started.
        </div>

        <Link
          href="/app/dashboard"
          style={{
            display: "block",
            backgroundColor: "#4ade80",
            color: "#0f0f1a",
            padding: "0.85rem",
            borderRadius: "10px",
            textDecoration: "none",
            fontWeight: "bold",
            fontSize: "0.95rem",
          }}
        >
          Continue without account →
        </Link>

        <p style={{ color: "#475569", fontSize: "0.8rem", marginTop: "1.5rem" }}>
          Don&apos;t have an account?{" "}
          <Link href="/app/dashboard" style={{ color: "#4ade80", textDecoration: "none" }}>
            Start free
          </Link>
        </p>
      </div>
    </div>
  );
}
