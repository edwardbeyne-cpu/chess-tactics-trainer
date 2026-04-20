"use client";

import { safeSetItem } from "@/lib/safe-storage";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CalibrationFlow from "./CalibrationFlow";

const ONBOARDED_KEY = "ctt_onboarded";
const CALIBRATION_COMPLETE_KEY = "ctt_calibration_complete";
const CALIBRATION_RATING_KEY = "ctt_calibration_rating";
const PATTERN_RATINGS_KEY = "ctt_pattern_ratings";
const TACTICS_RATING_KEY = "ctt_tactics_rating";
const PUZZLE_RATING_KEY = "ctt_puzzle_rating";
const GOAL_KEY = "ctt_goal";
const GOAL_START_RATING_KEY = "ctt_goal_start_rating";

export type UserGoal = "structured_plan" | "find_weaknesses" | "drill_puzzles" | "from_my_games";

const PATTERN_THEMES = [
  "FORK","PIN","SKEWER","DISCOVERED ATTACK","DISCOVERED CHECK",
  "BACK RANK MATE","BACK RANK","SMOTHERED MATE","DOUBLE CHECK",
  "OVERLOADING","OVERLOADED PIECE","GREEK GIFT","GREEK GIFT SACRIFICE",
  "ZWISCHENZUG","IN-BETWEEN MOVE","DEFLECTION","DECOY","LURING",
  "X-RAY","X-RAY ATTACK","REMOVING THE DEFENDER","UNDERMINING",
  "INTERFERENCE","PERPETUAL CHECK","PERPETUAL","WINDMILL","ZUGZWANG",
  "ROOK LIFT","QUEEN SACRIFICE","POSITIONAL SACRIFICE","POSITIONAL",
  "TRAPPED PIECE","TRAPPED","FORTRESS","KING MARCH","KING ACTIVITY",
  // camelCase keys used in storage
  "fork","pin","skewer","discoveredAttack","discoveredCheck",
  "backRankMate","smotheredMate","doubleCheck","overloading","deflection",
  "interference","zugzwang","attraction","clearance","trappedPiece",
  "kingsideAttack","queensideAttack",
];

function seedRatings(elo: number) {
  if (typeof window === "undefined") return;

  // Feature 2: Seed pattern ratings below calibration ELO for confidence-building runway.
  // User calibrates at X → patterns start at X-150 so puzzles begin slightly below their level.
  const patternStartElo = Math.max(600, elo - 150);
  const patternRatings: Record<string, { theme: string; rating: number; gamesPlayed: number; history: [] }> = {};
  for (const theme of PATTERN_THEMES) {
    patternRatings[theme] = { theme, rating: patternStartElo, gamesPlayed: 0, history: [] };
  }
  safeSetItem(PATTERN_RATINGS_KEY, JSON.stringify(patternRatings));

  // Tactics and puzzle ratings seeded at full calibration ELO
  const tacticsData = {
    tacticsRating: elo,
    tacticsRatingStart: elo,
    tacticsRatingHistory: [],
    totalPuzzlesRated: 0,
    lastMilestoneAt: elo,
  };
  safeSetItem(TACTICS_RATING_KEY, JSON.stringify(tacticsData));
  safeSetItem(PUZZLE_RATING_KEY, JSON.stringify({ rating: elo, totalPuzzlesRated: 0 }));
  safeSetItem(GOAL_START_RATING_KEY, String(elo));
}

const GOAL_OPTIONS: Array<{ value: UserGoal; icon: string; label: string; sub: string }> = [
  { value: "structured_plan", icon: "🎯", label: "I want a structured training plan", sub: "Start with fundamentals and build up" },
  { value: "find_weaknesses", icon: "🔍", label: "Show me my specific weaknesses", sub: "Target the patterns you struggle with most" },
  { value: "drill_puzzles", icon: "⚡", label: "I just want to drill puzzles", sub: "Jump straight into puzzle solving" },
  { value: "from_my_games", icon: "🎮", label: "Build me a training program from my games", sub: "Train on tactics from your own games" },
];

export default function OnboardingModal() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedGoal, setSelectedGoal] = useState<UserGoal | null>(null);

  const router = useRouter();

  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARDED_KEY);
    if (!onboarded) {
      setShow(true);
    }
  }, []);

  function handleStep1Continue() {
    if (!selectedGoal) return;
    safeSetItem(GOAL_KEY, selectedGoal);
    setStep(2);
  }

  function handleCalibrationComplete(finalElo: number) {
    seedRatings(finalElo);
    safeSetItem(CALIBRATION_COMPLETE_KEY, "true");
    safeSetItem(CALIBRATION_RATING_KEY, String(finalElo));
    safeSetItem(GOAL_START_RATING_KEY, String(finalElo));
    safeSetItem(ONBOARDED_KEY, "true");
    setShow(false);
    router.push("/app/training-plan");
  }

  if (!show) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    overflowY: "auto",
  };

  const isCalibrating = step === 2;

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#1a1a2e",
    border: "1px solid #2e3a5c",
    borderRadius: "16px",
    padding: isCalibrating ? "1.25rem 1.25rem 1.5rem" : "2rem",
    maxWidth: isCalibrating ? "520px" : "480px",
    width: "100%",
    boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
    margin: "auto",
  };

  // Step indicator — only shown on step 1
  const stepIndicator = step === 1 ? (
    <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "1.75rem" }}>
      {[1, 2].map((s) => (
        <div
          key={s}
          style={{
            width: s === step ? "24px" : "8px",
            height: "8px",
            borderRadius: "4px",
            backgroundColor: s === step ? "#4ade80" : s < step ? "#22863a" : "#2e3a5c",
            transition: "all 0.3s",
          }}
        />
      ))}
    </div>
  ) : null;

  // ── Step 1: Goal ─────────────────────────────────────────────────────────
  if (step === 1) {
    const canContinue = selectedGoal !== null;
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          {stepIndicator}

          <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎯</div>
            <h2 style={{ color: "#e2e8f0", fontSize: "1.3rem", fontWeight: "bold", margin: "0 0 0.4rem" }}>
              What&apos;s your main goal?
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
              We&apos;ll prioritize the patterns that matter most to you.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {GOAL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  backgroundColor: selectedGoal === opt.value ? "#0d2a1a" : "#0d1621",
                  border: `1px solid ${selectedGoal === opt.value ? "#4ade80" : "#1e3a5c"}`,
                  borderRadius: "10px",
                  padding: "0.75rem 1rem",
                  cursor: "pointer",
                  transition: "border-color 0.15s, background-color 0.15s",
                }}
                onClick={() => setSelectedGoal(opt.value)}
              >
                <span style={{ fontSize: "1.4rem", flexShrink: 0 }}>{opt.icon}</span>
                <div>
                  <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.88rem" }}>{opt.label}</div>
                  <div style={{ color: "#64748b", fontSize: "0.75rem" }}>{opt.sub}</div>
                </div>
                {selectedGoal === opt.value && (
                  <span style={{ marginLeft: "auto", color: "#4ade80", fontSize: "1rem" }}>✓</span>
                )}
              </label>
            ))}
          </div>

          <button
            onClick={handleStep1Continue}
            disabled={!canContinue}
            style={{
              backgroundColor: canContinue ? "#4ade80" : "#1a2535",
              color: canContinue ? "#0f1a0a" : "#4a6a8a",
              border: "none",
              borderRadius: "10px",
              padding: "0.85rem",
              fontSize: "0.95rem",
              fontWeight: "bold",
              cursor: canContinue ? "pointer" : "not-allowed",
              width: "100%",
              transition: "background-color 0.15s",
            }}
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Calibration (10 puzzles → reveal → connect) ──────────────────
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <CalibrationFlow
          startingElo={1000}
          onComplete={handleCalibrationComplete}
        />
      </div>
    </div>
  );
}
