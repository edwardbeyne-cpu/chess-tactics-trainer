// Lichess Puzzle API integration

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

// Lichess API actually returns: { puzzle: { id, fen, solution, ... } }
// Let's look at the real shape
interface LichessApiPuzzleResponse {
  puzzle: {
    id: string;
    fen: string;
    rating: number;
    themes: string[];
    solution: string[];
    initialPly: number;
    plays: number;
  };
  game?: {
    id: string;
    pgn: string;
  };
}

function parseLichessPuzzleResponse(
  data: LichessApiPuzzleResponse
): LichessPuzzle {
  return {
    id: data.puzzle.id,
    fen: data.puzzle.fen,
    moves: data.puzzle.solution,
    rating: data.puzzle.rating,
    themes: data.puzzle.themes,
    gameUrl: `https://lichess.org/training/${data.puzzle.id}`,
  };
}

/**
 * Fetch a puzzle from Lichess by theme.
 * Uses the public /api/puzzle/next?angle={theme} endpoint (no auth required).
 */
export async function fetchPuzzleByTheme(theme: string): Promise<LichessPuzzle> {
  const lichessTheme = mapThemeToLichess(theme);
  const url = `https://lichess.org/api/puzzle/next?angle=${lichessTheme}`;

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

  return {
    id: lichess.id,
    title: `${themeName} — Lichess ${lichess.id}`,
    theme: patternName.toUpperCase(),
    patternTier,
    difficulty,
    description: `Find the best move! Rating: ${lichess.rating}`,
    fen: lichess.fen,
    solution: lichess.moves,
    hint: `Theme: ${lichess.themes.slice(0, 2).join(", ")}`,
    source: "lichess" as const,
    rating: lichess.rating,
    gameUrl: lichess.gameUrl,
  };
}
