"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TacticBoard } from "@/components/TrainingSession";
import StockfishAnalysis from "@/components/StockfishAnalysis";
import { recordActivityToday, updateTacticsRating } from "@/lib/storage";
import {
  defaultSet,
  ensureActiveSets,
  generateSet,
  loadStore,
  nextIndex,
  puzzleStatus,
  recordAttempt,
  setsOfKind,
  skipPuzzle,
  solvedToday,
  summarize,
  FAST_MS,
  MASTERY_MS,
  type PuzzleStatus,
  type SetKind,
  type WoodpeckerPuzzle,
  type WoodpeckerSet,
} from "@/lib/woodpecker";

type Store = ReturnType<typeof loadStore>;

// ── Status palette ──────────────────────────────────────────────────────────

const STATUS_STYLE: Record<PuzzleStatus, { bg: string; fg: string; label: string }> = {
  new:      { bg: "#1e293b", fg: "#64748b", label: "Not tried" },
  missed:   { bg: "#7f1d1d", fg: "#fca5a5", label: "Missed" },
  slow:     { bg: "#78350f", fg: "#fcd34d", label: "Solved, over 30s" },
  fast:     { bg: "#1e3a8a", fg: "#93c5fd", label: "Solved, under 30s" },
  mastered: { bg: "#14532d", fg: "#86efac", label: "Mastered, under 10s" },
};

const SPEED_LEGEND: PuzzleStatus[] = ["new", "missed", "slow", "fast", "mastered"];
const CALC_LEGEND: PuzzleStatus[] = ["new", "missed", "mastered"];

function fmtTime(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function themeLabel(t: string): string {
  return t.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

// ── Stopwatch ───────────────────────────────────────────────────────────────

function Stopwatch({ startedAt, running, kind }: { startedAt: number; running: boolean; kind: SetKind }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  const elapsed = Math.max(0, (running ? now : startedAt) - startedAt);
  const color = kind === "calculation"
    ? "#94a3b8"
    : elapsed < MASTERY_MS ? "#4ade80" : elapsed < FAST_MS ? "#60a5fa" : "#f59e0b";
  return (
    <span style={{ fontFamily: "monospace", fontSize: "1.1rem", fontWeight: 700, color, minWidth: "4.5rem", textAlign: "right" }}>
      ⏱ {(elapsed / 1000).toFixed(1)}s
    </span>
  );
}

// ── Tracker grid ────────────────────────────────────────────────────────────

function TrackerGrid({
  set, currentIndex, onPick,
}: { set: WoodpeckerSet; currentIndex: number; onPick: (i: number) => void }) {
  const cols = 25;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "3px" }}>
      {set.puzzles.map((p, i) => {
        const st = puzzleStatus(p, set.kind);
        const s = STATUS_STYLE[st];
        const isCurrent = i === currentIndex;
        return (
          <button
            key={p.id}
            onClick={() => onPick(i)}
            title={`#${i + 1} · ${p.rating} · ${themeLabel(p.theme)}${p.source === "own-game" ? " · from your game" : ""}\n${s.label}${p.bestTimeMs !== null ? ` · best ${fmtTime(p.bestTimeMs)}` : ""}${p.attempts ? ` · ${p.attempts} attempt${p.attempts > 1 ? "s" : ""}` : ""}`}
            style={{
              aspectRatio: "1",
              minWidth: 0,
              backgroundColor: s.bg,
              color: s.fg,
              border: isCurrent ? "2px solid #e2e8f0" : p.source === "own-game" ? "1px solid #f59e0b" : "1px solid transparent",
              borderRadius: "4px",
              fontSize: "0.6rem",
              fontWeight: isCurrent ? 800 : 600,
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
              transition: "transform 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.25)"; e.currentTarget.style.zIndex = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.zIndex = "0"; }}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function WoodpeckerTrainer() {
  const [store, setStore] = useState<Store | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [boardKey, setBoardKey] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [solving, setSolving] = useState(true);
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const retryRef = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceRef = useRef<() => void>(() => {});

  // Boot: load store, make sure a live speed + calculation set exist
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = loadStore();
      const hadSets = s.sets.length > 0;
      if (!hadSets) setGenerating(true);
      await ensureActiveSets(s);
      if (cancelled) return;
      setStore(s);
      const first = defaultSet(s, "speed") ?? s.sets[0];
      setSelectedId(first.id);
      setCurrentIndex(nextIndex(first));
      setStartedAt(Date.now());
      setGenerating(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const set = store?.sets.find((s) => s.id === selectedId) ?? null;
  const puzzle: WoodpeckerPuzzle | null = set && currentIndex >= 0 ? set.puzzles[currentIndex] ?? null : null;

  const loadPuzzle = useCallback((idx: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    retryRef.current = false;
    setCurrentIndex(idx);
    setBoardKey((k) => k + 1);
    setStartedAt(Date.now());
    setSolving(true);
    setLastOutcome(null);
    setShowAnalysis(false);
  }, []);

  const selectSet = useCallback((id: string) => {
    if (!store) return;
    const s = store.sets.find((x) => x.id === id);
    if (!s) return;
    setSelectedId(id);
    loadPuzzle(nextIndex(s));
  }, [store, loadPuzzle]);

  const advance = useCallback(() => {
    if (!set) return;
    loadPuzzle(nextIndex(set));
  }, [set, loadPuzzle]);
  useEffect(() => { advanceRef.current = advance; }, [advance]);

  const handleResult = useCallback((correct: boolean, opts?: { usedHint?: boolean }) => {
    if (!store || !set || !puzzle || currentIndex < 0) return;
    const solveTimeMs = Date.now() - startedAt;
    const usedHint = !!opts?.usedHint;
    const isRetry = retryRef.current;
    retryRef.current = false;
    setSolving(false);

    const wasFirst = puzzle.attempts === 0;
    const outcome = recordAttempt(store, {
      setId: set.id, index: currentIndex, correct, usedHint, isRetry, solveTimeMs,
    });
    // recordAttempt mutates in place; clone the reference so React re-renders
    setStore({ ...store });

    // Only speed sets feed the tactics (Elo) rating — a slow, untimed calc
    // solve at +400 would inflate the rating that anchors the next speed set.
    if (set.kind === "speed" && wasFirst && puzzle.rating > 0) {
      updateTacticsRating(puzzle.rating, correct && !usedHint);
    }
    if (correct) recordActivityToday();

    if (outcome) {
      const t = fmtTime(solveTimeMs);
      if (!correct) setLastOutcome("✗ Missed — it comes back around next cycle");
      else if (usedHint) setLastOutcome(`✓ ${t} with a hint — no credit, you'll see it again`);
      else if (isRetry) setLastOutcome(`✓ ${t} on retry — practice only, cycles back`);
      else if (outcome.status === "mastered") setLastOutcome(outcome.newlyMastered ? `★ ${t} — MASTERED` : `★ ${t} — still mastered`);
      else if (outcome.status === "fast") setLastOutcome(`✓ ${t} — under 30. Under 10 next time for mastery`);
      else setLastOutcome(`✓ ${t} — solved. Speed it up on the next pass`);
    }

    // Correct / hint / retry auto-advance; a miss waits for the overlay's Next.
    if (correct || usedHint) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => advanceRef.current(), 1400);
    }
  }, [store, set, puzzle, currentIndex, startedAt]);

  const handleRetry = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    retryRef.current = true;
    setStartedAt(Date.now());
    setSolving(true);
    setLastOutcome(null);
  }, []);

  const skipCurrent = useCallback(() => {
    if (!store || !set) return;
    skipPuzzle(store, set.id, currentIndex);
    setStore({ ...store });
    loadPuzzle(nextIndex(set, (currentIndex + 1) % set.puzzles.length));
  }, [store, set, currentIndex, loadPuzzle]);

  const startNextSet = useCallback(async (kind: SetKind) => {
    if (!store) return;
    setGenerating(true);
    const s = await generateSet(store, kind);
    setStore({ ...store });
    setGenerating(false);
    setSelectedId(s.id);
    loadPuzzle(nextIndex(s));
  }, [store, loadPuzzle]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!store || !set) {
    return (
      <div style={{ maxWidth: "600px", margin: "4rem auto", textAlign: "center", color: "#94a3b8" }}>
        <div style={{ fontSize: "3rem", color: "#4ade80", marginBottom: "0.75rem" }}>♔</div>
        <div style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0" }}>
          {generating ? "Building your first 200…" : "Loading…"}
        </div>
        {generating && (
          <div style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>
            Picking puzzles just above your level, weighted toward the tactics you miss in your games.
          </div>
        )}
      </div>
    );
  }

  const speedSets = setsOfKind(store, "speed");
  const calcSets = setsOfKind(store, "calculation");
  const sum = summarize(set);
  const pct = sum.total ? Math.round((sum.mastered / sum.total) * 100) : 0;
  const complete = sum.mastered === sum.total && sum.total > 0;
  const legend = set.kind === "speed" ? SPEED_LEGEND : CALC_LEGEND;
  const today = solvedToday(store);

  const tab = (s: WoodpeckerSet) => {
    const ss = summarize(s);
    const done = ss.mastered === ss.total;
    const active = s.id === set.id;
    const label = s.kind === "speed" ? `Set ${s.setNumber}` : `Calc ${s.setNumber}`;
    return (
      <button
        key={s.id}
        onClick={() => selectSet(s.id)}
        style={{
          backgroundColor: active ? "#13132b" : "transparent",
          border: `1px solid ${active ? (s.kind === "calculation" ? "#a78bfa" : "#4ade80") : "#2e3a5c"}`,
          color: active ? "#e2e8f0" : "#94a3b8",
          borderRadius: "999px",
          padding: "0.4rem 0.9rem",
          fontSize: "0.82rem",
          fontWeight: active ? 700 : 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
        }}
      >
        {done && <span style={{ color: "#4ade80" }}>✓</span>}
        {label}
        <span style={{ color: "#64748b", fontSize: "0.72rem" }}>{ss.mastered}/{ss.total}</span>
      </button>
    );
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem" }}>

      {/* Set tabs */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        {speedSets.map(tab)}
        <span style={{ width: "1px", height: "22px", backgroundColor: "#2e3a5c", margin: "0 0.25rem" }} />
        {calcSets.map(tab)}
      </div>

      {/* Tracker card */}
      <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1.1rem 1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.6rem" }}>
          <div>
            <span style={{ color: "#e2e8f0", fontWeight: 800, fontSize: "1.05rem" }}>
              {set.kind === "speed" ? `Speed Set ${set.setNumber}` : `Calculation Set ${set.setNumber}`}
            </span>
            <span style={{ color: "#64748b", fontSize: "0.8rem", marginLeft: "0.6rem" }}>
              {set.ratingFloor}–{set.ratingCeiling}
              {set.kind === "speed" ? " · master each in under 10s" : " · solve at your own pace"}
            </span>
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
            Today: <strong style={{ color: "#e2e8f0" }}>{today}</strong> solved
          </div>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.85rem" }}>
          <div style={{ flex: 1, height: "8px", backgroundColor: "#0f0f1a", borderRadius: "999px", overflow: "hidden", border: "1px solid #1e2a3a" }}>
            <div style={{ height: "100%", width: `${pct}%`, backgroundColor: "#4ade80", transition: "width 0.4s" }} />
          </div>
          <span style={{ color: "#4ade80", fontWeight: 800, fontSize: "0.95rem", whiteSpace: "nowrap" }}>
            {sum.mastered}/{sum.total} <span style={{ color: "#64748b", fontWeight: 500, fontSize: "0.8rem" }}>mastered</span>
          </span>
        </div>

        <TrackerGrid set={set} currentIndex={currentIndex} onPick={loadPuzzle} />

        {/* Legend */}
        <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap", marginTop: "0.75rem", fontSize: "0.72rem", color: "#94a3b8" }}>
          {legend.map((st) => {
            const count = st === "new" ? sum.fresh : st === "missed" ? sum.missed : st === "slow" ? sum.slow : st === "fast" ? sum.fast : sum.mastered;
            return (
              <span key={st} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: STATUS_STYLE[st].bg, border: `1px solid ${STATUS_STYLE[st].fg}40`, display: "inline-block" }} />
                {STATUS_STYLE[st].label} <strong style={{ color: "#e2e8f0" }}>{count}</strong>
              </span>
            );
          })}
          {set.puzzles.some((p) => p.source === "own-game") && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", border: "1px solid #f59e0b", display: "inline-block" }} />
              From your games
            </span>
          )}
        </div>
      </div>

      {/* Set complete */}
      {complete && (
        <div style={{ backgroundColor: "#0d2218", border: "1px solid #4ade80", borderRadius: "12px", padding: "1.5rem", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>🏆</div>
          <div style={{ color: "#4ade80", fontWeight: 800, fontSize: "1.2rem" }}>
            {set.kind === "speed" ? `Set ${set.setNumber} complete — all 200 under 10 seconds` : `Calculation Set ${set.setNumber} complete`}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "0.4rem 0 1rem" }}>
            This set is saved. Click any square above to practice it anytime.
          </div>
          {!setsOfKind(store, set.kind).some((s) => s.setNumber > set.setNumber) && (
            <button
              onClick={() => startNextSet(set.kind)}
              disabled={generating}
              style={{ backgroundColor: "#4ade80", color: "#0f0f1a", border: "none", borderRadius: "10px", padding: "0.8rem 1.75rem", fontWeight: 800, fontSize: "0.95rem", cursor: "pointer" }}
            >
              {generating ? "Building…" : set.kind === "speed" ? `Start Set ${set.setNumber + 1} (harder) →` : `Start Calculation Set ${set.setNumber + 1} →`}
            </button>
          )}
        </div>
      )}

      {/* Puzzle */}
      {puzzle && (
        <div style={{ backgroundColor: "#13132b", border: "1px solid #2e3a5c", borderRadius: "12px", padding: "1rem 0 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", padding: "0 1.25rem 0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span style={{ color: "#e2e8f0", fontWeight: 800, fontSize: "1rem" }}>#{currentIndex + 1}</span>
              <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>{puzzle.rating} · {themeLabel(puzzle.theme)}</span>
              {puzzle.source === "own-game" && (
                <span style={{ color: "#f59e0b", fontSize: "0.7rem", border: "1px solid #f59e0b", borderRadius: "999px", padding: "0.1rem 0.5rem", fontWeight: 700 }}>FROM YOUR GAME</span>
              )}
              {puzzle.bestTimeMs !== null && (
                <span style={{ color: "#64748b", fontSize: "0.78rem" }}>best {fmtTime(puzzle.bestTimeMs)}</span>
              )}
              {lastOutcome && (
                <span style={{ color: lastOutcome.startsWith("★") ? "#4ade80" : lastOutcome.startsWith("✗") ? "#fca5a5" : "#93c5fd", fontSize: "0.82rem", fontWeight: 600 }}>
                  {lastOutcome}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Stopwatch startedAt={startedAt} running={solving} kind={set.kind} />
              <button
                onClick={skipCurrent}
                title={solving ? "Skip without attempting" : "Next puzzle"}
                style={{ backgroundColor: solving ? "transparent" : "#4ade80", border: "1px solid #2e3a5c", color: solving ? "#94a3b8" : "#0f0f1a", borderRadius: "8px", padding: "0.35rem 0.7rem", fontSize: "0.78rem", fontWeight: solving ? 500 : 700, cursor: "pointer" }}
              >
                {solving ? "Skip →" : "Next →"}
              </button>
            </div>
          </div>

          <TacticBoard
            key={`wp_${set.id}_${currentIndex}_${boardKey}`}
            puzzleData={{ fen: puzzle.fen, solution: puzzle.solution, rating: puzzle.rating, theme: puzzle.theme }}
            onResult={handleResult}
            onAdvance={() => advanceRef.current()}
            onRetry={handleRetry}
            onCctUnlocked={() => setStartedAt(Date.now())}
            showAnalysis={showAnalysis}
            onAnalyzeClick={() => {
              // Looking at the engine before solving is a miss — be honest.
              if (solving) handleResult(false);
              setShowAnalysis((v) => !v);
            }}
          />

          {showAnalysis && (
            <div style={{ padding: "0.75rem 1.25rem 0" }}>
              <StockfishAnalysis
                fen={puzzle.fen}
                orientation={puzzle.fen.includes(" b ") ? "black" : "white"}
                onClose={() => setShowAnalysis(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
