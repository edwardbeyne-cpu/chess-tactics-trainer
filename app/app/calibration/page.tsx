"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CalibrationFlow from "@/components/CalibrationFlow";

type Step = "checking" | "intro" | "calibrating";

export default function CalibrationPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("checking");

  useEffect(() => {
    try {
      if (localStorage.getItem("ctt_calibration_complete") === "true") {
        router.replace("/app/training-plan");
        return;
      }
    } catch { /* ignore */ }
    setStep("intro");
  }, [router]);

  function handleComplete(_finalElo: number) {
    router.replace("/app/training-plan");
  }

  if (step === "checking") {
    return null;
  }

  if (step === "intro") {
    return (
      <div
        style={{
          minHeight: "80vh",
          backgroundColor: "#0a0f1a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
        }}
      >
        <div
          style={{
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "5rem", marginBottom: "1.5rem", color: "#4ade80" }}>♔</div>
          <h1
            style={{
              color: "#e2e8f0",
              fontSize: "1.8rem",
              fontWeight: "800",
              margin: "0 0 1rem",
              lineHeight: 1.2,
            }}
          >
            Let&apos;s find your level
          </h1>
          <p
            style={{
              color: "#94a3b8",
              fontSize: "1rem",
              lineHeight: 1.6,
              margin: "0 0 2.5rem",
            }}
          >
            Solve 10 puzzles at your own pace. We use your results to personalize your training.
          </p>
          <button
            onClick={() => setStep("calibrating")}
            style={{
              backgroundColor: "#4ade80",
              color: "#0f1a0a",
              border: "none",
              borderRadius: "12px",
              padding: "1rem 2.5rem",
              fontSize: "1.05rem",
              fontWeight: "bold",
              cursor: "pointer",
              width: "100%",
              maxWidth: "280px",
            }}
          >
            Start
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0f1a",
        padding: "1.5rem 1rem",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      <CalibrationFlow startingElo={1000} onComplete={handleComplete} />
    </div>
  );
}
