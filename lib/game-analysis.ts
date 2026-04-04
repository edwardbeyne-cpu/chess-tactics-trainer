// lib/game-analysis.ts
// Shared game analysis that runs when Chess.com connects from any screen

import { Chess } from "chess.js";

type Platform = "chesscom" | "lichess";
type GameResult = { pgn: string; playerColor: string };

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
  try {
    const c = new Chess(fen);
    const moves = c.moves({ verbose: true });

    for (const m of moves) {
      const clone = new Chess(fen);
      clone.move(m);
      const responses = clone.moves({ verbose: true });

      // Fork: a single piece attacks 2+ opponent pieces after moving
      const attacks = responses.filter(x => x.captured);
      if (attacks.length >= 2) return "fork";

      // Capture available (missed tactic opportunity)
      if (m.captured) {
        // Check if it's a winning capture (captures higher value piece)
        const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
        const capturedVal = pieceValues[m.captured] ?? 0;
        const attackerVal = pieceValues[m.piece] ?? 0;
        if (capturedVal > attackerVal) return "winning capture";
        if (capturedVal === attackerVal) return "exchange";
      }

      // Check if move gives check
      if (clone.inCheck()) {
        // Is it also capturing? Discovered attack
        if (m.captured) return "discovered attack";
        return "check";
      }

      // Back rank weakness: king on back rank with no escape
      const oppKingPos = responses.find(r => r.piece === "k");
      if (!oppKingPos && clone.inCheck()) return "back rank mate";
    }

    // Pin: a piece is pinned (can't move without exposing king)
    const pinCandidates = moves.filter(m => {
      const clone = new Chess(fen);
      try { clone.move(m); } catch { return false; }
      return clone.inCheck();
    });
    if (pinCandidates.length > 0) return "pin";

  } catch { /* skip */ }
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
      } catch { break; }
      if (moveNum > 1) {
        // Check if it was player's previous position
        const wasPlayerTurn = isWhite ? fen.split(" ")[1] === "w" : fen.split(" ")[1] === "b";
        if (wasPlayerTurn) {
          const pattern = detectMissedTacticSimple(fen);
          if (pattern) results.push({ pattern, fen, moveNumber: moveNum });
        }
      }
    }
  }
  return results.slice(0, 50);
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
  } else {
    const res = await fetch(
      `https://lichess.org/api/games/user/${username}?max=50&moves=true&pgnInJson=false`,
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
    }).filter((x): x is GameResult => x !== null);
  }
}

export async function runGameAnalysis(username: string, platform: Platform = "chesscom"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const games = await fetchRecentGames(username, platform);
    if (games.length === 0) return false;

    const missed = analyzeGamesForQueue(games);

    localStorage.setItem("ctt_custom_analysis", JSON.stringify({
      missedTactics: missed,
      platform,
      username,
      analyzedAt: new Date().toISOString(),
      gameCount: games.length,
    }));
    localStorage.setItem("ctt_custom_platform", platform);
    localStorage.setItem("ctt_custom_username", username);

    if (missed.length > 0) {
      const queue = missed.map((m, i) => ({
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
