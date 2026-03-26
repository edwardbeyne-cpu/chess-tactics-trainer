"use client";

import { useState, useEffect } from "react";
import { Chess } from "chess.js";
import puzzles from "@/data/puzzles";
import {
  getDuePuzzleIds,
  getSM2DuePuzzleIds,
  getSM2Attempts,
  recordSM2Attempt,
  recordAttempt,
  scheduleFailed,
  scheduleCorrect,
  getSRS,
  SRS_INTERVALS,
} from "@/lib/storage";
import type { SM2Outcome } from "@/lib/storage";
import type { Puzzle } from "@/data/puzzles";
import { fetchPuzzleById, lichessPuzzleToApp, type AppPuzzle } from "@/lib/lichess";
import ChessBoard from "./ChessBoard";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatNextReview(isoDate: string): string {
  const d = new Date(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff} days`;
}

// ── Classic Puzzle Review Board ────────────────────────────────────────────

function ReviewBoard({
  puzzle,
  onResult,
}: {
  puzzle: Puzzle;
  onResult: (outcome: string) => void;
}) {
  const [fen, setFen] = useState(puzzle.fen);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<"solve" | "waiting" | "solved" | "failed">("solve");
  const [message, setMessage] = useState(puzzle.description);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [timeLeft, setTimeLeft] = useState(120);
  const [timerActive, setTimerActive] = useState(true);

  useEffect(() => {
    setFen(puzzle.fen);
    setMoveIndex(0);
    setStatus("solve");
    setMessage(puzzle.description);
    setLastMove(undefined);
    setTimeLeft(120);
    setTimerActive(true);
  }, [puzzle.id]);

  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setTimerActive(false);
          setStatus("failed");
          setMessage("Time's up!");
          recordAttempt(puzzle.id, "failed");
          scheduleFailed(puzzle.id);
          onResult("failed");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive]);

  function handleMove(src: string, tgt: string): boolean {
    if (status !== "solve") return false;
    const expected = puzzle.solution[moveIndex];
    if (src !== expected.slice(0, 2) || tgt !== expected.slice(2, 4)) {
      setStatus("failed");
      setMessage("Incorrect — puzzle added back to review queue.");
      setTimerActive(false);
      recordAttempt(puzzle.id, "failed");
      scheduleFailed(puzzle.id);
      onResult("failed");
      return false;
    }
    const game = new Chess(fen);
    try {
      game.move({ from: expected.slice(0, 2), to: expected.slice(2, 4), promotion: "q" });
    } catch {
      return false;
    }
    const newFen = game.fen();
    setFen(newFen);
    setLastMove([expected.slice(0, 2), expected.slice(2, 4)]);
    const nextIndex = moveIndex + 1;
    if (nextIndex >= puzzle.solution.length) {
      setMoveIndex(nextIndex);
      setStatus("solved");
      setMessage("Correct! Interval advanced.");
      setTimerActive(false);
      recordAttempt(puzzle.id, "solved");
      scheduleCorrect(puzzle.id);
      onResult("solved");
      return true;
    }
    setStatus("waiting");
    setMoveIndex(nextIndex);
    const op = puzzle.solution[nextIndex];
    setTimeout(() => {
      const g2 = new Chess(newFen);
      g2.move({ from: op.slice(0, 2), to: op.slice(2, 4), promotion: "q" });
      setFen(g2.fen());
      setLastMove([op.slice(0, 2), op.slice(2, 4)]);
      setMoveIndex(nextIndex + 1);
      setStatus("solve");
      setMessage("Good — keep going...");
    }, 600);
    return true;
  }

  function handleHint() {
    if (status !== "solve") return;
    const from = puzzle.solution[moveIndex].slice(0, 2);
    setMessage(`Hint: ${puzzle.hint} (from: ${from})`);
    setStatus("failed");
    setTimerActive(false);
    recordAttempt(puzzle.id, "hint");
    scheduleFailed(puzzle.id);
    onResult("failed");
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerColor = timeLeft <= 30 ? "#ef4444" : "#4ade80";
  const msgColor = status === "solved" ? "#4ade80" : status === "failed" ? "#ef4444" : "#e2e8f0";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2rem", alignItems: "start" }}>
      <div>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1rem 1.5rem", marginBottom: "1rem" }}>
          <div style={{ color: "#4ade80", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.4rem" }}>
            {puzzle.title} — {puzzle.theme}
          </div>
          <div style={{ color: msgColor, fontSize: "1rem" }}>{message}</div>
        </div>
        <ChessBoard fen={fen} onMove={handleMove} lastMove={lastMove} draggable={status === "solve"} boardWidth={460} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem", textAlign: "center" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Timer</div>
          <div style={{ color: timerColor, fontSize: "3rem", fontWeight: "bold", fontFamily: "monospace" }}>
            {minutes}:{String(seconds).padStart(2, "0")}
          </div>
        </div>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Controls</div>
          <button onClick={handleHint} disabled={status !== "solve"}
            style={{ backgroundColor: status === "solve" ? "#2e75b6" : "#1a2535", color: status === "solve" ? "white" : "#4a6a8a", border: "none", borderRadius: "8px", padding: "0.7rem", cursor: status === "solve" ? "pointer" : "not-allowed", fontWeight: "bold", width: "100%" }}>
            💡 Hint
          </button>
        </div>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>SRS Intervals</div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {SRS_INTERVALS.map((d, i) => (
              <span key={i} style={{ backgroundColor: "#162030", color: "#64748b", borderRadius: "4px", padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}>{d}d</span>
            ))}
          </div>
          <div style={{ color: "#475569", fontSize: "0.72rem", marginTop: "0.5rem" }}>Correct = advance · Wrong = reset to day 1</div>
        </div>
      </div>
    </div>
  );
}

// ── SM-2 Lichess Puzzle Review Board ──────────────────────────────────────

function SM2ReviewBoard({
  puzzle,
  onResult,
}: {
  puzzle: AppPuzzle;
  onResult: (outcome: SM2Outcome) => void;
}) {
  const [fen, setFen] = useState(puzzle.fen);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<"solve" | "waiting" | "solved" | "failed">("solve");
  const [message, setMessage] = useState(puzzle.description);
  const [lastMove, setLastMove] = useState<[string, string] | undefined>(undefined);
  const [firstTry, setFirstTry] = useState(true);

  useEffect(() => {
    setFen(puzzle.fen);
    setMoveIndex(0);
    setStatus("solve");
    setMessage(puzzle.description);
    setLastMove(undefined);
    setFirstTry(true);
  }, [puzzle.id]);

  function handleMove(src: string, tgt: string): boolean {
    if (status !== "solve") return false;
    const expected = puzzle.solution[moveIndex];
    if (src !== expected.slice(0, 2) || tgt !== expected.slice(2, 4)) {
      setFirstTry(false);
      setMessage("Incorrect move. Try again!");
      return false;
    }
    const game = new Chess(fen);
    try {
      game.move({ from: expected.slice(0, 2), to: expected.slice(2, 4), promotion: expected.slice(4) || "q" });
    } catch {
      return false;
    }
    const newFen = game.fen();
    setFen(newFen);
    setLastMove([expected.slice(0, 2), expected.slice(2, 4)]);
    const nextIndex = moveIndex + 1;
    if (nextIndex >= puzzle.solution.length) {
      setMoveIndex(nextIndex);
      setStatus("solved");
      const outcome: SM2Outcome = firstTry ? "solved-first-try" : "solved-after-retry";
      setMessage(firstTry ? "Correct! Well done!" : "Solved — not on first try.");
      onResult(outcome);
      return true;
    }
    setStatus("waiting");
    setMoveIndex(nextIndex);
    const op = puzzle.solution[nextIndex];
    setTimeout(() => {
      const g2 = new Chess(newFen);
      g2.move({ from: op.slice(0, 2), to: op.slice(2, 4), promotion: op.slice(4) || "q" });
      setFen(g2.fen());
      setLastMove([op.slice(0, 2), op.slice(2, 4)]);
      setMoveIndex(nextIndex + 1);
      setStatus("solve");
      setMessage("Good — keep going...");
    }, 600);
    return true;
  }

  const msgColor = status === "solved" ? "#4ade80" : status === "failed" ? "#ef4444" : "#e2e8f0";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2rem", alignItems: "start" }}>
      <div>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1rem 1.5rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ color: "#4ade80", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "0.4rem" }}>
              {puzzle.title}
            </div>
            <span style={{ color: "#64748b", fontSize: "0.75rem" }}>⭐ {puzzle.rating}</span>
          </div>
          <div style={{ color: msgColor }}>{message}</div>
        </div>
        <ChessBoard fen={fen} onMove={handleMove} lastMove={lastMove} draggable={status === "solve"} boardWidth={460} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.25rem" }}>
          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>Source</div>
          <div style={{ color: "#4ade80", fontWeight: "bold" }}>🌐 Lichess</div>
          <a href={puzzle.gameUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2e75b6", fontSize: "0.8rem" }}>View puzzle ↗</a>
        </div>
      </div>
    </div>
  );
}

// ── Upcoming Queue ────────────────────────────────────────────────────────

function UpcomingQueue({
  allQueued,
}: {
  allQueued: { puzzle: NonNullable<ReturnType<typeof puzzles.find>>; entry: { stepIndex: number; nextReview: string } }[];
}) {
  return (
    <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.5rem", marginTop: "1.5rem" }}>
      <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "1rem" }}>Upcoming Reviews</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {allQueued.map(({ puzzle: p, entry }) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#162030", borderRadius: "8px", padding: "0.6rem 1rem" }}>
            <div>
              <span style={{ color: "#e2e8f0", fontSize: "0.85rem", fontWeight: "bold" }}>{p.title}</span>
              <span style={{ color: "#64748b", fontSize: "0.8rem", marginLeft: "0.5rem" }}>— {p.theme}</span>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>Step {entry.stepIndex + 1}/{SRS_INTERVALS.length}</span>
              <span style={{ color: "#4ade80", fontSize: "0.8rem", fontWeight: "bold" }}>{formatNextReview(entry.nextReview)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Review Component ─────────────────────────────────────────────────

type ReviewItem =
  | { type: "classic"; puzzle: Puzzle }
  | { type: "sm2"; puzzle: AppPuzzle };

export default function Review() {
  const [dueIds, setDueIds] = useState(() => getDuePuzzleIds());
  const [sm2DueIds, setSM2DueIds] = useState<string[]>([]);
  const [sm2Puzzles, setSM2Puzzles] = useState<AppPuzzle[]>([]);
  const [loadingSM2, setLoadingSM2] = useState(false);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const [sessionDone, setSessionDone] = useState(false);

  const srs = getSRS();

  // Load SM-2 due puzzle IDs on mount
  useEffect(() => {
    const ids = getSM2DuePuzzleIds();
    setSM2DueIds(ids);

    if (ids.length === 0) return;

    // Fetch SM-2 due puzzles from Lichess
    setLoadingSM2(true);
    Promise.all(ids.map((id) => fetchPuzzleById(id).catch(() => null)))
      .then((results) => {
        const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
        // Get theme from SM2 attempts
        const sm2AttemptsList = getSM2Attempts();
        const themeMap = new Map<string, string>();
        for (const a of sm2AttemptsList) {
          if (a.theme) themeMap.set(a.puzzleId, a.theme);
        }
        const appPuzzles = valid.map((p) => {
          const theme = themeMap.get(p.id) ?? "Tactic";
          return lichessPuzzleToApp(p, theme, 1);
        });
        setSM2Puzzles(appPuzzles);
      })
      .finally(() => setLoadingSM2(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build queue once SM-2 puzzles are loaded
  useEffect(() => {
    const classicPuzzles = dueIds
      .map((id) => puzzles.find((p) => p.id === id))
      .filter((p): p is Puzzle => Boolean(p));

    const q: ReviewItem[] = [
      ...classicPuzzles.map((p): ReviewItem => ({ type: "classic", puzzle: p })),
      ...sm2Puzzles.map((p): ReviewItem => ({ type: "sm2", puzzle: p })),
    ];
    setQueue(q);
    setQueueIndex(0);
    setResults([]);
    setSessionDone(false);
  }, [dueIds, sm2Puzzles]);

  const allQueued = Object.entries(srs)
    .map(([id, entry]) => ({
      puzzle: puzzles.find((p) => p.id === Number(id))!,
      entry,
    }))
    .filter((x) => x.puzzle)
    .sort((a, b) => a.entry.nextReview.localeCompare(b.entry.nextReview));

  function handleClassicResult(outcome: string) {
    setResults((r) => [...r, outcome]);
    setTimeout(() => {
      if (queueIndex + 1 >= queue.length) {
        setSessionDone(true);
      } else {
        setQueueIndex((i) => i + 1);
      }
    }, 1200);
  }

  function handleSM2Result(outcome: SM2Outcome, puzzleId: string, theme?: string) {
    recordSM2Attempt({
      puzzleId,
      outcome,
      timestamp: new Date().toISOString(),
      theme,
    });
    setResults((r) => [...r, outcome]);
    setTimeout(() => {
      if (queueIndex + 1 >= queue.length) {
        setSessionDone(true);
      } else {
        setQueueIndex((i) => i + 1);
      }
    }, 1200);
  }

  function restartSession() {
    const fresh = getDuePuzzleIds();
    const freshSM2 = getSM2DuePuzzleIds();
    setDueIds(fresh);
    setSM2DueIds(freshSM2);
    setResults([]);
    setSessionDone(false);
    setQueueIndex(0);
  }

  const totalDue = dueIds.length + sm2DueIds.length;

  if (loadingSM2) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", marginBottom: "2rem" }}>Review Queue</h1>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
          <div style={{ color: "#94a3b8" }}>Loading review puzzles...</div>
        </div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", marginBottom: "2rem" }}>Review Queue</h1>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
          <div style={{ color: "#4ade80", fontSize: "1.25rem", fontWeight: "bold", marginBottom: "0.5rem" }}>No puzzles due today!</div>
          <div style={{ color: "#94a3b8" }}>Solve new puzzles and come back when reviews are scheduled.</div>
        </div>
        {/* Social proof for free users — show what SRS provides */}
        <div style={{ backgroundColor: "#0a1525", border: "1px solid #1e3a5c", borderRadius: "12px", padding: "1.5rem", marginTop: "1.5rem" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>🧠</div>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "0.5rem" }}>
            How Spaced Repetition Works
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.65, marginBottom: "1rem" }}>
            Your missed puzzles are scheduled for review at optimal intervals using the SM-2 algorithm —
            the same system used by medical students. Research shows spaced repetition improves
            long-term retention by <strong style={{ color: "#4ade80" }}>up to 400%</strong> vs random practice.
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "1rem" }}>
            Improver users with full SM-2 review queues retain <strong style={{ color: "#4ade80" }}>80% of learned patterns</strong> after
            30 days vs 20% without spaced repetition (Ebbinghaus, 1885 — replicated across hundreds of studies).
          </div>
          <a href="/pricing" style={{ display: "inline-block", backgroundColor: "#4ade80", color: "#0f0f1a", padding: "0.6rem 1.25rem", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", fontSize: "0.9rem" }}>
            Start 30-day free trial →
          </a>
        </div>
        {allQueued.length > 0 && <UpcomingQueue allQueued={allQueued} />}
      </div>
    );
  }

  if (sessionDone) {
    const solved = results.filter((r) => r === "solved" || r === "solved-first-try" || r === "solved-after-retry").length;
    const failed = results.filter((r) => r !== "solved" && r !== "solved-first-try" && r !== "solved-after-retry").length;
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold", marginBottom: "2rem" }}>Session Complete</h1>
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "2rem", textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🏁</div>
          <div style={{ display: "flex", justifyContent: "center", gap: "2rem", marginBottom: "1.5rem" }}>
            <div>
              <div style={{ color: "#4ade80", fontSize: "2rem", fontWeight: "bold" }}>{solved}</div>
              <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Correct</div>
            </div>
            <div>
              <div style={{ color: "#ef4444", fontSize: "2rem", fontWeight: "bold" }}>{failed}</div>
              <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Failed</div>
            </div>
          </div>
          <button onClick={restartSession} style={{ backgroundColor: "#4ade80", color: "#0f0f1a", border: "none", borderRadius: "8px", padding: "0.75rem 2rem", cursor: "pointer", fontWeight: "bold" }}>
            🔄 Check for More Reviews
          </button>
        </div>
        {allQueued.length > 0 && <UpcomingQueue allQueued={allQueued} />}
      </div>
    );
  }

  const currentItem = queue[queueIndex];

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "1.5rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: "bold" }}>Review Queue</h1>
        <span style={{ color: "#4ade80", fontSize: "0.9rem", fontWeight: "bold" }}>
          {queueIndex + 1} / {totalDue} due today
        </span>
      </div>

      {currentItem.type === "classic" ? (
        <ReviewBoard
          key={`classic-${currentItem.puzzle.id}`}
          puzzle={currentItem.puzzle}
          onResult={handleClassicResult}
        />
      ) : (
        <SM2ReviewBoard
          key={`sm2-${currentItem.puzzle.id}`}
          puzzle={currentItem.puzzle}
          onResult={(outcome) =>
            handleSM2Result(outcome, currentItem.puzzle.id, currentItem.puzzle.theme)
          }
        />
      )}
    </div>
  );
}
