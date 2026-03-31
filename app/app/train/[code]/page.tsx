import { Suspense } from "react";
import TrainSetClient from "@/components/TrainSetClient";

export const metadata = {
  title: "Train — ChessTrainer",
  description: "Train a custom puzzle set shared by a chess creator.",
};

export default async function TrainPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
        <div style={{ color: "#94a3b8", fontSize: "1rem" }}>Loading puzzle set...</div>
      </div>
    }>
      <TrainSetClient code={code.toUpperCase()} />
    </Suspense>
  );
}
