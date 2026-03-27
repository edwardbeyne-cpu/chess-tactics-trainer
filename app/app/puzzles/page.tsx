'use client';

import { Suspense } from "react";
import PuzzlePage from "@/components/Puzzle";
import Paywall from "@/components/Paywall";

function PuzzlePageContent() {
  return (
    <Paywall>
      <PuzzlePage />
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
