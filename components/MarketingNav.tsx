"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MarketingNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        backgroundColor: "#13132b",
        borderBottom: "1px solid #2e3a5c",
        padding: "0 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "60px",
      }}
    >
      <Link
        href="/"
        style={{
          color: "#e2e8f0",
          fontWeight: "bold",
          fontSize: "1.1rem",
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        ♔ <span style={{ color: "#4ade80" }}>Chess</span>Trainer
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
        <Link
          href="/how-it-works"
          style={{
            color: pathname === "/how-it-works" ? "#e2e8f0" : "#94a3b8",
            textDecoration: "none",
            fontSize: "0.9rem",
            fontWeight: pathname === "/how-it-works" ? "600" : "normal",
            padding: "0.5rem 0.85rem",
          }}
        >
          How It Works
        </Link>
        <Link
          href="/pricing"
          style={{
            color: pathname === "/pricing" ? "#e2e8f0" : "#94a3b8",
            textDecoration: "none",
            fontSize: "0.9rem",
            fontWeight: pathname === "/pricing" ? "600" : "normal",
            padding: "0.5rem 0.85rem",
          }}
        >
          Pricing
        </Link>
        <Link
          href="/app/dashboard"
          style={{
            backgroundColor: "#4ade80",
            color: "#0f0f1a",
            padding: "0.5rem 1.25rem",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: "bold",
            fontSize: "0.9rem",
            marginLeft: "0.5rem",
            marginRight: "1rem",
          }}
        >
          Start Free
        </Link>
      </div>
    </nav>
  );
}
