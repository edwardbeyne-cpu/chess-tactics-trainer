"use client";

import { safeSetItem } from "@/lib/safe-storage";
import { useState, useEffect } from "react";
import { Chess } from "chess.js";
import puzzles from "@/data/puzzles";
import { HelpModal, HelpBulletList } from "./HelpModal";
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
  getPuzzleTimes,
  type PuzzleTimesMap,
} from "@/lib/storage";
import type { SM2Outcome } from "@/lib/storage";
import type { Puzzle } from "@/data/puzzles";
import { fetchPuzzleById, lichessPuzzleToApp, type AppPuzzle } from "@/lib/lichess";
import { hasActiveSubscription } from "@/lib/trial";
import ChessBoard from "./ChessBoard";

// ── Review Queue (missed puzzles) helpers ──────────────────────────────────

const REVIEW_QUEUE_KEY = "ctt_review_queue";

function getReviewQueue(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(REVIEW_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function removeFromReviewQueue(puzzleId: string): void {
  if (typeof window === "undefined") return;
  try {
    const queue = getReviewQueue().filter((id) => id !== puzzleId);
    safeSetItem(REVIEW_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

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
      // Wrong move — immediately fail; stays in review queue
      setStatus("failed");
      setMessage("Wrong move! Puzzle failed — stays in your review queue.");
      onResult("failed");
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
      // Only first-try solves count — wrong move now fails immediately so this is always first-try
      setMessage("Correct! Well done!");
      onResult("solved-first-try");
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
        {/* Source box removed — board gets full width */}
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
  | { type: "sm2"; puzzle: AppPuzzle }
  | { type: "missed"; puzzle: AppPuzzle };

export default function Review() {
  // Sprint 12: Two tabs — Due Now (default) and All Missed
  const [activeTab, setActiveTab] = useState<"due" | "all-missed">("due");

  const [dueIds, setDueIds] = useState(() => getDuePuzzleIds());
  const [sm2DueIds, setSM2DueIds] = useState<string[]>([]);
  const [sm2Puzzles, setSM2Puzzles] = useState<AppPuzzle[]>([]);
  const [missedPuzzles, setMissedPuzzles] = useState<AppPuzzle[]>([]);
  const [allMissedPuzzles, setAllMissedPuzzles] = useState<AppPuzzle[]>([]);
  const [loadingSM2, setLoadingSM2] = useState(false);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [allMissedQueue, setAllMissedQueue] = useState<ReviewItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const [sessionDone, setSessionDone] = useState(false);
  const [missedQueueCount, setMissedQueueCount] = useState(0);
  const [puzzleTimes, setPuzzleTimes] = useState<PuzzleTimesMap>({});

  const srs = getSRS();

  // Load SM-2 due puzzle IDs and missed (review queue) puzzles on mount
  useEffect(() => {
    const ids = getSM2DuePuzzleIds();
    setSM2DueIds(ids);
    const missedIds = getReviewQueue();
    setMissedQueueCount(missedIds.length);
    setPuzzleTimes(getPuzzleTimes());

    // Fetch all needed puzzles in one batch
    const allIdsToFetch = Array.from(new Set([...ids, ...missedIds]));
    if (allIdsToFetch.length === 0) return;

    setLoadingSM2(true);
    Promise.all(allIdsToFetch.map((id) => fetchPuzzleById(id).catch(() => null)))
      .then((results) => {
        const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
        const sm2AttemptsList = getSM2Attempts();
        const themeMap = new Map<string, string>();
        for (const a of sm2AttemptsList) {
          if (a.theme) themeMap.set(a.puzzleId, a.theme);
        }

        // SM-2 due puzzles
        const sm2Valid = valid.filter((p) => ids.includes(p.id));
        const appSM2 = sm2Valid.map((p) => {
          const theme = themeMap.get(p.id) ?? "Tactic";
          return lichessPuzzleToApp(p, theme, 1);
        });
        setSM2Puzzles(appSM2);

        // Missed (review queue) puzzles for "Due Now" — exclude those already in SM-2 due
        const sm2IdSet = new Set(ids);
        const missedValid = valid.filter((p) => missedIds.includes(p.id) && !sm2IdSet.has(p.id));
        const appMissed = missedValid.map((p) => {
          const theme = themeMap.get(p.id) ?? "Tactic";
          return lichessPuzzleToApp(p, theme, 1);
        });
        setMissedPuzzles(appMissed);

        // "All Missed" tab — ALL puzzles in review queue (regardless of SM-2 schedule)
        const allMissedValid = valid.filter((p) => missedIds.includes(p.id));
        const appAllMissed = allMissedValid.map((p) => {
          const theme = themeMap.get(p.id) ?? "Tactic";
          return lichessPuzzleToApp(p, theme, 1);
        });
        setAllMissedPuzzles(appAllMissed);
      })
      .finally(() => setLoadingSM2(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build queue once puzzles are loaded — missed puzzles go first
  useEffect(() => {
    const classicPuzzles = dueIds
      .map((id) => puzzles.find((p) => p.id === id))
      .filter((p): p is Puzzle => Boolean(p));

    const q: ReviewItem[] = [
      ...missedPuzzles.map((p): ReviewItem => ({ type: "missed", puzzle: p })),
      ...classicPuzzles.map((p): ReviewItem => ({ type: "classic", puzzle: p })),
      ...sm2Puzzles.map((p): ReviewItem => ({ type: "sm2", puzzle: p })),
    ];
    setQueue(q);

    // All Missed queue — all puzzles in review queue, always accessible
    const allMissedQ: ReviewItem[] = allMissedPuzzles.map((p): ReviewItem => ({ type: "missed", puzzle: p }));
    setAllMissedQueue(allMissedQ);

    setQueueIndex(0);
    setResults([]);
    setSessionDone(false);
  }, [dueIds, sm2Puzzles, missedPuzzles, allMissedPuzzles]);

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

  function handleMissedResult(outcome: SM2Outcome, puzzleId: string, theme?: string) {
    const isSolved = outcome === "solved-first-try" || outcome === "solved-after-retry";
    recordSM2Attempt({
      puzzleId,
      outcome,
      timestamp: new Date().toISOString(),
      theme,
    });
    // If solved → remove from review queue; if wrong → stays in queue
    if (isSolved) {
      removeFromReviewQueue(puzzleId);
      setMissedQueueCount((c) => Math.max(0, c - 1));
    }
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
    const freshMissed = getReviewQueue();
    setDueIds(fresh);
    setSM2DueIds(freshSM2);
    setMissedQueueCount(freshMissed.length);
    setResults([]);
    setSessionDone(false);
    setQueueIndex(0);
  }

  const totalDue = dueIds.length + sm2DueIds.length + missedQueueCount;

  // Shared tab header UI
  const TabHeader = () => (
    <div style={{ marginBottom: "1.25rem" }}>
      {/* Page headline */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: "1.8rem", fontWeight: "bold", margin: "0 0 0.4rem" }}>
          Review
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.92rem", margin: "0 auto", maxWidth: "540px", lineHeight: 1.6 }}>
          Revisit puzzles you&apos;ve missed — spaced repetition keeps the right puzzles in front of you at the right time
        </p>
      </div>
      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
        <div style={{ display: "flex", backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "8px", overflow: "hidden" }}>
          <button
            onClick={() => { setActiveTab("due"); setQueueIndex(0); setSessionDone(false); setResults([]); }}
            style={{
              backgroundColor: activeTab === "due" ? "#2e75b6" : "transparent",
              color: activeTab === "due" ? "white" : "#64748b",
              border: "none",
              padding: "0.55rem 1.25rem",
              cursor: "pointer",
              fontWeight: activeTab === "due" ? "bold" : "normal",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            Due Now
            {queue.length > 0 && (
              <span style={{
                backgroundColor: "#ef4444", color: "white", borderRadius: "999px",
                fontSize: "0.65rem", fontWeight: "bold", padding: "0.1rem 0.35rem",
                lineHeight: 1.4,
              }}>{queue.length}</span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab("all-missed"); setQueueIndex(0); setSessionDone(false); setResults([]); }}
            style={{
              backgroundColor: activeTab === "all-missed" ? "#2e75b6" : "transparent",
              color: activeTab === "all-missed" ? "white" : "#64748b",
              border: "none",
              padding: "0.55rem 1.25rem",
              cursor: "pointer",
              fontWeight: activeTab === "all-missed" ? "bold" : "normal",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            All Missed
            {allMissedPuzzles.length > 0 && (
              <span style={{
                backgroundColor: "#f59e0b", color: "#0f0f1a", borderRadius: "999px",
                fontSize: "0.65rem", fontWeight: "bold", padding: "0.1rem 0.35rem",
                lineHeight: 1.4,
              }}>{allMissedPuzzles.length}</span>
            )}
          </button>
        </div>
        <HelpModal title="How Review Works">
          <HelpBulletList items={[
            "Due Now — puzzles scheduled for review today by the SM-2 spaced repetition algorithm",
            "All Missed — every puzzle you've ever gotten wrong, always accessible for extra drilling",
            "Solving a puzzle correctly removes it from the review queue",
            "Missing it again keeps it in the queue",
            "The goal is to get your queue to zero — that means you've genuinely learned from your mistakes",
          ]} />
        </HelpModal>
      </div>
    </div>
  );

  if (loadingSM2) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <TabHeader />
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
          <div style={{ color: "#94a3b8" }}>Loading review puzzles...</div>
        </div>
      </div>
    );
  }

  // All Missed tab — show all missed puzzles queue
  if (activeTab === "all-missed") {
    if (allMissedQueue.length === 0) {
      return (
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <TabHeader />
          <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
            <div style={{ color: "#4ade80", fontSize: "1.25rem", fontWeight: "bold", marginBottom: "0.5rem" }}>No missed puzzles!</div>
            <div style={{ color: "#94a3b8" }}>Every puzzle you&apos;ve tried, you&apos;ve gotten right. Keep it up!</div>
          </div>
        </div>
      );
    }

    if (sessionDone) {
      const solved = results.filter((r) => r === "solved" || r === "solved-first-try" || r === "solved-after-retry").length;
      const failed = results.filter((r) => r !== "solved" && r !== "solved-first-try" && r !== "solved-after-retry").length;
      return (
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <TabHeader />
          <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "2rem", textAlign: "center" }}>
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
            <button onClick={() => { setQueueIndex(0); setSessionDone(false); setResults([]); }} style={{ backgroundColor: "#4ade80", color: "#0f0f1a", border: "none", borderRadius: "8px", padding: "0.75rem 2rem", cursor: "pointer", fontWeight: "bold" }}>
              Drill Again
            </button>
          </div>
        </div>
      );
    }

    const allMissedItem = allMissedQueue[queueIndex];
    if (!allMissedItem) return null;
    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <TabHeader />
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
          <span style={{ color: "#f59e0b", fontSize: "0.9rem", fontWeight: "bold" }}>
            {queueIndex + 1} / {allMissedQueue.length}
          </span>
        </div>
        <div style={{
          backgroundColor: "#1a0f0a", border: "1px solid #4a2a0a", borderRadius: "8px",
          padding: "0.6rem 1rem", marginBottom: "1rem",
          display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap",
        }}>
          <span style={{ color: "#f59e0b", fontSize: "0.85rem", fontWeight: "bold" }}>
            All Missed — solve to clear from your review queue
          </span>
        </div>
        <SM2ReviewBoard
          key={`all-missed-${allMissedItem.puzzle.id}-${queueIndex}`}
          puzzle={(allMissedItem as { type: "missed"; puzzle: AppPuzzle }).puzzle}
          onResult={(outcome) => {
            handleMissedResult(outcome, (allMissedItem as { type: "missed"; puzzle: AppPuzzle }).puzzle.id, (allMissedItem as { type: "missed"; puzzle: AppPuzzle }).puzzle.theme);
            setTimeout(() => {
              if (queueIndex + 1 >= allMissedQueue.length) {
                setSessionDone(true);
              } else {
                setQueueIndex((i) => i + 1);
              }
            }, 1200);
          }}
        />
      </div>
    );
  }

  // Due Now tab
  if (queue.length === 0) {
    const isFreeUser = !hasActiveSubscription();
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <TabHeader />
        <div style={{ backgroundColor: "#1a1a2e", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "3rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
          <div style={{ color: "#4ade80", fontSize: "1.25rem", fontWeight: "bold", marginBottom: "0.5rem" }}>No puzzles due today!</div>
          <div style={{ color: "#94a3b8" }}>Solve new puzzles and come back when reviews are scheduled.</div>
        </div>

        {/* Social proof callout for free users */}
        {isFreeUser && (
          <div style={{
            backgroundColor: "#0a1520", border: "1px solid #1e3a5c", borderRadius: "12px",
            padding: "1.5rem", marginTop: "1.5rem",
          }}>
            <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "1rem", marginBottom: "0.5rem" }}>
              Improver users review an average of 12 puzzles per day and improve 2x faster.
            </div>
            <div style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.65, marginBottom: "0.75rem" }}>
              Your missed puzzles are being forgotten right now. Without spaced repetition, you&apos;ll
              retain only 20% of patterns after 30 days (Ebbinghaus forgetting curve, 1885).
              Improver users on SM-2 retain 80%.
            </div>
            <a
              href="/pricing"
              style={{
                display: "inline-block", backgroundColor: "#4ade80", color: "#0f1a0a",
                padding: "0.6rem 1.25rem", borderRadius: "8px", textDecoration: "none",
                fontWeight: "bold", fontSize: "0.9rem",
              }}
            >
              Unlock spaced repetition →
            </a>
          </div>
        )}

        {!isFreeUser && (
          <div style={{ backgroundColor: "#0a1525", border: "1px solid #1e3a5c", borderRadius: "12px", padding: "1.5rem", marginTop: "1.5rem" }}>
            <div style={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "0.5rem" }}>
              How Spaced Repetition Works
            </div>
            <div style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.65 }}>
              Your missed puzzles are scheduled at optimal intervals using the SM-2 algorithm.
              Research shows spaced repetition improves long-term retention by{" "}
              <strong style={{ color: "#4ade80" }}>up to 400%</strong> vs random practice (Wozniak SM-2, 1987).
            </div>
          </div>
        )}

        {allQueued.length > 0 && <UpcomingQueue allQueued={allQueued} />}
      </div>
    );
  }

  if (sessionDone) {
    const solved = results.filter((r) => r === "solved" || r === "solved-first-try" || r === "solved-after-retry").length;
    const failed = results.filter((r) => r !== "solved" && r !== "solved-first-try" && r !== "solved-after-retry").length;
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <TabHeader />
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
            Check for More Reviews
          </button>
        </div>
        {allQueued.length > 0 && <UpcomingQueue allQueued={allQueued} />}
      </div>
    );
  }

  const currentItem = queue[queueIndex];

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <TabHeader />
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
        <span style={{ color: "#4ade80", fontSize: "0.9rem", fontWeight: "bold" }}>
          {queueIndex + 1} / {queue.length}
        </span>
      </div>

      {/* Missed queue count banner */}
      {missedQueueCount > 0 && (
        <div style={{
          backgroundColor: "#1a0f0a",
          border: "1px solid #4a2a0a",
          borderRadius: "10px",
          padding: "0.6rem 1rem",
          marginBottom: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
        }}>
          <span style={{ color: "#f59e0b", fontSize: "0.88rem", fontWeight: "bold" }}>
            {missedQueueCount} missed puzzle{missedQueueCount !== 1 ? "s" : ""} in your review queue
          </span>
          <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
            — solve them correctly to clear them
          </span>
        </div>
      )}

      {currentItem.type === "classic" ? (
        <ReviewBoard
          key={`classic-${currentItem.puzzle.id}`}
          puzzle={currentItem.puzzle}
          onResult={handleClassicResult}
        />
      ) : currentItem.type === "missed" ? (
        <div>
          {(() => {
            const timeRecord = puzzleTimes[currentItem.puzzle.id] ?? null;
            const missedTime = timeRecord?.history.filter(h => !h.correct).slice(-1)[0]?.time ?? null;
            const bestSolveTime = timeRecord?.bestTime ?? null;
            return (
              <div style={{
                backgroundColor: "#1a0f0a",
                border: "1px solid #4a2a0a",
                borderRadius: "8px",
                padding: "0.6rem 1rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}>
                <span style={{ color: "#f59e0b", fontSize: "0.85rem", fontWeight: "bold" }}>
                  Missed Puzzle — solve it to clear from your review queue
                </span>
                {missedTime && (
                  <span style={{ color: "#ef4444", fontSize: "0.78rem", backgroundColor: "#1f0808", border: "1px solid #4a1a1a", borderRadius: "5px", padding: "0.15rem 0.5rem" }}>
                    Missed in {missedTime}s
                  </span>
                )}
                {bestSolveTime && (
                  <span style={{ color: "#4ade80", fontSize: "0.78rem", backgroundColor: "#0a1f12", border: "1px solid #1a4a2a", borderRadius: "5px", padding: "0.15rem 0.5rem" }}>
                    Previously solved in {bestSolveTime}s
                  </span>
                )}
              </div>
            );
          })()}
          <SM2ReviewBoard
            key={`missed-${currentItem.puzzle.id}`}
            puzzle={currentItem.puzzle}
            onResult={(outcome) =>
              handleMissedResult(outcome, currentItem.puzzle.id, currentItem.puzzle.theme)
            }
          />
        </div>
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
