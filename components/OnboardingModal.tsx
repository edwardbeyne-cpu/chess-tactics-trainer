"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";

const ONBOARDED_KEY = "ctt_onboarded";
const SKILL_LEVEL_KEY = "ctt_skill_level";
const PATTERN_RATINGS_KEY = "ctt_pattern_ratings";
const TACTICS_RATING_KEY = "ctt_tactics_rating";
const PUZZLE_RATING_KEY = "ctt_puzzle_rating";
const CUSTOM_USERNAME_KEY = "ctt_custom_username";
const CUSTOM_PLATFORM_KEY = "ctt_custom_platform";
const CUSTOM_QUEUE_KEY = "ctt_custom_queue";
const CUSTOM_ANALYSIS_KEY = "ctt_custom_analysis";
const GOAL_KEY = "ctt_goal";
const GOAL_START_RATING_KEY = "ctt_goal_start_rating";
const PLATFORM_RATING_KEY = "ctt_platform_rating";
const PLATFORM_RATINGS_V2_KEY = "ctt_platform_ratings_v2";

type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";
type Platform = "chesscom" | "lichess";
export type UserGoal = "structured_plan" | "find_weaknesses" | "drill_puzzles" | "from_my_games";

const SKILL_ELO: Record<SkillLevel, number> = {
  beginner: 700,
  intermediate: 1000,
  advanced: 1300,
  expert: 1600,
};

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

  // Seed ALL pattern ELOs
  const patternRatings: Record<string, { theme: string; rating: number; gamesPlayed: number; history: [] }> = {};
  for (const theme of PATTERN_THEMES) {
    patternRatings[theme] = { theme, rating: elo, gamesPlayed: 0, history: [] };
  }
  localStorage.setItem(PATTERN_RATINGS_KEY, JSON.stringify(patternRatings));

  // Seed tactics rating
  const tacticsData = {
    tacticsRating: elo,
    tacticsRatingStart: elo,
    tacticsRatingHistory: [],
    totalPuzzlesRated: 0,
    lastMilestoneAt: elo,
  };
  localStorage.setItem(TACTICS_RATING_KEY, JSON.stringify(tacticsData));

  // Seed puzzle rating
  const puzzleData = { rating: elo, totalPuzzlesRated: 0 };
  localStorage.setItem(PUZZLE_RATING_KEY, JSON.stringify(puzzleData));

  // Save goal start rating
  localStorage.setItem(GOAL_START_RATING_KEY, String(elo));
}

const GOAL_OPTIONS: Array<{ value: UserGoal; icon: string; label: string; sub: string }> = [
  { value: "structured_plan", icon: "🎯", label: "I want a structured training plan", sub: "Start with fundamentals and build up" },
  { value: "find_weaknesses", icon: "🔍", label: "Show me my specific weaknesses", sub: "Target the patterns you struggle with most" },
  { value: "drill_puzzles", icon: "⚡", label: "I just want to drill puzzles", sub: "Jump straight into puzzle solving" },
  { value: "from_my_games", icon: "🎮", label: "Build me a training program from my games", sub: "Train on tactics from your own games" },
];

// ── Minimal game analyzer (runs in onboarding background) ─────────────────

interface MissedTactic {
  pattern: string;
  fen: string;
  moveNumber: number;
}

function parsePgnMoves(pgn: string): string[] {
  const cleaned = pgn
    .replace(/\{[^}]*\}/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\$\d+/g, "")
    .replace(/\d+\./g, "")
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, "")
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const uci: string[] = [];
  const c = new Chess();
  for (const tok of tokens) {
    try {
      const m = c.move(tok);
      if (m) uci.push(m.from + m.to + (m.promotion ?? ""));
    } catch { break; }
  }
  return uci;
}

function detectMissedTacticSimple(fen: string): string | null {
  const c = new Chess(fen);
  const moves = c.moves({ verbose: true });
  // Simple fork detector: any move that attacks 2+ pieces
  for (const m of moves) {
    const clone = new Chess(fen);
    clone.move(m);
    const attacks = clone.moves({ verbose: true }).filter(x => x.captured);
    if (attacks.length >= 2) return "fork";
  }
  return null;
}

function analyzeGamesForQueue(games: Array<{ pgn: string; playerColor: string }>): Array<{ pattern: string; fen: string }> {
  const results: Array<{ pattern: string; fen: string }> = [];
  for (const { pgn, playerColor } of games.slice(0, 10)) {
    const moves = parsePgnMoves(pgn);
    const isWhite = playerColor.toLowerCase().startsWith("w");
    const c = new Chess();
    let moveNum = 0;
    for (const uci of moves) {
      moveNum++;
      const isPlayerTurn = isWhite ? c.turn() === "w" : c.turn() === "b";
      const fen = c.fen();
      try {
        c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : undefined });
      } catch { break; }
      if (isPlayerTurn && moveNum > 1) {
        const pattern = detectMissedTacticSimple(fen);
        if (pattern) results.push({ pattern, fen });
      }
    }
  }
  return results.slice(0, 20);
}

// ── Platform rating fetcher ────────────────────────────────────────────────

interface AllRatings {
  bullet: number | null;
  blitz: number | null;
  rapid: number | null;
  main: number | null; // the best single rating to seed ELO with
}

async function fetchAllRatings(platform: Platform, username: string): Promise<AllRatings | null> {
  try {
    if (platform === "chesscom") {
      const res = await fetch(
        `https://api.chess.com/pub/player/${username.toLowerCase()}/stats`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const bullet: number | null = data?.chess_bullet?.last?.rating ?? null;
      const blitz: number | null = data?.chess_blitz?.last?.rating ?? null;
      const rapid: number | null = data?.chess_rapid?.last?.rating ?? null;
      const main = blitz ?? rapid ?? bullet;
      return { bullet, blitz, rapid, main };
    } else {
      const res = await fetch(
        `https://lichess.org/api/user/${username}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const perfs = data?.perfs ?? {};
      const bullet: number | null = perfs?.bullet?.rating ?? null;
      const blitz: number | null = perfs?.blitz?.rating ?? null;
      const rapid: number | null = perfs?.rapid?.rating ?? null;
      const main = blitz ?? rapid ?? bullet;
      return { bullet, blitz, rapid, main };
    }
  } catch {
    return null;
  }
}

async function fetchPlatformRating(platform: Platform, username: string): Promise<number | null> {
  const ratings = await fetchAllRatings(platform, username);
  return ratings?.main ?? null;
}

async function fetchRecentGames(platform: Platform, username: string): Promise<Array<{ pgn: string; playerColor: string }>> {
  try {
    if (platform === "chesscom") {
      const archivesRes = await fetch(
        `https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`,
        { headers: { "User-Agent": "ChessTacticsTrainer/1.0" } }
      );
      if (!archivesRes.ok) return [];
      const { archives } = await archivesRes.json() as { archives: string[] };
      if (!archives?.length) return [];
      const gamesRes = await fetch(archives[archives.length - 1], { headers: { "User-Agent": "ChessTacticsTrainer/1.0" } });
      if (!gamesRes.ok) return [];
      const { games } = await gamesRes.json() as { games: Array<{ pgn: string; white: { username: string }; black: { username: string } }> };
      if (!games?.length) return [];
      return games.slice(-10).map(g => ({
        pgn: g.pgn,
        playerColor: g.white.username.toLowerCase() === username.toLowerCase() ? "white" : "black",
      }));
    } else {
      const res = await fetch(
        `https://lichess.org/api/games/user/${username}?max=10&moves=true&pgnInJson=false`,
        { headers: { Accept: "application/x-ndjson" } }
      );
      if (!res.ok) return [];
      const text = await res.text();
      return text.trim().split("\n").filter(Boolean).map(line => {
        try {
          const game = JSON.parse(line);
          return {
            pgn: game.moves ?? "",
            playerColor: game.players?.white?.user?.name?.toLowerCase() === username.toLowerCase() ? "white" : "black",
          };
        } catch { return null; }
      }).filter((x): x is { pgn: string; playerColor: string } => x !== null);
    }
  } catch {
    return [];
  }
}

export default function OnboardingModal() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedGoal, setSelectedGoal] = useState<UserGoal | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<SkillLevel | null>(null);

  // Step 2 state
  const [platform, setPlatform] = useState<Platform>("chesscom");
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectedUsername, setConnectedUsername] = useState("");
  const [connectedPlatform, setConnectedPlatform] = useState<Platform>("chesscom");
  const [fetchedRating, setFetchedRating] = useState<number | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const router = useRouter();

  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARDED_KEY);
    if (!onboarded) {
      setShow(true);
    }
  }, []);

  function completeOnboarding() {
    localStorage.setItem(ONBOARDED_KEY, "true");
    setShow(false);
  }

  function handleStep1Continue() {
    if (!selectedGoal || !selectedLevel) return;
    localStorage.setItem(GOAL_KEY, selectedGoal);
    const elo = SKILL_ELO[selectedLevel];
    localStorage.setItem(SKILL_LEVEL_KEY, selectedLevel);
    seedRatings(elo);
    setStep(2);
  }

  const runBackgroundAnalysis = useCallback(async (plat: Platform, uname: string) => {
    setAnalysisRunning(true);
    try {
      const games = await fetchRecentGames(plat, uname);
      if (games.length > 0) {
        const missed = analyzeGamesForQueue(games);
        if (missed.length > 0) {
          const stored = { missedTactics: missed, platform: plat, username: uname, analyzedAt: new Date().toISOString() };
          localStorage.setItem(CUSTOM_ANALYSIS_KEY, JSON.stringify(stored));
          // Build minimal custom queue entries
          const queue = missed.map((m, i) => ({
            id: `custom_${i}`,
            fen: m.fen,
            theme: m.pattern,
            source: `${plat}:${uname}`,
          }));
          localStorage.setItem(CUSTOM_QUEUE_KEY, JSON.stringify(queue));
        }
      }
    } catch {
      // Silent — background task
    } finally {
      setAnalysisRunning(false);
    }
  }, []);

  async function handleConnect() {
    const uname = username.trim();
    if (!uname) return;
    setConnecting(true);
    setConnectError(null);

    try {
      // 1. Fetch all platform ratings (bullet, blitz, rapid)
      const allRatings = await fetchAllRatings(platform, uname);
      const platformRating = allRatings?.main ?? null;

      if (platformRating === null) {
        setConnectError(`Couldn't find ${platform === "chesscom" ? "Chess.com" : "Lichess"} account "${uname}". Check the username and try again.`);
        setConnecting(false);
        return;
      }

      // 2. Seed all ratings from platform rating (replaces self-reported level)
      seedRatings(platformRating);

      // 3. Store platform metadata + all three ratings
      localStorage.setItem(CUSTOM_USERNAME_KEY, uname);
      localStorage.setItem(CUSTOM_PLATFORM_KEY, platform);
      localStorage.setItem(PLATFORM_RATING_KEY, String(platformRating));

      // Store all three ratings for Training Plan page
      if (allRatings) {
        const ratingsV2 = {
          bullet: allRatings.bullet,
          blitz: allRatings.blitz,
          rapid: allRatings.rapid,
          main: allRatings.blitz ? "blitz" : allRatings.rapid ? "rapid" : "bullet",
        };
        localStorage.setItem(PLATFORM_RATINGS_V2_KEY, JSON.stringify(ratingsV2));
      }

      setFetchedRating(platformRating);
      setConnectedUsername(uname);
      setConnectedPlatform(platform);
      setConnected(true);

      // 4. Run game analysis in background (don't await — fire and forget)
      runBackgroundAnalysis(platform, uname);

    } catch {
      setConnectError("Connection failed. Check your username and try again.");
    } finally {
      setConnecting(false);
    }
  }

  function handleSkipConnect() {
    // Use self-reported level (already seeded in step 1)
    setStep(3);
  }

  function handleConnectContinue() {
    setStep(3);
  }

  function handleStart() {
    completeOnboarding();
    // Always route to Training Plan as the new home screen
    router.push("/app/training-plan");
  }

  function handleExploreOwn() {
    completeOnboarding();
  }

  if (!show) return null;

  const levelOptions: Array<{ value: SkillLevel; label: string; sub: string }> = [
    { value: "beginner", label: "Beginner", sub: "Under 1000" },
    { value: "intermediate", label: "Intermediate", sub: "1000 – 1500" },
    { value: "advanced", label: "Advanced", sub: "1500 – 2000" },
    { value: "expert", label: "Expert", sub: "2000+" },
  ];

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

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#1a1a2e",
    border: "1px solid #2e3a5c",
    borderRadius: "16px",
    padding: "2rem",
    maxWidth: "480px",
    width: "100%",
    boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
    margin: "auto",
  };

  const stepIndicator = (
    <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "1.75rem" }}>
      {[1, 2, 3].map((s) => (
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
  );

  // ── Step 1: Goal + Level ─────────────────────────────────────────────────
  if (step === 1) {
    const canContinue = selectedGoal !== null && selectedLevel !== null;
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          {stepIndicator}

          {/* Part A — Goal */}
          <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎯</div>
            <h2 style={{ color: "#e2e8f0", fontSize: "1.3rem", fontWeight: "bold", margin: "0 0 0.4rem" }}>
              What&apos;s your main goal?
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
              We&apos;ll prioritize the patterns that matter most to you.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.75rem" }}>
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

          {/* Divider */}
          <div style={{ borderTop: "1px solid #1e2a3a", marginBottom: "1.5rem" }} />

          {/* Part B — Level */}
          <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            <h2 style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 0.35rem" }}>
              What&apos;s your level?
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.82rem", margin: 0 }}>
              We&apos;ll calibrate your starting rating so puzzles feel right from day one.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginBottom: "1.5rem" }}>
            {levelOptions.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  backgroundColor: selectedLevel === opt.value ? "#0d2a1a" : "#0d1621",
                  border: `1px solid ${selectedLevel === opt.value ? "#4ade80" : "#1e3a5c"}`,
                  borderRadius: "10px",
                  padding: "0.75rem 1rem",
                  cursor: "pointer",
                  transition: "border-color 0.15s, background-color 0.15s",
                }}
                onClick={() => setSelectedLevel(opt.value)}
              >
                <input
                  type="radio"
                  name="level"
                  value={opt.value}
                  checked={selectedLevel === opt.value}
                  onChange={() => setSelectedLevel(opt.value)}
                  style={{ accentColor: "#4ade80", width: "16px", height: "16px" }}
                />
                <div>
                  <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: "0.88rem" }}>{opt.label}</div>
                  <div style={{ color: "#64748b", fontSize: "0.75rem" }}>{opt.sub}</div>
                </div>
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

  // ── Step 2: Connect account ───────────────────────────────────────────────
  if (step === 2) {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          {stepIndicator}

          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🔗</div>
            <h2 style={{ color: "#e2e8f0", fontSize: "1.2rem", fontWeight: "bold", margin: "0 0 0.6rem", lineHeight: 1.35 }}>
              Connect your account — we&apos;ll analyze your games and build training around your actual weaknesses
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.84rem", margin: 0, lineHeight: 1.6 }}>
              No account? No problem — we&apos;ll build your profile as you train.
            </p>
          </div>

          {connected ? (
            /* ── Connected state ── */
            <div>
              <div style={{
                backgroundColor: "#0d2a1a",
                border: "1px solid #4ade80",
                borderRadius: "12px",
                padding: "1.25rem",
                marginBottom: "1rem",
                textAlign: "center",
              }}>
                <div style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                  ✓ Connected
                </div>
                <div style={{ color: "#e2e8f0", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "0.2rem" }}>
                  {connectedUsername}
                </div>
                <div style={{ color: "#64748b", fontSize: "0.78rem", marginBottom: "0.75rem" }}>
                  {connectedPlatform === "chesscom" ? "♟ Chess.com" : "🐴 Lichess"}
                </div>
                {fetchedRating !== null && (
                  <div style={{
                    backgroundColor: "#0a1520",
                    border: "1px solid #1e3a5c",
                    borderRadius: "8px",
                    padding: "0.5rem",
                    marginBottom: "0.5rem",
                  }}>
                    <div style={{ color: "#4ade80", fontSize: "1.6rem", fontWeight: "bold", lineHeight: 1 }}>
                      {fetchedRating}
                    </div>
                    <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: "0.2rem" }}>
                      Platform rating — used to seed your training
                    </div>
                  </div>
                )}
                {analysisRunning && (
                  <div style={{ color: "#f59e0b", fontSize: "0.75rem", marginTop: "0.4rem" }}>
                    ⏳ Analyzing your recent games in the background…
                  </div>
                )}
              </div>

              <button
                onClick={handleConnectContinue}
                style={{
                  backgroundColor: "#4ade80",
                  color: "#0f1a0a",
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.85rem",
                  fontSize: "0.95rem",
                  fontWeight: "bold",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Continue →
              </button>
            </div>
          ) : (
            /* ── Not yet connected ── */
            <>
              {/* Platform toggle */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                {(["chesscom", "lichess"] as Platform[]).map((plat) => (
                  <button
                    key={plat}
                    onClick={() => setPlatform(plat)}
                    style={{
                      flex: 1,
                      backgroundColor: platform === plat ? "#1e3a5c" : "#0d1621",
                      border: `1px solid ${platform === plat ? "#4ade80" : "#2e3a5c"}`,
                      borderRadius: "8px",
                      color: platform === plat ? "#e2e8f0" : "#64748b",
                      fontSize: "0.85rem",
                      fontWeight: platform === plat ? "bold" : "normal",
                      padding: "0.55rem",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {plat === "chesscom" ? "♟ Chess.com" : "🐴 Lichess"}
                  </button>
                ))}
              </div>

              {/* Username input */}
              <div style={{ marginBottom: connectError ? "0.5rem" : "1rem" }}>
                <input
                  type="text"
                  placeholder={platform === "chesscom" ? "Your Chess.com username" : "Your Lichess username"}
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setConnectError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
                  style={{
                    backgroundColor: "#0d1621",
                    border: `1px solid ${connectError ? "#ef4444" : "#2e3a5c"}`,
                    borderRadius: "8px",
                    color: "#e2e8f0",
                    fontSize: "0.95rem",
                    padding: "0.75rem 1rem",
                    width: "100%",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {connectError && (
                <div style={{
                  color: "#ef4444",
                  fontSize: "0.78rem",
                  marginBottom: "0.75rem",
                  backgroundColor: "#1f0a0a",
                  border: "1px solid #4a1a1a",
                  borderRadius: "6px",
                  padding: "0.4rem 0.6rem",
                }}>
                  {connectError}
                </div>
              )}

              {/* What we'll do on connect — value prop bullets */}
              <div style={{
                backgroundColor: "#0a1520",
                border: "1px solid #1e3a5c",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
              }}>
                <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                  What happens when you connect
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {[
                    "Your actual rating seeds your puzzle difficulty",
                    "Recent games analyzed for missed tactics",
                    "Custom training queue built from your blunders",
                  ].map((item) => (
                    <div key={item} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                      <span style={{ color: "#4ade80", fontSize: "0.75rem", flexShrink: 0, marginTop: "0.1rem" }}>✓</span>
                      <span style={{ color: "#94a3b8", fontSize: "0.78rem", lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={!username.trim() || connecting}
                style={{
                  backgroundColor: username.trim() && !connecting ? "#4ade80" : "#1a2535",
                  color: username.trim() && !connecting ? "#0f1a0a" : "#4a6a8a",
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.85rem",
                  fontSize: "0.95rem",
                  fontWeight: "bold",
                  cursor: username.trim() && !connecting ? "pointer" : "not-allowed",
                  width: "100%",
                  marginBottom: "0.75rem",
                  transition: "background-color 0.15s",
                }}
              >
                {connecting ? "Connecting…" : "Connect & Analyze →"}
              </button>

              <div style={{ textAlign: "center" }}>
                <button
                  onClick={handleSkipConnect}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    padding: "0.25rem",
                  }}
                >
                  Skip — train without connecting
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Step 3: You're all set ─────────────────────────────────────────────────
  const goalOpt = GOAL_OPTIONS.find(g => g.value === selectedGoal);
  const startLabel = connected
    ? "your weaknesses"
    : selectedGoal === "structured_plan" ? "Fork"
    : selectedGoal === "find_weaknesses" ? "your weaknesses"
    : selectedGoal === "drill_puzzles" ? "Fork"
    : "Fork";

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {stepIndicator}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎉</div>
          <h2 style={{ color: "#e2e8f0", fontSize: "1.3rem", fontWeight: "bold", margin: "0 0 0.5rem" }}>
            You&apos;re all set!
          </h2>
          {goalOpt && (
            <div style={{
              backgroundColor: "#0d2a1a",
              border: "1px solid #1a4a2a",
              borderRadius: "8px",
              padding: "0.6rem 1rem",
              display: "inline-block",
              marginBottom: "0.75rem",
            }}>
              <span style={{ color: "#4ade80", fontSize: "0.85rem", fontWeight: "bold" }}>
                {goalOpt.icon} Goal: {goalOpt.label}
              </span>
            </div>
          )}

          {connected ? (
            <div style={{ marginBottom: "0" }}>
              <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.65, margin: "0 0 0.75rem" }}>
                Your account is connected and we&apos;re analyzing your games in the background.
                Training is already calibrated to your{" "}
                <strong style={{ color: "#4ade80" }}>{fetchedRating}</strong> rating.
              </p>
              {analysisRunning && (
                <div style={{
                  backgroundColor: "#1a1200",
                  border: "1px solid #4a3000",
                  borderRadius: "8px",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.78rem",
                  color: "#f59e0b",
                  marginBottom: "0.5rem",
                }}>
                  ⏳ Game analysis running in background — your custom queue will be ready shortly
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: "#94a3b8", fontSize: "0.92rem", lineHeight: 1.65, margin: 0 }}>
              We&apos;ve prioritized your pattern queue based on your goal. Start with{" "}
              <strong style={{ color: "#e2e8f0" }}>{startLabel}</strong> — the top pattern for your objective.
            </p>
          )}
        </div>

        <button
          onClick={handleStart}
          style={{
            backgroundColor: "#4ade80",
            color: "#0f1a0a",
            border: "none",
            borderRadius: "10px",
            padding: "1rem",
            fontSize: "1.05rem",
            fontWeight: "bold",
            cursor: "pointer",
            width: "100%",
            marginBottom: "0.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          {connected
            ? "Start training on your weaknesses →"
            : `${goalOpt?.icon ?? "⚔️"} Start ${startLabel} Puzzles →`}
        </button>

        <div style={{ textAlign: "center" }}>
          <button
            onClick={handleExploreOwn}
            style={{
              background: "none",
              border: "none",
              color: "#64748b",
              fontSize: "0.88rem",
              cursor: "pointer",
              textDecoration: "underline",
              padding: "0.25rem",
            }}
          >
            Explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}
