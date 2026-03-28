"use client";

import { useState, useEffect, useCallback } from "react";

// ── HelpModal — reusable help/instructions overlay ────────────────────────

interface HelpModalProps {
  title: string;
  children: React.ReactNode;
}

export function HelpModal({ title, children }: HelpModalProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  return (
    <>
      {/* ? button */}
      <button
        onClick={() => setOpen(true)}
        title="How this works"
        aria-label="Help"
        style={{
          width: "26px",
          height: "26px",
          borderRadius: "50%",
          backgroundColor: "transparent",
          border: "1px solid #2e3a5c",
          color: "#475569",
          fontSize: "0.75rem",
          fontWeight: "bold",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          lineHeight: 1,
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#64748b";
          e.currentTarget.style.color = "#94a3b8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "#2e3a5c";
          e.currentTarget.style.color = "#475569";
        }}
      >
        ?
      </button>

      {/* Overlay */}
      {open && (
        <div
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          {/* Modal panel */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#1a1a2e",
              border: "1px solid #2e3a5c",
              borderRadius: "16px",
              padding: "1.75rem 2rem",
              maxWidth: "520px",
              width: "100%",
              position: "relative",
              boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
            }}
          >
            {/* Close button */}
            <button
              onClick={close}
              aria-label="Close"
              style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                background: "none",
                border: "none",
                color: "#475569",
                fontSize: "1.25rem",
                cursor: "pointer",
                lineHeight: 1,
                padding: "0.25rem",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#475569"; }}
            >
              ×
            </button>

            {/* Title */}
            <h2 style={{
              color: "#e2e8f0",
              fontSize: "1.1rem",
              fontWeight: "bold",
              marginBottom: "1.25rem",
              paddingRight: "1.5rem",
            }}>
              {title}
            </h2>

            {/* Content */}
            <div style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.7 }}>
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── HelpBulletList — convenience wrapper for bullet lists ─────────────────

export function HelpBulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {items.map((item, i) => (
        <li key={i} style={{ color: "#94a3b8" }}>{item}</li>
      ))}
    </ul>
  );
}
