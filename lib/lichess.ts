// Lichess Puzzle API integration
import { Chess } from "chess.js";
import { cachedPuzzlesByTheme } from "@/data/lichess-puzzles";

export interface LichessPuzzle {
  id: string;
  fen: string;
  moves: string[]; // UCI moves e.g. ["e2e4", "e7e5"]
  rating: number;
  themes: string[];
  gameUrl: string;
}

interface LichessApiResponse {
  puzzle: {
    id: string;
    rating: number;
    themes: string[];
    gameId: string;
    solution: string[];
  };
  game: {
    pgn: string;
    id: string;
  };
}

// Map our pattern theme names → Lichess angle/theme names
// Lichess themes: https://lichess.org/training/themes
const PATTERN_TO_LICHESS: Record<string, string> = {
  FORK: "fork",
  PIN: "pin",
  SKEWER: "skewer",
  "DISCOVERED ATTACK": "discoveredAttack",
  "DISCOVERED CHECK": "discoveredCheck",
  "BACK RANK MATE": "backRankMate",
  "BACK RANK": "backRankMate",
  "SMOTHERED MATE": "smotheredMate",
  "DOUBLE CHECK": "doubleCheck",
  OVERLOADING: "overloading",
  "OVERLOADED PIECE": "overloading",
  "GREEK GIFT": "bishopSacrifice",
  "GREEK GIFT SACRIFICE": "bishopSacrifice",
  ZWISCHENZUG: "intermezzo",
  "IN-BETWEEN MOVE": "intermezzo",
  DEFLECTION: "deflection",
  DECOY: "attraction",
  LURING: "attraction",
  "X-RAY": "xRayAttack",
  "X-RAY ATTACK": "xRayAttack",
  "REMOVING THE DEFENDER": "clearance",
  UNDERMINING: "clearance",
  INTERFERENCE: "interference",
  "PERPETUAL CHECK": "perpetualCheck",
  PERPETUAL: "perpetualCheck",
  WINDMILL: "skewer",
  ZUGZWANG: "zugzwang",
  "ROOK LIFT": "advancedPawn",
  "QUEEN SACRIFICE": "queenRookEndgame",
  "POSITIONAL SACRIFICE": "sacrifice",
  POSITIONAL: "middlegame",
  "TRAPPED PIECE": "trappedPiece",
  TRAPPED: "trappedPiece",
  FORTRESS: "endgame",
  "KING MARCH": "kingsideAttack",
  "KING ACTIVITY": "kingsideAttack",
  "ABSOLUTE PIN": "pin",
  "RELATIVE PIN": "pin",
};

function mapThemeToLichess(theme: string): string {
  const upper = theme.toUpperCase();
  return PATTERN_TO_LICHESS[upper] ?? "middlegame";
}

function parseLichessResponse(data: LichessApiResponse): LichessPuzzle {
  return {
    id: data.puzzle.id,
    // Lichess sends FEN before puzzle starts (it's opponent's last move position)
    // We keep it as-is since the puzzle FEN is included
    fen: data.game.pgn, // Not actually FEN — we'll handle this below
    moves: data.puzzle.solution,
    rating: data.puzzle.rating,
    themes: data.puzzle.themes,
    gameUrl: `https://lichess.org/training/${data.puzzle.id}`,
  };
}

// Lichess API response shape
interface LichessApiPuzzleResponse {
  puzzle: {
    id: string;
    rating: number;
    themes: string[];
    solution: string[];
    initialPly: number;
    plays: number;
  };
  game: {
    id: string;
    pgn: string;
  };
}

/**
 * Reconstruct FEN from PGN by replaying initialPly half-moves.
 * The puzzle starts AFTER the opponent's last move (initialPly).
 */
function fenFromPgn(pgn: string, initialPly: number): string {
  const chess = new Chess();
  // Strip move numbers, comments, and result tokens
  const tokens = pgn
    .replace(/\d+\.{1,3}/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim()
    .split(/\s+/)
    .filter((t: string) => t && !t.match(/^(\*|1-0|0-1|1\/2-1\/2)$/));

  // Replay up to initialPly half-moves
  let played = 0;
  for (const token of tokens) {
    if (played >= initialPly) break;
    try {
      const result = chess.move(token);
      if (result) played++;
    } catch {
      // Skip unparseable tokens
    }
  }
  return chess.fen();
}

function parseLichessPuzzleResponse(
  data: LichessApiPuzzleResponse
): LichessPuzzle {
  const fen = fenFromPgn(data.game.pgn, data.puzzle.initialPly);
  return {
    id: data.puzzle.id,
    fen,
    moves: data.puzzle.solution,
    rating: data.puzzle.rating,
    themes: data.puzzle.themes,
    gameUrl: `https://lichess.org/training/${data.puzzle.id}`,
  };
}

// In-memory puzzle cache: theme → queue of puzzles
const puzzleCache: Record<string, LichessPuzzle[]> = {};
const CACHE_SIZE = 5; // prefetch 5 puzzles per theme
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL = 1000; // 1 second between Lichess API calls

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = MIN_FETCH_INTERVAL - (now - lastFetchTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastFetchTime = Date.now();
  return fetch(url, { headers: { Accept: "application/json" } });
}

async function prefetchForTheme(lichessTheme: string): Promise<void> {
  const url = `https://lichess.org/api/puzzle/next?angle=${lichessTheme}`;
  try {
    const response = await throttledFetch(url);
    if (!response.ok) return;
    const data: LichessApiPuzzleResponse = await response.json();
    const puzzle = parseLichessPuzzleResponse(data);
    if (!puzzleCache[lichessTheme]) puzzleCache[lichessTheme] = [];
    if (puzzleCache[lichessTheme].length < CACHE_SIZE) {
      puzzleCache[lichessTheme].push(puzzle);
    }
  } catch {
    // Silently fail prefetch
  }
}

/**
 * Fetch a puzzle from Lichess by theme.
 * Uses bundled local puzzle database first (avoids rate limiting),
 * falls back to live Lichess API if local cache is empty.
 */
export async function fetchPuzzleByTheme(theme: string): Promise<LichessPuzzle> {
  const lichessTheme = mapThemeToLichess(theme);

  // ── Local cache first (bundled puzzles — no API call needed) ────────────
  const localPuzzles = cachedPuzzlesByTheme[lichessTheme];
  if (localPuzzles && localPuzzles.length > 0) {
    const puzzle = localPuzzles[Math.floor(Math.random() * localPuzzles.length)];
    return {
      id: puzzle.id,
      fen: puzzle.fen,
      moves: puzzle.moves,
      rating: puzzle.rating,
      themes: puzzle.themes,
      gameUrl: `https://lichess.org/training/${puzzle.id}`,
    };
  }

  // ── In-memory API cache second ───────────────────────────────────────────
  if (puzzleCache[lichessTheme] && puzzleCache[lichessTheme].length > 0) {
    const puzzle = puzzleCache[lichessTheme].shift()!;
    // Prefetch replacement in background
    prefetchForTheme(lichessTheme);
    return puzzle;
  }

  // ── Live Lichess API fallback (throttled) ────────────────────────────────
  const url = `https://lichess.org/api/puzzle/next?angle=${lichessTheme}`;
  const response = await throttledFetch(url);

  if (!response.ok) {
    throw new Error(`Lichess API error: ${response.status}`);
  }

  const data: LichessApiPuzzleResponse = await response.json();
  const puzzle = parseLichessPuzzleResponse(data);

  // Start prefetching next puzzles for this theme
  for (let i = 0; i < 2; i++) prefetchForTheme(lichessTheme);

  return puzzle;
}

/**
 * Fetch a random puzzle from Lichess (no theme filter).
 */
export async function fetchRandomPuzzle(): Promise<LichessPuzzle> {
  const url = `https://lichess.org/api/puzzle/next`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Lichess API error: ${response.status} ${response.statusText}`
    );
  }

  const data: LichessApiPuzzleResponse = await response.json();
  return parseLichessPuzzleResponse(data);
}

/**
 * Fetch a specific puzzle by ID from Lichess.
 */
export async function fetchPuzzleById(id: string): Promise<LichessPuzzle> {
  const url = `https://lichess.org/api/puzzle/${id}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Lichess API error: ${response.status} ${response.statusText}`
    );
  }

  const data: LichessApiPuzzleResponse = await response.json();
  return parseLichessPuzzleResponse(data);
}

// ── Adapter: LichessPuzzle → App Puzzle format ─────────────────────────────

export interface AppPuzzle {
  id: string; // Lichess puzzle ID (string)
  title: string;
  theme: string;
  patternTier: number;
  difficulty: string;
  description: string;
  fen: string;
  solution: string[]; // UCI format strings
  hint: string;
  source: "lichess";
  rating: number;
  gameUrl: string;
}

/**
 * Apply the first UCI move to get to the actual puzzle position.
 * Lichess puzzles store the FEN one move before the puzzle starts.
 * The first move in `moves` is the opponent's move — apply it to get
 * the real puzzle FEN where the player needs to find the solution.
 */
function applyFirstMove(fen: string, moves: string[]): { fen: string; solution: string[] } {
  if (!moves || moves.length < 2) return { fen, solution: moves };
  try {
    const chess = new Chess(fen);
    const opponentMove = moves[0];
    // UCI format: "e2e4" or "e7e8q" (promotion)
    const from = opponentMove.slice(0, 2);
    const to = opponentMove.slice(2, 4);
    const promotion = opponentMove.length === 5 ? opponentMove[4] : undefined;
    chess.move({ from, to, promotion });
    return { fen: chess.fen(), solution: moves.slice(1) };
  } catch {
    return { fen, solution: moves };
  }
}

export function lichessPuzzleToApp(
  lichess: LichessPuzzle,
  patternName: string,
  patternTier: number
): AppPuzzle {
  const difficulty =
    lichess.rating < 1200
      ? "easy"
      : lichess.rating < 1800
      ? "medium"
      : "hard";

  const themeName = patternName || lichess.themes[0] || "Tactic";

  // Apply opponent's first move to get the actual puzzle start position
  const { fen, solution } = applyFirstMove(lichess.fen, lichess.moves);

  return {
    id: lichess.id,
    title: `${themeName} — Lichess ${lichess.id}`,
    theme: patternName.toUpperCase(),
    patternTier,
    difficulty,
    description: `Find the best move!`,
    fen,
    solution,
    hint: `Theme: ${lichess.themes.slice(0, 2).join(", ")}`,
    source: "lichess" as const,
    rating: lichess.rating,
    gameUrl: lichess.gameUrl,
  };
}
