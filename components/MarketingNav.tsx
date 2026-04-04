"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function MarketingNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const linkStyle = (path: string) => ({
    color: pathname === path || pathname.startsWith(path + "/") ? "#e2e8f0" : "#94a3b8",
    textDecoration: "none" as const,
    fontSize: "0.9rem",
    fontWeight: (pathname === path || pathname.startsWith(path + "/")) ? "600" : "normal",
    padding: "0.5rem 0.85rem",
  });

  return (
    <nav style={{ backgroundColor: "#13132b", borderBottom: "1px solid #2e3a5c", position: "relative" }}>
      <div style={{ padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
        {/* Logo */}
        <Link href="/" style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1.1rem", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          ♔ <span style={{ color: "#4ade80" }}>Chess</span>Trainer
        </Link>

        {/* Desktop nav */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginLeft: "auto" }} className="desktop-nav">
          <Link href="/how-it-works" style={linkStyle("/how-it-works")}>How It Works</Link>
          <Link href="/pricing" style={linkStyle("/pricing")}>Pricing</Link>
          <Link href="/blog" style={linkStyle("/blog")}>Blog</Link>
          <Link href="/app/calibration" style={{ backgroundColor: "#4ade80", color: "#0f0f1a", padding: "0.5rem 1.25rem", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "0.9rem", marginLeft: "0.5rem" }}>
            Start Free
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="mobile-hamburger"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "0.5rem", color: "#e2e8f0", fontSize: "1.5rem", lineHeight: 1, marginLeft: "auto" }}
          aria-label="Toggle menu"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="mobile-menu" style={{ backgroundColor: "#13132b", borderTop: "1px solid #2e3a5c", padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Link href="/how-it-works" onClick={() => setMenuOpen(false)} style={{ color: "#94a3b8", textDecoration: "none", fontSize: "1rem", padding: "0.75rem 0", borderBottom: "1px solid #1e2a3c" }}>How It Works</Link>
          <Link href="/pricing" onClick={() => setMenuOpen(false)} style={{ color: "#94a3b8", textDecoration: "none", fontSize: "1rem", padding: "0.75rem 0", borderBottom: "1px solid #1e2a3c" }}>Pricing</Link>
          <Link href="/blog" onClick={() => setMenuOpen(false)} style={{ color: "#94a3b8", textDecoration: "none", fontSize: "1rem", padding: "0.75rem 0", borderBottom: "1px solid #1e2a3c" }}>Blog</Link>
          <Link href="/app/calibration" onClick={() => setMenuOpen(false)} style={{ backgroundColor: "#4ade80", color: "#0f0f1a", padding: "0.85rem 1.25rem", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "1rem", textAlign: "center", marginTop: "0.5rem" }}>
            Start Free →
          </Link>
        </div>
      )}

      <style>{`
        .desktop-nav { display: flex; }
        .mobile-hamburger { display: none; }
        .mobile-menu { display: flex; }
        @media (max-width: 640px) {
          .desktop-nav { display: none !important; }
          .mobile-hamburger { display: block !important; }
        }
        @media (min-width: 641px) {
          .mobile-menu { display: none !important; }
        }
      `}</style>
    </nav>
  );
}
