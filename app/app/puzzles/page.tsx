'use client';

import PuzzlePage from "@/components/Puzzle";
import Paywall from "@/components/Paywall";

export default function PuzzlesPage() {
  return (
    <Paywall>
      <PuzzlePage />
    </Paywall>
  );
}
