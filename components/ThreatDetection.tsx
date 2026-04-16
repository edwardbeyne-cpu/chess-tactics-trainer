"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "@/components/ChessBoard";
import { buildThreatDetectionSession, evaluateThreatDefenseMove, loadThreatDetectionProgress, recordThreatDetectionSession, type ThreatPuzzle } from "@/lib/threat-puzzles";

const THREAT_OPTIONS = [
  { key: "fork", label: "Fork" },
  { key: "pin", label: "Pin" },
  { key: "skewer", label: "Skewer" },
  { key: "discoveredAttack", label: "Discovered Attack" },
  { key: "backRankMate", label: "Back Rank Mate" },
  { key: "deflection", label: "Deflection" },
];

type Phase = "identify" | "defend" | "feedback" | "summary";

export default function ThreatDetection() {
  const [session, setSession] = useState<ThreatPuzzle[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("identify");
  const [identifiedFlags, setIdentifiedFlags] = useState<boolean[]>([]);
  const [defenseFlags, setDefenseFlags] = useState<boolean[]>([]);
  const [threatChoice, setThreatChoice] = useState<string | null>(null);
  const [defenseMessage, setDefenseMessage] = useState("");
  const [boardFen, setBoardFen] = useState("");
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const progress = useMemo(() => loadThreatDetectionProgress(), []);

  useEffect(() => {
    buildThreatDetectionSession(10).then((next) => {
      setSession(next);
      setBoardFen(next[0]?.defenderFen || "");
      setIdentifiedFlags(new Array(next.length).fill(false));
      setDefenseFlags(new Array(next.length).fill(false));
    });
  }, []);

  const puzzle = session[idx];

  useEffect(() => {
    if (puzzle) {
      setBoardFen(puzzle.defenderFen);
      setThreatChoice(null);
      setDefenseMessage("");
      setLastMove(undefined);
      setPhase("identify");
    }
  }, [idx, puzzle]);

  if (!puzzle) {
    return <div style={{ color: "#94a3b8", padding: "2rem", textAlign: "center" }}>Loading threat session...</div>;
  }

  const identifiedCorrect = identifiedFlags.filter(Boolean).length;
  const defendedCorrect = defenseFlags.filter(Boolean).length;

  const goNext = () => {
    if (idx >= session.length - 1) {
      recordThreatDetectionSession({
        completedAt: new Date().toISOString(),
        identifiedCorrect,
        defendedCorrect,
        total: session.length,
      }, session, identifiedFlags, defenseFlags);
      setPhase("summary");
      return;
    }
    setIdx((n) => n + 1);
  };

  const handleThreatChoice = (choice: string) => {
    const correct = choice === puzzle.threatType;
    const nextFlags = [...identifiedFlags];
    nextFlags[idx] = correct;
    setIdentifiedFlags(nextFlags);
    setThreatChoice(choice);
    setTimeout(() => setPhase("defend"), 500);
  };

  const handleDefenseMove = (from: string, to: string) => {
    const uci = `${from}${to}`;
    const chess = new Chess(boardFen);
    try {
      chess.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    setBoardFen(chess.fen());
    setLastMove([from, to]);
    const result = evaluateThreatDefenseMove(puzzle, uci);
    const nextDefenseFlags = [...defenseFlags];
    nextDefenseFlags[idx] = result.correct;
    setDefenseFlags(nextDefenseFlags);
    setDefenseMessage(result.explanation);
    setPhase("feedback");
    return true;
  };

  if (phase === "summary") {
    return (
      <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ backgroundColor: "#2a160d", border: "1px solid #fb923c", borderRadius: "16px", padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "2.25rem", marginBottom: "0.6rem" }}>⚠️</div>
          <div style={{ color: "#fb923c", fontSize: "1.4rem", fontWeight: 900, marginBottom: "0.4rem" }}>Threat Detection Complete</div>
          <div style={{ color: "#e2e8f0" }}>You identified {identifiedCorrect}/{session.length} threats correctly and found {defendedCorrect}/{session.length} defenses.</div>
        </div>
        <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "14px", padding: "1.25rem" }}>
          <div style={{ color: "#94a3b8", marginBottom: "0.5rem" }}>Overall progress</div>
          <div style={{ color: "#e2e8f0", lineHeight: 1.8 }}>
            Sessions played: {progress.sessionsPlayed + 1}<br />
            Total threats seen: {progress.totalThreatsSeen + session.length}<br />
            Total identified correctly: {progress.threatIdCorrect + identifiedCorrect}<br />
            Total defenses found: {progress.defenseCorrect + defendedCorrect}
          </div>
        </div>
        <button onClick={() => {
          buildThreatDetectionSession(10).then((next) => {
          setSession(next);
          setIdx(0);
          setIdentifiedFlags(new Array(next.length).fill(false));
          setDefenseFlags(new Array(next.length).fill(false));
          setBoardFen(next[0]?.defenderFen || "");
          setPhase("identify");
          });
        }} style={{ backgroundColor: "#fb923c", color: "#fff", border: "none", borderRadius: "10px", padding: "0.9rem 1.25rem", fontWeight: 800, cursor: "pointer" }}>
          Start Another Threat Session →
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1040px", margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(320px, 560px) minmax(280px, 1fr)", gap: "1rem", alignItems: "start" }}>
      <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "16px", padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ color: "#fb923c", fontWeight: 900 }}>⚠️ Threat Detection</div>
          <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Puzzle {idx + 1} / {session.length}</div>
        </div>
        <ChessBoard
          fen={boardFen}
          onMove={phase === "defend" ? handleDefenseMove : undefined}
          draggable={phase === "defend"}
          orientation={puzzle.orientation}
          lastMove={lastMove}
          boardWidth={520}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ backgroundColor: "#2a160d", border: "1px solid #fb923c", borderRadius: "16px", padding: "1rem 1.1rem" }}>
          <div style={{ color: "#fb923c", fontWeight: 900, marginBottom: "0.35rem" }}>Danger prompt</div>
          <div style={{ color: "#e2e8f0", lineHeight: 1.6 }}>
            {phase === "identify" && "Your opponent has a winning tactic. What is it?"}
            {phase === "defend" && `Good eye. Now find the move that prevents the ${THREAT_OPTIONS.find((o) => o.key === puzzle.threatType)?.label || puzzle.threatType}.`}
            {phase === "feedback" && defenseMessage}
          </div>
        </div>

        {phase === "identify" && (
          <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "16px", padding: "1rem 1.1rem" }}>
            <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "0.75rem" }}>Identify the threat</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: "0.6rem" }}>
              {THREAT_OPTIONS.map((option) => (
                <button key={option.key} onClick={() => handleThreatChoice(option.key)} style={{ backgroundColor: "#0f0f1a", color: "#e2e8f0", border: "1px solid #2e3a5c", borderRadius: "10px", padding: "0.75rem 0.8rem", cursor: "pointer", fontWeight: 700 }}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "defend" && (
          <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "16px", padding: "1rem 1.1rem", color: "#94a3b8" }}>
            Play the defensive move on the board. The board is flipped so you are seeing the defender's side.
          </div>
        )}

        {phase === "feedback" && (
          <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "16px", padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            <div style={{ color: threatChoice === puzzle.threatType ? "#4ade80" : "#f59e0b", fontWeight: 800 }}>
              Threat: {THREAT_OPTIONS.find((o) => o.key === puzzle.threatType)?.label || puzzle.threatType}
            </div>
            <div style={{ color: "#94a3b8", fontSize: "0.92rem" }}>
              If you do nothing, your opponent's tactic starts with <code>{puzzle.attackerMove}</code>.
            </div>
            <button onClick={goNext} style={{ backgroundColor: "#fb923c", color: "#fff", border: "none", borderRadius: "10px", padding: "0.85rem 1rem", fontWeight: 800, cursor: "pointer" }}>
              {idx >= session.length - 1 ? "Finish Session →" : "Next Threat →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
