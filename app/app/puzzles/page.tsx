'use client';

import { Suspense } from "react";
import PuzzlePage from "@/components/Puzzle";
import Paywall from "@/components/Paywall";
import { HelpModal, HelpBulletList } from "@/components/HelpModal";

function PuzzlePageContent() {
  return (
    <Paywall>
      {/* Sprint 3: Compact page header — one line, Guide button inline */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        marginBottom: "1.25rem",
        flexWrap: "wrap",
      }}>
        <h1 style={{
          color: "#e2e8f0",
          fontSize: "1.2rem",
          fontWeight: "bold",
          margin: 0,
          lineHeight: 1,
        }}>
          Puzzles
        </h1>
        <span style={{ color: "#475569", fontSize: "0.8rem", flex: 1, minWidth: "120px" }}>
          Mixed tactics · adaptive difficulty
        </span>
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
