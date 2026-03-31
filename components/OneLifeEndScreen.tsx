"use client";

interface OneLifeEndScreenProps {
  puzzlesCompleted: number;
  patterns: string[];
  elapsedSeconds: number;
  composureStreak: number;
  onRestart: () => void;
  onExit: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function OneLifeEndScreen({
  puzzlesCompleted,
  patterns,
  elapsedSeconds,
  composureStreak,
  onRestart,
  onExit,
}: OneLifeEndScreenProps) {
  const uniquePatterns = [...new Set(patterns)];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1500,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "#1a0a0a",
          border: "2px solid #ef4444",
          borderRadius: "20px",
          padding: "2.5rem",
          maxWidth: "420px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 0 60px rgba(239,68,68,0.2)",
        }}
      >
        {/* Icon + headline */}
        <div style={{ fontSize: "3.5rem", marginBottom: "0.75rem" }}>💔</div>
        <div
          style={{
            color: "#ef4444",
            fontSize: "1.5rem",
            fontWeight: "bold",
            marginBottom: "0.4rem",
          }}
        >
          Session Over
        </div>
        <div
          style={{
            color: "#94a3b8",
            fontSize: "0.88rem",
            marginBottom: "1.5rem",
            lineHeight: 1.6,
          }}
        >
          You made a wrong move on puzzle{" "}
          <strong style={{ color: "#fca5a5" }}>#{puzzlesCompleted + 1}</strong>
        </div>

        {/* Stats grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0.6rem",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "10px",
              padding: "0.75rem 0.4rem",
            }}
          >
            <div
              style={{
                color: "#4ade80",
                fontSize: "1.6rem",
                fontWeight: "bold",
                lineHeight: 1,
              }}
            >
              {puzzlesCompleted}
            </div>
            <div style={{ color: "#64748b", fontSize: "0.68rem", marginTop: "0.2rem" }}>
              survived
            </div>
          </div>
          <div
            style={{
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "10px",
              padding: "0.75rem 0.4rem",
            }}
          >
            <div
              style={{
                color: "#60a5fa",
                fontSize: "1.6rem",
                fontWeight: "bold",
                lineHeight: 1,
              }}
            >
              {uniquePatterns.length}
            </div>
            <div style={{ color: "#64748b", fontSize: "0.68rem", marginTop: "0.2rem" }}>
              patterns
            </div>
          </div>
          <div
            style={{
              backgroundColor: "#0f1621",
              border: "1px solid #2e3a5c",
              borderRadius: "10px",
              padding: "0.75rem 0.4rem",
            }}
          >
            <div
              style={{
                color: "#fbbf24",
                fontSize: "1.6rem",
                fontWeight: "bold",
                lineHeight: 1,
              }}
            >
              {formatDuration(elapsedSeconds)}
            </div>
            <div style={{ color: "#64748b", fontSize: "0.68rem", marginTop: "0.2rem" }}>
              time
            </div>
          </div>
        </div>

        {/* Composure streak */}
        {composureStreak > 0 && (
          <div
            style={{
              backgroundColor: "#0a1520",
              border: "1px solid #1e3a5c",
              borderRadius: "10px",
              padding: "0.7rem 1rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>🧘</span>
            <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
              Composure Streak:{" "}
              <strong style={{ color: "#e2e8f0" }}>{composureStreak} puzzles</strong>
            </span>
          </div>
        )}

        {/* Patterns covered */}
        {uniquePatterns.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                color: "#64748b",
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "0.5rem",
              }}
            >
              Patterns covered
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.35rem",
                justifyContent: "center",
              }}
            >
              {uniquePatterns.map((p) => (
                <span
                  key={p}
                  style={{
                    backgroundColor: "#1e2a3a",
                    border: "1px solid #2e3a5c",
                    borderRadius: "6px",
                    padding: "0.2rem 0.5rem",
                    color: "#94a3b8",
                    fontSize: "0.74rem",
                  }}
                >
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={onExit}
            style={{
              flex: 1,
              backgroundColor: "#1e2a3a",
              color: "#94a3b8",
              border: "1px solid #2e3a5c",
              borderRadius: "10px",
              padding: "0.8rem",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Exit
          </button>
          <button
            onClick={onRestart}
            style={{
              flex: 2,
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "0.8rem",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.9rem",
            }}
          >
            ❤️ Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
