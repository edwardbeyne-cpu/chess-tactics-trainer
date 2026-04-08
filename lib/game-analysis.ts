// lib/game-analysis.ts
// Shared connected-account game analysis for Training Plan coaching output

import { Chess } from "chess.js";

type Platform = "chesscom" | "lichess";
type GameResult = { pgn: string; playerColor: string };

export interface PatternSummary {
  pattern: string;
  count: number;
  share: number;
}

export interface StoredGameAnalysis {
  missedTactics: Array<{ pattern: string; fen: string; moveNumber?: number }>;
  strengths: PatternSummary[];
  weaknesses: PatternSummary[];
  recommendation: string;
  platform: Platform;
  username: string;
  analyzedAt: string;
  gameCount: number;
}

const CANONICAL_PATTERN_LABELS: Record<string, string> = {
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  check: "Checks",
  "winning capture": "Winning Captures",
  exchange: "Exchanges",
  "discovered attack": "Discovered Attacks",
  "back rank mate": "Back Rank Mates",
};

function normalizePatternLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  return CANONICAL_PATTERN_LABELS[key] ?? raw
    .split(" ")
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
    .join(" ");
}

function parsePgnMoves(pgn: string): string[] {
  const cleaned = pgn
    .replace(/\{[^}]*\}/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\$\d+/g, "")
    .replace(/\d+\.{1,3}/g, "")
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, "")
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const uci: string[] = [];
  const c = new Chess();
  for (const tok of tokens) {
    try {
      const m = c.move(tok);
      if (m) uci.push(m.from + m.to + (m.promotion ?? ""));
    } catch {
      break;
    }
  }
  return uci;
}

function detectMissedTacticSimple(fen: string): string | null {
  try {
    const c = new Chess(fen);
    const moves = c.moves({ verbose: true });

    for (const m of moves) {
      const clone = new Chess(fen);
      clone.move(m);
      const responses = clone.moves({ verbose: true });

      const captures = responses.filter((x) => x.captured);
      if (captures.length >= 2) return "fork";

      if (m.captured) {
        const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
        const capturedVal = pieceValues[m.captured] ?? 0;
        const attackerVal = pieceValues[m.piece] ?? 0;
        if (capturedVal > attackerVal) return "winning capture";
        if (capturedVal === attackerVal && capturedVal > 0) return "exchange";
      }

      if (clone.inCheck()) {
        if (m.captured) return "discovered attack";
        return "check";
      }
    }

    const pinCandidates = moves.filter((m) => {
      const clone = new Chess(fen);
      try {
        clone.move(m);
      } catch {
        return false;
      }
      return clone.inCheck();
    });
    if (pinCandidates.length > 0) return "pin";
  } catch {
    // ignore malformed positions
  }
  return null;
}

function analyzeGamesForQueue(games: GameResult[]): Array<{ pattern: string; fen: string; moveNumber?: number }> {
  const results: Array<{ pattern: string; fen: string; moveNumber?: number }> = [];
  for (const { pgn, playerColor } of games) {
    const moves = parsePgnMoves(pgn);
    const isWhite = playerColor.toLowerCase().startsWith("w");
    const c = new Chess();
    let moveNum = 0;
    for (const uci of moves) {
      moveNum++;
      const fen = c.fen();
      try {
        c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : undefined });
      } catch {
        break;
      }
      if (moveNum > 1) {
        const wasPlayerTurn = isWhite ? fen.split(" ")[1] === "w" : fen.split(" ")[1] === "b";
        if (wasPlayerTurn) {
          const pattern = detectMissedTacticSimple(fen);
          if (pattern) results.push({ pattern: normalizePatternLabel(pattern), fen, moveNumber: moveNum });
        }
      }
    }
  }
  return results.slice(0, 150);
}

function buildPatternSummaries(missed: Array<{ pattern: string; fen: string; moveNumber?: number }>): {
  strengths: PatternSummary[];
  weaknesses: PatternSummary[];
  recommendation: string;
} {
  const counts: Record<string, number> = {};
  for (const item of missed) counts[item.pattern] = (counts[item.pattern] || 0) + 1;

  const total = missed.length || 1;
  const ranked = Object.entries(counts)
    .map(([pattern, count]) => ({ pattern, count, share: count / total }))
    .sort((a, b) => b.count - a.count);

  const weaknesses = ranked.slice(0, 3);
  const allPatterns = ["Fork", "Pin", "Skewer", "Checks", "Winning Captures", "Discovered Attacks", "Back Rank Mates"];
  const weakSet = new Set(weaknesses.map((x) => x.pattern.toLowerCase()));
  const strengths = allPatterns
    .filter((p) => !weakSet.has(p.toLowerCase()))
    .slice(0, 3)
    .map((pattern) => ({ pattern, count: 0, share: 0 }));

  const recommendation = weaknesses.length > 0
    ? `Focus on ${weaknesses[0].pattern} (${Math.round(weaknesses[0].share * 100)}% of missed tactics). Master this pattern to eliminate your biggest tactical blind spot.`
    : "Connect more games or train a few patterns to unlock personalized coaching recommendations.";

  return { strengths, weaknesses, recommendation };
}

export async function fetchRecentGames(username: string, platform: Platform = "chesscom"): Promise<GameResult[]> {
  if (platform === "chesscom") {
    const archivesRes = await fetch(
      `https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`,
      { headers: { "User-Agent": "ChessTacticsTrainer/1.0" } }
    );
    if (!archivesRes.ok) return [];
    const { archives } = await archivesRes.json() as { archives: string[] };
    if (!archives?.length) return [];
    const reversed = [...archives].reverse();
    const allGames: GameResult[] = [];
    for (const archive of reversed) {
      if (allGames.length >= 50) break;
      const res = await fetch(archive, { headers: { "User-Agent": "ChessTacticsTrainer/1.0" } });
      if (!res.ok) continue;
      const { games } = await res.json() as { games: Array<{ pgn: string; white: { username: string }; black: { username: string } }> };
      if (!games?.length) continue;
      for (const g of [...games].reverse()) {
        allGames.push({
          pgn: g.pgn,
          playerColor: g.white.username.toLowerCase() === username.toLowerCase() ? "white" : "black",
        });
        if (allGames.length >= 50) break;
      }
    }
    return allGames;
  }

  const res = await fetch(
    `https://lichess.org/api/games/user/${username}?max=50&pgnInJson=true&clocks=false&evals=false&opening=false`,
    { headers: { Accept: "application/x-ndjson" } }
  );
  if (!res.ok) return [];
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const game = JSON.parse(line);
        const pgn = game.pgn || "";
        const whiteName = game.players?.white?.user?.name?.toLowerCase() || "";
        return {
          pgn,
          playerColor: whiteName === username.toLowerCase() ? "white" : "black",
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is GameResult => x !== null && Boolean(x.pgn));
}

export async function runGameAnalysis(username: string, platform: Platform = "chesscom"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const games = await fetchRecentGames(username, platform);
    if (games.length === 0) return false;

    const missed = analyzeGamesForQueue(games);
    const { strengths, weaknesses, recommendation } = buildPatternSummaries(missed);

    const payload: StoredGameAnalysis = {
      missedTactics: missed,
      strengths,
      weaknesses,
      recommendation,
      platform,
      username,
      analyzedAt: new Date().toISOString(),
      gameCount: games.length,
    };

    localStorage.setItem("ctt_custom_analysis", JSON.stringify(payload));
    localStorage.setItem("ctt_game_analysis", JSON.stringify(payload));
    localStorage.setItem("ctt_custom_platform", platform);
    localStorage.setItem("ctt_custom_username", username);

    if (missed.length > 0) {
      const queue = missed.slice(0, 50).map((m, i) => ({
        id: `custom_${i}`,
        fen: m.fen,
        theme: m.pattern,
        source: `${platform}:${username}`,
      }));
      localStorage.setItem("ctt_custom_queue", JSON.stringify(queue));
    }

    return true;
  } catch {
    return false;
  }
}
