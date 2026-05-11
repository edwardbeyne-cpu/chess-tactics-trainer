"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CalibrationFlow, { clearCalibrationProgress } from "@/components/CalibrationFlow";
import { getMasteryProgress, saveMasteryProgress } from "@/lib/storage";
import { generateMasterySet } from "@/components/TrainingSession";

type Step = "checking" | "intro" | "calibrating";

export default function CalibrationPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("checking");

  useEffect(() => {
    let next: Step = "intro";
    try {
      if (localStorage.getItem("ctt_calibration_complete") === "true") {
        router.replace("/app/training-plan");
        return;
      }
      // If the user already started calibration (and possibly finished all 10
      // puzzles), skip the intro and drop them straight back into the flow.
      // CalibrationFlow restores its own state from ctt_calibration_progress.
      if (localStorage.getItem("ctt_calibration_progress")) {
        next = "calibrating";
      }
    } catch { /* ignore */ }
    setStep(next);
  }, [router]);

  function handleComplete(_finalElo: number) {
    try {
      localStorage.setItem("ctt_calibration_complete", "true");
      clearCalibrationProgress();
      // Sync calibration rating into tactics rating so both show same starting number
      const calibRating = _finalElo || parseInt(localStorage.getItem("ctt_calibration_rating") || "800", 10);
      const existingTactics = (() => { try { return JSON.parse(localStorage.getItem("ctt_tactics_rating") || "null"); } catch { return null; } })();
      if (!existingTactics || existingTactics.tacticsRating === 800) {
        localStorage.setItem("ctt_tactics_rating", JSON.stringify({
          tacticsRating: calibRating,
          tacticsRatingStart: calibRating,
          tacticsRatingHistory: [],
        }));
      }
      // Initialize mastery Set 1 so Training Plan shows it immediately
      const progress = getMasteryProgress();
      if (progress.sets.length === 0) {
        const set1 = generateMasterySet(1);
        saveMasteryProgress({
          ...progress,
          currentSetNumber: 1,
          sets: [set1],
        });
      }
    } catch { /* ignore */ }
    router.replace("/app/training-plan");
  }

  if (step === "checking") {
    return null;
  }

  if (step === "intro") {
    return (
      <div
        style={{
          minHeight: "calc(100vh - 56px)",
          backgroundColor: "#0a0f1a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 1rem",
          marginTop: "-2rem", // cancel app layout padding
        }}
      >
        <div
          style={{
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "clamp(4rem, 15vw, 8rem)", marginBottom: "1rem", color: "#4ade80", lineHeight: 1 }}>♔</div>
          <h1
            style={{
              color: "#e2e8f0",
              fontSize: "1.5rem",
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
              fontSize: "0.95rem",
              lineHeight: 1.6,
              margin: "0 0 0.75rem",
            }}
          >
            Solve 10 puzzles at your own pace. We use your results to personalize your training.
          </p>
          <p
            style={{
              color: "#4ade80",
              fontSize: "0.85rem",
              lineHeight: 1.6,
              margin: "0 0 2.5rem",
              fontWeight: 600,
            }}
          >
            At the end, you&apos;ll get your personalized training plan.
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
