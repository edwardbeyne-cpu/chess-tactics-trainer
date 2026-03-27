'use client';

import PatternDetail from "@/components/PatternDetail";
import Paywall from "@/components/Paywall";

export default function PatternDetailPage() {
  return (
    <Paywall>
      <PatternDetail />
    </Paywall>
  );
}
