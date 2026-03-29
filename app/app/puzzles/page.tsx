'use client';

import { Suspense } from "react";
import PuzzlePage from "@/components/Puzzle";
import Paywall from "@/components/Paywall";
import { HelpModal, HelpBulletList } from "@/components/HelpModal";

function PuzzlePageContent() {
  return (
    <Paywall>
      {/* Page header */}
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", margin: "0 0 0.4rem" }}>
          Puzzles
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.92rem", margin: "0 auto 0.75rem", maxWidth: "540px", lineHeight: 1.6 }}>
          Random puzzles matched to your rating — sharpen your pattern recognition across all tactics
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <HelpModal title="How Puzzles Works">
            <HelpBulletList items={[
              "Random puzzles from all tactical patterns, matched to your Puzzle Rating",
              "As you solve puzzles correctly your Puzzle Rating climbs — miss them and it drops",
              "The difficulty automatically adjusts to keep you challenged",
              "Your Puzzle Rating here is separate from your Drill Tactics pattern ratings",
              "Use Drill Tactics to train specific patterns; use Puzzles for mixed practice",
            ]} />
          </HelpModal>
        </div>
      </div>
      <PuzzlePage defaultMode="mixed" />
    </Paywall>
  );
}

export default function PuzzlesPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
        <div style={{ color: "#94a3b8", fontSize: "1rem" }}>Loading puzzle...</div>
      </div>
    }>
      <PuzzlePageContent />
    </Suspense>
  );
}
