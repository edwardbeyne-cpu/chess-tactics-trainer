'use client';

import { Suspense } from "react";
import PuzzlePage from "@/components/Puzzle";
import Paywall from "@/components/Paywall";
import { HelpModal, HelpBulletList } from "@/components/HelpModal";

function PuzzlePageContent() {
  return (
    <Paywall>
      {/* Page header with help button */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "1.6rem", fontWeight: "bold", margin: 0 }}>
          🎲 Puzzles
        </h1>
        <HelpModal title="How Puzzles Works">
          <HelpBulletList items={[
            "Random puzzles from all tactical patterns, matched to your overall rating",
            "As you solve puzzles correctly your rating climbs — miss them and it drops",
            "The difficulty automatically adjusts to keep you challenged",
            "This is your main training mode once you've built your pattern foundation",
            "Your overall tactics rating shown here is your true strength indicator",
          ]} />
        </HelpModal>
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
