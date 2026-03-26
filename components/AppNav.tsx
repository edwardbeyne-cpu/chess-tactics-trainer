"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/puzzles", label: "Puzzles" },
  { href: "/app/review", label: "Review" },
  { href: "/app/patterns", label: "Patterns" },
  { href: "/app/achievements", label: "🏆 Achievements" },
  { href: "/app/settings", label: "Settings" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        backgroundColor: "#13132b",
        borderBottom: "1px solid #2e3a5c",
        padding: "0 2rem",
        display: "flex",
        alignItems: "center",
        gap: "2rem",
      }}
    >
      <Link
        href="/"
        style={{
          color: "#e2e8f0",
          fontWeight: "bold",
          fontSize: "1.1rem",
          textDecoration: "none",
          padding: "1rem 0",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexShrink: 0,
        }}
      >
        ♔ <span style={{ color: "#4ade80" }}>Chess</span>Trainer
      </Link>

      <div style={{ display: "flex", gap: "0.25rem", flex: 1 }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                backgroundColor: "transparent",
                borderBottom: isActive ? "2px solid #4ade80" : "2px solid transparent",
                color: isActive ? "#e2e8f0" : "#64748b",
                padding: "1rem",
                fontWeight: isActive ? "bold" : "normal",
                fontSize: "0.9rem",
                textDecoration: "none",
                display: "inline-block",
                transition: "color 0.15s",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Profile avatar placeholder */}
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          backgroundColor: "#2e3a5c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94a3b8",
          fontSize: "1rem",
          cursor: "pointer",
          flexShrink: 0,
        }}
        title="Profile"
      >
        👤
      </div>
    </nav>
  );
}
