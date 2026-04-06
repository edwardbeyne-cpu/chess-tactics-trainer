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

type Screen = 
  | "segmentation" 
  | "beginner_intro" 
  | "why_it_works" 
  | "launch" 
  | "refresher";

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
        setScreen("beginner_intro");
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
      setScreen("beginner_intro");
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
        maxWidth: "600px",
        margin: "0 auto",
        padding: "2rem 1rem",
        minHeight: "100vh",
        backgroundColor: "#0a0a0f",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{
            fontSize: "1.75rem",
            fontWeight: "700",
            marginBottom: "0.5rem",
            color: "#f1f5f9",
            letterSpacing: "-0.025em"
          }}>
            How do you currently solve tactics?
          </h1>
          <p style={{
            color: "#94a3b8",
            fontSize: "1rem",
            lineHeight: 1.5,
          }}>
            Choose the option that sounds most like you.
          </p>
        </div>

        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          marginBottom: "2rem",
        }}>
          {[
            {
              value: "new_to_cct" as CCTFamiliarity,
              title: "I usually just look for the best move and play it",
              subtitle: "I don't follow a consistent process yet.",
              color: "#f97316",
            },
            {
              value: "cct_inconsistent" as CCTFamiliarity,
              title: "I sometimes look for checks, captures, and threats",
              subtitle: "I know the idea, but I don't use it every time.",
              color: "#3b82f6",
            },
            {
              value: "cct_confident" as CCTFamiliarity,
              title: "I already use checks, captures, and threats consistently",
              subtitle: "It's already part of how I calculate.",
              color: "#10b981",
            },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handleSegmentationSelect(option.value)}
              style={{
                textAlign: "left",
                padding: "1.5rem",
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "12px",
                cursor: "pointer",
                transition: "all 0.2s",
                color: "#f1f5f9",
                display: "block",
                width: "100%",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = "#1a1f2e";
                e.currentTarget.style.borderColor = option.color;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = "#0f172a";
                e.currentTarget.style.borderColor = "#1e293b";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{
                fontSize: "1.1rem",
                fontWeight: "600",
                marginBottom: "0.5rem",
                color: option.color,
              }}>
                {option.title}
              </div>
              <div style={{
                color: "#94a3b8",
                fontSize: "0.95rem",
                lineHeight: 1.4,
              }}>
                {option.subtitle}
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
            fontSize: "0.9rem",
            alignSelf: "center",
          }}
        >
          Skip for now →
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
              fontSize: "1.75rem",
              fontWeight: "700",
              marginBottom: "1rem",
              color: "#f1f5f9",
              letterSpacing: "-0.025em"
            }}>
              A simple process for finding better moves
            </h1>
            <div style={{
              color: "#94a3b8",
              fontSize: "1.05rem",
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
              fontSize: "1.75rem",
              fontWeight: "700",
              marginBottom: "1rem",
              color: "#f1f5f9",
              letterSpacing: "-0.025em"
            }}>
              Why this works
            </h1>
            <div style={{
              color: "#94a3b8",
              fontSize: "1.05rem",
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
      ? "You'll practice each part of CCT one step at a time: Checks, Captures, Threats, Then full solve. This teaches you how to scan before you commit to a move."
      : "You already know the idea. Now the goal is consistency. The CCT Trainer helps you practice checks, captures, and threats in order so the process becomes automatic during real games.";
    const cta = "Start CCT Training";

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
              {isLaunch ? "Step 3 of 3" : "Ready to train"}
            </div>
            <h1 style={{
              fontSize: "1.75rem",
              fontWeight: "700",
              marginBottom: "1rem",
              color: "#f1f5f9",
              letterSpacing: "-0.025em"
            }}>
              {title}
            </h1>
            <div style={{
              color: "#94a3b8",
              fontSize: "1.05rem",
              lineHeight: 1.6,
              marginBottom: "1.5rem",
            }}>
              {body}
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
            onClick={isLaunch ? () => setScreen("why_it_works") : handleSkip}
            style={{
              color: "#64748b",
              backgroundColor: "transparent",
              border: "none",
              padding: "0.75rem 1.5rem",
              cursor: "pointer",
              fontSize: "0.95rem",
            }}
          >
            {isLaunch ? "Back" : "Skip"}
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
            {cta}
          </button>
        </div>
      </div>
    );
  }

  return null;
}