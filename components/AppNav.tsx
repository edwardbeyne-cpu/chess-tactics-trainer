"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import AuthButton from "./AuthButton";

const mainNavItems: Array<{ href: string; label: string; pro?: boolean }> = [
  { href: "/app/dashboard", label: "Data" },
  { href: "/app/patterns", label: "Drill Tactics" },
  { href: "/app/puzzles", label: "Puzzles" },
  { href: "/app/review", label: "Review" },
  { href: "/app/custom-puzzles", label: "Custom Puzzles", pro: true },
];

export default function AppNav() {
  const pathname = usePathname();
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    try {
      const queue = JSON.parse(localStorage.getItem("ctt_review_queue") || "[]") as string[];
      setReviewCount(queue.length);
    } catch {
      setReviewCount(0);
    }
    // Refresh count on storage changes
    const handler = () => {
      try {
        const queue = JSON.parse(localStorage.getItem("ctt_review_queue") || "[]") as string[];
        setReviewCount(queue.length);
      } catch {
        setReviewCount(0);
      }
    };
    window.addEventListener("storage", handler);
    // Also poll every 10s for same-tab changes
    const interval = setInterval(handler, 10000);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

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

      <div style={{ display: "flex", gap: "0.25rem", flex: 1, flexWrap: "wrap" }}>
        {mainNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/app/patterns" && pathname.startsWith("/app/patterns"));
          const isReview = item.href === "/app/review";
          const isPro = item.pro === true;
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
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                transition: "color 0.15s",
              }}
            >
              {item.label}
              {isReview && reviewCount > 0 && (
                <span
                  style={{
                    backgroundColor: "#ef4444",
                    color: "white",
                    borderRadius: "999px",
                    fontSize: "0.65rem",
                    fontWeight: "bold",
                    padding: "0.1rem 0.4rem",
                    lineHeight: 1.4,
                    minWidth: "18px",
                    textAlign: "center",
                  }}
                >
                  {reviewCount}
                </span>
              )}
              {isPro && (
                <span
                  style={{
                    backgroundColor: "#a78bfa",
                    color: "#1a0a2e",
                    borderRadius: "999px",
                    fontSize: "0.55rem",
                    fontWeight: "bold",
                    padding: "0.1rem 0.4rem",
                    lineHeight: 1.4,
                    letterSpacing: "0.04em",
                  }}
                >
                  PRO
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Settings gear icon — top right */}
      <Link
        href="/app/settings"
        title="Settings"
        style={{
          color: pathname === "/app/settings" ? "#4ade80" : "#64748b",
          textDecoration: "none",
          fontSize: "1.25rem",
          padding: "0.5rem",
          display: "flex",
          alignItems: "center",
          transition: "color 0.15s",
        }}
      >
        ⚙️
      </Link>

      <AuthButton />
    </nav>
  );
}
