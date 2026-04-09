"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  getCCTFamiliarity, 
  saveCCTFamiliarity, 
  getCCTOnboardingComplete, 
  saveCCTOnboardingComplete,
  type CCTFamiliarity 
} from "@/lib/storage";
import LearnCCT from "./LearnCCT";

type Screen = 
  | "segmentation" 
  | "beginner_intro" 
  | "why_it_works" 
  | "launch" 
  | "refresher"
  | "learn_cct";

export default function CCTOnboardingBridge() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("segmentation");
  const [familiarity, setFamiliarity] = useState<CCTFamiliarity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if onboarding already complete
    if (getCCTOnboardingComplete()) {
      router.push("/app/training-plan");
      return;
    }
    // Check existing familiarity
    const existing = getCCTFamiliarity();
    if (existing) {
      // Already segmented, skip to appropriate screen
      setFamiliarity(existing);
      if (existing === "new_to_cct") {
        setScreen("learn_cct");
      } else if (existing === "cct_inconsistent") {
        setScreen("refresher");
      } else {
        // cct_confident - onboarding complete
        saveCCTOnboardingComplete(true);
        router.push("/app/training-plan");
      }
    }
    setLoading(false);
  }, [router]);

  const handleSegmentationSelect = (selected: CCTFamiliarity) => {
    setFamiliarity(selected);
    saveCCTFamiliarity(selected);
    
    if (selected === "new_to_cct") {
      setScreen("learn_cct");
    } else if (selected === "cct_inconsistent") {
      setScreen("refresher");
    } else {
      // cct_confident - skip to training plan
      saveCCTOnboardingComplete(true);
      router.push("/app/training-plan");
    }
  };

  const handleNext = () => {
    if (screen === "beginner_intro") {
      setScreen("why_it_works");
    } else if (screen === "why_it_works") {
      setScreen("launch");
    } else if (screen === "launch" || screen === "refresher") {
      saveCCTOnboardingComplete(true);
      router.push("/app/cct-trainer");
    }
  };

  const handleLearnCCTComplete = () => {
    saveCCTOnboardingComplete(true);
    router.push("/app/cct-trainer");
  };

  const handleSkip = () => {
    saveCCTOnboardingComplete(true);
    router.push("/app/training-plan");
  };

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        backgroundColor: "#0a0a0f",
        color: "#94a3b8",
      }}>
        Loading...
      </div>
    );
  }

  // Segmentation Screen (all users)
  if (screen === "segmentation") {
    return (
      <div style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "1.2rem 1.25rem 2rem",
        minHeight: "100vh",
        backgroundColor: "#0a0a0f",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{
            color: "#f59e0b",
            fontSize: "0.8rem",
            fontWeight: "700",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "0.65rem"
          }}>
            Step 1 of 2 · CCT Check
          </div>
          <h1 style={{
            fontSize: "1.75rem",
            fontWeight: "800",
            marginBottom: "0.6rem",
            color: "#f1f5f9",
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
          }}>
            Before we build your plan, how do you currently scan a position?
          </h1>
          <p style={{
            color: "#94a3b8",
            fontSize: "1rem",
            lineHeight: 1.6,
            maxWidth: "560px",
          }}>
            This helps us decide whether to teach Checks, Captures, Threats (CCT), refresh it, or use it immediately in your training.
          </p>
        </div>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          marginBottom: "2.4rem",
        }}>
          {[
            {
              value: "new_to_cct" as CCTFamiliarity,
              title: "I usually just look for the best move",
              subtitle: "I don’t use a set process yet.",
              next: "We’ll teach you CCT in about 2 minutes.",
              color: "#f97316",
            },
            {
              value: "cct_inconsistent" as CCTFamiliarity,
              title: "I sometimes check checks, captures, and threats",
              subtitle: "I know the idea, but I don’t use it consistently.",
              next: "We’ll give you a quick refresher and then drop you into training.",
              color: "#3b82f6",
            },
            {
              value: "cct_confident" as CCTFamiliarity,
              title: "I already use CCT consistently",
              subtitle: "It’s already part of how I calculate.",
              next: "We’ll plug it straight into your training flow.",
              color: "#10b981",
            },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handleSegmentationSelect(option.value)}
              style={{
                textAlign: "left",
                padding: "1.25rem 1.35rem",
                backgroundColor: "#0f172a",
                border: "1px solid #243044",
                borderRadius: "14px",
                cursor: "pointer",
                transition: "all 0.2s",
                color: "#f1f5f9",
                display: "block",
                width: "100%",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = "#151d2b";
                e.currentTarget.style.borderColor = option.color;
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 12px 28px ${option.color}20`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = "#0f172a";
                e.currentTarget.style.borderColor = "#243044";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "1rem",
                    fontWeight: "700",
                    marginBottom: "0.4rem",
                    color: option.color,
                    lineHeight: 1.35,
                  }}>
                    {option.title}
                  </div>
                  <div style={{
                    color: "#cbd5e1",
                    fontSize: "0.88rem",
                    lineHeight: 1.45,
                    marginBottom: "0.45rem",
                  }}>
                    {option.subtitle}
                  </div>
                  <div style={{
                    color: "#64748b",
                    fontSize: "0.76rem",
                    lineHeight: 1.35,
                  }}>
                    Next: {option.next}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={handleSkip}
          style={{
            color: "#64748b",
            backgroundColor: "transparent",
            border: "none",
            padding: "0.75rem",
            cursor: "pointer",
            fontSize: "0.88rem",
            alignSelf: "center",
            marginTop: "0.75rem",
          }}
        >
          Skip CCT setup for now →
        </button>
      </div>
    );
  }

  // Beginner Intro Screen (new_to_cct only)
  if (screen === "beginner_intro") {
    return (
      <div style={{
        maxWidth: "600px",
        margin: "0 auto",
        padding: "2rem 1rem",
        minHeight: "100vh",
        backgroundColor: "#0a0a0f",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            marginBottom: "2rem",
            padding: "1.5rem",
            backgroundColor: "#0f172a",
            borderRadius: "12px",
            borderLeft: "4px solid #f97316",
          }}>
            <div style={{
              fontSize: "0.8rem",
              fontWeight: "600",
              color: "#f97316",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              Step 1 of 3
            </div>
            <h1 style={{
              fontSize: "1.5rem",
              fontWeight: "700",
              marginBottom: "1rem",
              color: "#f1f5f9",
              letterSpacing: "-0.025em"
            }}>
              A simple process for finding better moves
            </h1>
            <div style={{
              color: "#94a3b8",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}>
              <p style={{ marginBottom: "1rem" }}>
                <strong>Checks, Captures, Threats (CCT)</strong> is a simple thinking process used to find stronger tactical moves.
              </p>
              <p style={{ marginBottom: "1rem" }}>
                Before you move, you scan in this order: <strong>Checks</strong> — can you give check? <strong>Captures</strong> — can you win material? <strong>Threats</strong> — can you create a strong threat?
              </p>
              <p>
                Most players miss tactics because they move too quickly. CCT trains you to look at the forcing moves first.
              </p>
            </div>
          </div>
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}>
          <button
            onClick={handleSkip}
            style={{
              color: "#64748b",
              backgroundColor: "transparent",
              border: "none",
              padding: "0.75rem 1.5rem",
              cursor: "pointer",
              fontSize: "0.95rem",
            }}
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            style={{
              backgroundColor: "#f97316",
              color: "white",
              border: "none",
              padding: "0.875rem 2rem",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "1rem",
              cursor: "pointer",
              transition: "all 0.2s",
              minWidth: "140px",
              boxShadow: "0 2px 4px rgba(249, 115, 22, 0.2)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = "#ea580c";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(249, 115, 22, 0.3)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = "#f97316";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(249, 115, 22, 0.2)";
            }}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // Why It Works Screen (new_to_cct only)
  if (screen === "why_it_works") {
    return (
      <div style={{
        maxWidth: "600px",
        margin: "0 auto",
        padding: "2rem 1rem",
        minHeight: "100vh",
        backgroundColor: "#0a0a0f",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            marginBottom: "2rem",
            padding: "1.5rem",
            backgroundColor: "#0f172a",
            borderRadius: "12px",
            borderLeft: "4px solid #f97316",
          }}>
            <div style={{
              fontSize: "0.8rem",
              fontWeight: "600",
              color: "#f97316",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              Step 2 of 3
            </div>
            <h1 style={{
              fontSize: "1.5rem",
              fontWeight: "700",
              marginBottom: "1rem",
              color: "#f1f5f9",
              letterSpacing: "-0.025em"
            }}>
              Why this works
            </h1>
            <div style={{
              color: "#94a3b8",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}>
              <p style={{ marginBottom: "1rem" }}>
                Strong tactical players don't just "see" more. They <strong>search better</strong>.
              </p>
              <p style={{ marginBottom: "1rem" }}>
                CCT gives you a repeatable way to slow down, scan forcing moves, and miss fewer tactical opportunities.
              </p>
              <p>
                The goal is simple: <strong>Stop guessing. Start scanning.</strong>
              </p>
            </div>
          </div>
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}>
          <button
            onClick={() => setScreen("beginner_intro")}
            style={{
              color: "#64748b",
              backgroundColor: "transparent",
              border: "none",
              padding: "0.75rem 1.5rem",
              cursor: "pointer",
              fontSize: "0.95rem",
            }}
          >
            Back
          </button>
          <button
            onClick={handleNext}
            style={{
              backgroundColor: "#f97316",
              color: "white",
              border: "none",
              padding: "0.875rem 2rem",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "1rem",
              cursor: "pointer",
              transition: "all 0.2s",
              minWidth: "140px",
              boxShadow: "0 2px 4px rgba(249, 115, 22, 0.2)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = "#ea580c";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(249, 115, 22, 0.3)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = "#f97316";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(249, 115, 22, 0.2)";
            }}
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // Launch Screen (new_to_cct only) OR Refresher (cct_inconsistent)
  const isLaunch = screen === "launch";
  const isRefresher = screen === "refresher";
  
  if (isLaunch || isRefresher) {
    const title = isLaunch ? "Now build the habit" : "Turn CCT into a habit";
    const body = isLaunch
      ? "You’ll practice Checks, Captures, and Threats one step at a time so the scan becomes automatic before you move."
      : "You know the idea already. Now we’ll make it consistent so you naturally scan forcing moves in every position.";
    const nextLine = "Next: one short CCT training round, then your first Fork pattern.";
    const cta = "Start 2-Minute CCT Training";

    return (
      <div style={{
        maxWidth: "820px",
        margin: "0 auto",
        padding: "0.75rem 1.25rem 1.5rem",
        minHeight: "100vh",
        backgroundColor: "#0a0a0f",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}>
        <div style={{
          padding: "1.35rem 1.4rem",
          backgroundColor: "#0f172a",
          borderRadius: "14px",
          borderLeft: "4px solid #4ade80",
          marginBottom: "1.25rem",
        }}>
          <div style={{
            fontSize: "0.78rem",
            fontWeight: "700",
            color: "#4ade80",
            marginBottom: "0.5rem",
            textTransform: "uppercase",
            letterSpacing: "0.07em"
          }}>
            {isLaunch ? "Step 2 of 2 · Ready to train" : "Step 2 of 2 · Ready to train"}
          </div>
          <h1 style={{
            fontSize: "1.7rem",
            fontWeight: "800",
            marginBottom: "0.75rem",
            color: "#f1f5f9",
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
          }}>
            {title}
          </h1>
          <div style={{
            color: "#cbd5e1",
            fontSize: "0.98rem",
            lineHeight: 1.6,
            marginBottom: "0.85rem",
          }}>
            {body}
          </div>
          <div style={{
            color: "#94a3b8",
            fontSize: "0.85rem",
            lineHeight: 1.5,
          }}>
            {nextLine}
          </div>
        </div>

        <button
          onClick={handleNext}
          style={{
            backgroundColor: "#4ade80",
            color: "#0f0f1a",
            border: "none",
            padding: "1rem 1.5rem",
            borderRadius: "10px",
            fontWeight: "700",
            fontSize: "1.125rem",
            cursor: "pointer",
            transition: "all 0.2s",
            width: "100%",
            boxShadow: "0 2px 4px rgba(74, 222, 128, 0.22)",
            marginBottom: "0.5rem",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = "#3fcb73";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 14px rgba(74, 222, 128, 0.32)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = "#4ade80";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 2px 4px rgba(74, 222, 128, 0.22)";
          }}
        >
          {cta}
        </button>

        <button
          onClick={isLaunch ? () => setScreen("why_it_works") : handleSkip}
          style={{
            color: "#64748b",
            backgroundColor: "transparent",
            border: "none",
            padding: "0.65rem 1rem",
            cursor: "pointer",
            fontSize: "0.84rem",
            alignSelf: "center",
            marginTop: "1rem",
          }}
        >
          {isLaunch ? "Back" : "Skip for now"}
        </button>
      </div>
    );
  }

  // Learn CCT screen (new_to_cct only)
  if (screen === "learn_cct") {
    return <LearnCCT onComplete={handleLearnCCTComplete} />;
  }

  return null;
}