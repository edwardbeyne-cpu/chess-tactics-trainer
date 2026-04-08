// lib/game-analysis.ts
// Shared connected-account game analysis for Training Plan coaching output

import { Chess, type Square } from "chess.js";

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

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// Count how many opponent pieces the piece at `square` can capture in the given FEN.
// Uses side-flip trick: temporarily switches the active color so we can query
// the piece's attacks from its current owner's perspective.
function countPieceAttacks(fen: string, square: string): number {
  try {
    const parts = fen.split(" ");
    // Flip active side so the piece at `square` belongs to the side to move
    parts[1] = parts[1] === "w" ? "b" : "w";
    parts[2] = "-"; // clear castling rights to avoid illegal-state errors
    parts[3] = "-"; // clear en passant
    const flippedFen = parts.join(" ");
    const c = new Chess(flippedFen);
    return c.moves({ square: square as Square, verbose: true }).filter((m) => m.captured).length;
  } catch {
    return 0;
  }
}

// chess.js board(): board[0] = rank 8, board[7] = rank 1; file 0 = a, file 7 = h
function boardPieceAt(
  board: ReturnType<Chess["board"]>,
  file: number,
  rank: number
) {
  return board[7 - rank]?.[file] ?? null;
}

// Detect whether a pin opportunity exists in this position.
// A pin is when one of our sliding pieces (bishop/rook/queen) is on a ray that
// passes through exactly one opponent piece before hitting the opponent's king.
function hasPinOpportunity(fen: string): boolean {
  try {
    const c = new Chess(fen);
    const board = c.board();
    const sideToMove = fen.split(" ")[1] as "w" | "b";
    const opponentColor = sideToMove === "w" ? "b" : "w";

    // Find the opponent king
    let kingFile = -1;
    let kingRank = -1;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = boardPieceAt(board, f, r);
        if (p && p.type === "k" && p.color === opponentColor) {
          kingFile = f;
          kingRank = r;
        }
      }
    }
    if (kingFile === -1) return false;

    // Walk each of the 8 rays outward from the king
    const rays: [number, number][] = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    for (const [df, dr] of rays) {
      const isDiagonal = df !== 0 && dr !== 0;
      let f = kingFile + df;
      let r = kingRank + dr;
      let opponentPiecesOnRay = 0;

      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = boardPieceAt(board, f, r);
        if (p) {
          if (p.color === opponentColor) {
            opponentPiecesOnRay++;
            if (opponentPiecesOnRay > 1) break; // two opponent pieces: no pin
          } else {
            // Our piece — check if it can pin
            if (opponentPiecesOnRay === 1) {
              const canPin = isDiagonal
                ? p.type === "b" || p.type === "q"
                : p.type === "r" || p.type === "q";
              if (canPin) return true;
            }
            break;
          }
        }
        f += df;
        r += dr;
      }
    }
  } catch { /* ignore */ }
  return false;
}

// Detect whether a skewer opportunity exists in this position.
// A skewer is when our sliding piece attacks a high-value opponent piece (rook/queen/king)
// with another opponent piece behind it on the same ray.
function hasSkewerOpportunity(fen: string): boolean {
  try {
    const c = new Chess(fen);
    const board = c.board();
    const moves = c.moves({ verbose: true });

    for (const m of moves) {
      if (!["b", "r", "q"].includes(m.piece)) continue;
      if (!m.captured) continue;
      const capturedVal = PIECE_VALUES[m.captured] ?? 0;
      if (capturedVal < 5) continue; // skewer targets rook, queen, or king

      const toFile = m.to.charCodeAt(0) - "a".charCodeAt(0);
      const toRank = parseInt(m.to[1]) - 1;
      const fromFile = m.from.charCodeAt(0) - "a".charCodeAt(0);
      const fromRank = parseInt(m.from[1]) - 1;
      const stepFile = Math.sign(toFile - fromFile);
      const stepRank = Math.sign(toRank - fromRank);

      // Look beyond the captured piece along the same ray
      let f = toFile + stepFile;
      let r = toRank + stepRank;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = boardPieceAt(board, f, r);
        if (p) {
          if (p.color !== m.color) return true; // opponent piece behind: skewer!
          break; // our own piece blocks
        }
        f += stepFile;
        r += stepRank;
      }
    }
  } catch { /* ignore */ }
  return false;
}

// Detect whether a back-rank mate threat exists: we can move a rook or queen to
// the opponent's back rank to deliver check or checkmate.
function hasBackRankThreat(fen: string): boolean {
  try {
    const c = new Chess(fen);
    const moves = c.moves({ verbose: true });
    const sideToMove = fen.split(" ")[1] as "w" | "b";
    const backRank = sideToMove === "w" ? "8" : "1";
    for (const m of moves) {
      if (m.piece !== "r" && m.piece !== "q") continue;
      if (m.to[1] !== backRank) continue;
      const clone = new Chess(fen);
      clone.move(m);
      if (clone.isCheckmate() || clone.inCheck()) return true;
    }
  } catch { /* ignore */ }
  return false;
}

// Priority order for labeling the best available tactic
const TACTIC_PRIORITY = [
  "checkmate",
  "fork",
  "discovered attack",
  "winning capture",
  "pin",
  "skewer",
  "back rank mate",
  "check",
  "exchange",
] as const;

type TacticLabel = (typeof TACTIC_PRIORITY)[number];

// Scan a position for available tactics and return them bucketed by label.
function findAvailableTactics(fen: string): Map<TacticLabel, string[]> {
  const found = new Map<TacticLabel, string[]>();

  const addMove = (label: TacticLabel, uci: string) => {
    const arr = found.get(label) ?? [];
    arr.push(uci);
    found.set(label, arr);
  };

  try {
    const c = new Chess(fen);
    const moves = c.moves({ verbose: true });

    for (const m of moves) {
      const clone = new Chess(fen);
      clone.move(m);
      const moveUci = m.from + m.to + (m.promotion ?? "");

      // Checkmate
      if (clone.isCheckmate()) {
        addMove("checkmate", moveUci);
        continue;
      }

      // Fork: after move, our piece at m.to attacks 2+ opponent pieces
      const threats = countPieceAttacks(clone.fen(), m.to);
      if (threats >= 2) {
        addMove("fork", moveUci);
      }

      // Check-based tactics
      if (clone.inCheck()) {
        if (m.captured) {
          addMove("discovered attack", moveUci);
        } else {
          addMove("check", moveUci);
        }
      }

      // Material-based tactics
      if (m.captured) {
        const capturedVal = PIECE_VALUES[m.captured] ?? 0;
        const attackerVal = PIECE_VALUES[m.piece] ?? 0;
        if (capturedVal > attackerVal) {
          addMove("winning capture", moveUci);
        } else if (capturedVal === attackerVal && capturedVal >= 3) {
          addMove("exchange", moveUci);
        }
      }
    }

    // Geometric patterns (not tied to a specific move UCI)
    if (hasPinOpportunity(fen)) addMove("pin", "geometric");
    if (hasSkewerOpportunity(fen)) addMove("skewer", "geometric");
    if (hasBackRankThreat(fen)) addMove("back rank mate", "geometric");
  } catch { /* ignore malformed positions */ }

  return found;
}

// Detect the best tactic available in a position.
// If `actualPlayerMove` is provided, only returns the tactic label if the player
// did NOT execute any of the available tactics — i.e., the tactic was missed.
function detectMissedTactic(fen: string, actualPlayerMove?: string): TacticLabel | null {
  const tactics = findAvailableTactics(fen);
  if (tactics.size === 0) return null;

  const bestTactic = TACTIC_PRIORITY.find((t) => tactics.has(t)) ?? null;
  if (!bestTactic) return null;

  // If we know the player's actual move, check whether they executed any tactic
  if (actualPlayerMove) {
    const normalize = (u: string) => u.replace(/undefined$/, "").toLowerCase();
    const playerNorm = normalize(actualPlayerMove);

    for (const ucis of tactics.values()) {
      if (ucis.some((u) => normalize(u) === playerNorm)) {
        return null; // Player executed a tactic — not missed
      }
    }
  }

  return bestTactic;
}

function analyzeGamesForQueue(
  games: GameResult[]
): Array<{ pattern: string; fen: string; moveNumber?: number }> {
  const results: Array<{ pattern: string; fen: string; moveNumber?: number }> = [];

  for (const { pgn, playerColor } of games) {
    const moves = parsePgnMoves(pgn);
    const isWhite = playerColor.toLowerCase().startsWith("w");
    const c = new Chess();
    let moveNum = 0;

    for (let i = 0; i < moves.length; i++) {
      const uci = moves[i];
      moveNum++;
      const fen = c.fen();

      try {
        c.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length === 5 ? uci[4] : undefined,
        });
      } catch {
        break;
      }

      if (moveNum > 1) {
        const wasPlayerTurn = isWhite
          ? fen.split(" ")[1] === "w"
          : fen.split(" ")[1] === "b";

        if (wasPlayerTurn) {
          // Pass the actual move played so we only flag genuinely missed tactics
          const pattern = detectMissedTactic(fen, uci);
          if (pattern) {
            results.push({
              pattern: normalizePatternLabel(pattern),
              fen,
              moveNumber: moveNum,
            });
          }
        }
      }
    }
  }

  return results.slice(0, 150);
}

function buildPatternSummaries(
  missed: Array<{ pattern: string; fen: string; moveNumber?: number }>
): {
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
  const weakSet = new Set(weaknesses.map((x) => x.pattern));

  // Strengths: canonical patterns that are NOT in the weakness list
  const allPatterns = [
    "Fork",
    "Pin",
    "Skewer",
    "Checks",
    "Winning Captures",
    "Discovered Attacks",
    "Back Rank Mates",
  ];
  const strengths = allPatterns
    .filter((p) => !weakSet.has(p))
    .slice(0, 3)
    .map((pattern) => ({ pattern, count: 0, share: 0 }));

  const recommendation =
    weaknesses.length > 0
      ? `Focus on ${weaknesses[0].pattern} (${Math.round(weaknesses[0].share * 100)}% of missed tactics). Master this pattern to eliminate your biggest tactical blind spot.`
      : "Connect more games or train a few patterns to unlock personalized coaching recommendations.";

  return { strengths, weaknesses, recommendation };
}

export async function fetchRecentGames(
  username: string,
  platform: Platform = "chesscom"
): Promise<GameResult[]> {
  if (platform === "chesscom") {
    const archivesRes = await fetch(
      `https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`,
      { headers: { "User-Agent": "ChessTacticsTrainer/1.0" } }
    );
    if (!archivesRes.ok) return [];
    const { archives } = (await archivesRes.json()) as { archives: string[] };
    if (!archives?.length) return [];

    const reversed = [...archives].reverse();
    const allGames: GameResult[] = [];

    for (const archive of reversed) {
      if (allGames.length >= 50) break;
      const res = await fetch(archive, {
        headers: { "User-Agent": "ChessTacticsTrainer/1.0" },
      });
      if (!res.ok) continue;
      const { games } = (await res.json()) as {
        games: Array<{
          pgn: string;
          white: { username: string };
          black: { username: string };
        }>;
      };
      if (!games?.length) continue;

      for (const g of [...games].reverse()) {
        if (!g.pgn) continue;
        allGames.push({
          pgn: g.pgn,
          playerColor:
            g.white.username.toLowerCase() === username.toLowerCase()
              ? "white"
              : "black",
        });
        if (allGames.length >= 50) break;
      }
    }

    return allGames;
  }

  // Lichess
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
        const whiteName =
          game.players?.white?.user?.name?.toLowerCase() || "";
        return {
          pgn,
          playerColor:
            whiteName === username.toLowerCase() ? "white" : "black",
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is GameResult => x !== null && Boolean(x.pgn));
}

export async function runGameAnalysis(
  username: string,
  platform: Platform = "chesscom"
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const games = await fetchRecentGames(username, platform);
    if (games.length === 0) return false;

    const missed = analyzeGamesForQueue(games);
    const { strengths, weaknesses, recommendation } =
      buildPatternSummaries(missed);

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
