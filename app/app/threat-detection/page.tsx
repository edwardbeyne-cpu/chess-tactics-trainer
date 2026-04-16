"use client";

import ThreatDetection from "@/components/ThreatDetection";

export default function ThreatDetectionPage() {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", marginBottom: "0.4rem" }}>
          Threat Detection
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.92rem", margin: "0 auto", maxWidth: "620px", lineHeight: 1.6 }}>
          Train your defensive vision — spot your opponent&apos;s tactic before it lands, then find the move that shuts it down.
        </p>
      </div>
      <ThreatDetection />
    </div>
  );
}
