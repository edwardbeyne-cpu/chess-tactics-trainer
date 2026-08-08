"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const mainNavItems: Array<{ href: string; label: string }> = [
  { href: "/app/training-plan", label: "Training Plan" },
  { href: "/app/training", label: "Training" },
  { href: "/app/threat-detection", label: "Threat Detection" },
  { href: "/app/patterns", label: "Drill Tactics" },
  { href: "/app/custom-puzzles", label: "Custom Puzzles" },
  { href: "/app/tools", label: "Tools" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        backgroundColor: "#13132b",
        borderBottom: "1px solid #2e3a5c",
        padding: "0 1rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
      }}
    >
      <style>{`nav::-webkit-scrollbar { display: none; }`}</style>
      <Link
        href="/app/training-plan"
        style={{
          color: "#e2e8f0",
          fontWeight: "bold",
          fontSize: "1rem",
          textDecoration: "none",
          padding: "0.9rem 0",
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        ♔ <span style={{ color: "#4ade80" }}>Chess</span>Trainer
      </Link>

      <div style={{ display: "flex", gap: "0.1rem", flex: 1, overflowX: "auto", scrollbarWidth: "none" }}>
        {mainNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/app/patterns" && pathname.startsWith("/app/patterns"));
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                backgroundColor: "transparent",
                borderBottom: isActive ? "2px solid #4ade80" : "2px solid transparent",
                color: isActive ? "#e2e8f0" : "#64748b",
                padding: "0.9rem 0.75rem",
                fontWeight: isActive ? "bold" : "normal",
                fontSize: "0.85rem",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                transition: "color 0.15s",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <Link
        href="/app/debug"
        title="Debug"
        style={{
          color: pathname === "/app/debug" ? "#60a5fa" : "#64748b",
          textDecoration: "none",
          fontSize: "0.95rem",
          padding: "0.5rem",
          display: "flex",
          alignItems: "center",
          transition: "color 0.15s",
          flexShrink: 0,
          fontWeight: "bold",
        }}
      >
        Debug
      </Link>

      <Link
        href="/app/settings"
        title="Settings"
        style={{
          color: pathname === "/app/settings" ? "#4ade80" : "#64748b",
          textDecoration: "none",
          fontSize: "1.1rem",
          padding: "0.5rem",
          display: "flex",
          alignItems: "center",
          transition: "color 0.15s",
          flexShrink: 0,
        }}
      >
        ⚙️
      </Link>
    </nav>
  );
}
