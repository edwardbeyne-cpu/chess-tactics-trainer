import {
  StockfishClient,
  scoreToCentipawns,
  estimateRating,
  pvToSolution,
  type AnalysisSnapshot,
} from '@/lib/stockfish-client';

export interface MissedTacticInput {
  pattern: string;
  fen: string;
  moveNumber: number;
  gameIndex: number;
}

export interface GeneratedCustomPuzzle {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  pattern: string;
  sourceGame: number;
  generatedAt: string;
  sourceType: 'generated';
  evalGap: number;
  bestEval: number | null;
  secondEval: number | null;
  depth: number;
}

interface GenerateOptions {
  onProgress?: (progress: { completed: number; total: number; currentPattern?: string; generated: number; puzzles: GeneratedCustomPuzzle[] }) => void;
  depth?: number;
}

const MIN_EVAL_GAP_CP = 150;
const TARGET_DEPTH = 18;
const MAX_PV_MOVES = 4;

function normalizeTheme(pattern: string): string {
  return pattern.toLowerCase().replace(/\s+/g, '-');
}

function buildGeneratedPuzzle(missed: MissedTacticInput, best: AnalysisSnapshot | undefined, second: AnalysisSnapshot | undefined): GeneratedCustomPuzzle | null {
  if (!best) return null;
  const bestCp = scoreToCentipawns(best);
  const secondCp = scoreToCentipawns(second);
  if (!best.pv.length || bestCp === null) return null;
  const gap = secondCp === null ? Math.abs(bestCp) : Math.abs(bestCp - secondCp);
  if (gap < MIN_EVAL_GAP_CP) return null;

  const moves = pvToSolution(best.pv, MAX_PV_MOVES);
  if (!moves.length) return null;

  return {
    id: `custom-${missed.gameIndex}-${missed.moveNumber}-${moves[0]}`,
    fen: missed.fen,
    moves,
    rating: estimateRating(bestCp, gap, best.depth, moves.length),
    themes: [normalizeTheme(missed.pattern), 'custom-games'],
    pattern: missed.pattern,
    sourceGame: missed.gameIndex,
    generatedAt: new Date().toISOString(),
    sourceType: 'generated',
    evalGap: gap,
    bestEval: bestCp,
    secondEval: secondCp,
    depth: best.depth,
  };
}

/**
 * Build a GeneratedCustomPuzzle directly from an engine-verified missed tactic
 * stored by lib/game-analysis.ts (which already ran Stockfish and kept the PV).
 * No engine work needed — this is instant.
 */
export function buildPuzzleFromVerifiedMiss(
  miss: { pattern: string; fen: string; moveNumber?: number; bestLine?: string[]; evalGap?: number; rating?: number },
  index: number
): GeneratedCustomPuzzle | null {
  if (!miss.bestLine || miss.bestLine.length === 0) return null;
  const moves = pvToSolution(miss.bestLine, MAX_PV_MOVES);
  if (moves.length === 0) return null;
  return {
    id: `custom-${index}-${miss.moveNumber ?? 0}-${moves[0]}`,
    fen: miss.fen,
    moves,
    rating: miss.rating ?? 1500,
    themes: [normalizeTheme(miss.pattern), 'custom-games'],
    pattern: miss.pattern,
    sourceGame: index,
    generatedAt: new Date().toISOString(),
    sourceType: 'generated',
    evalGap: miss.evalGap ?? MIN_EVAL_GAP_CP,
    bestEval: null,
    secondEval: null,
    depth: 0,
  };
}

export async function generateCustomPuzzlesFromMissedTactics(
  missedTactics: MissedTacticInput[],
  options: GenerateOptions = {}
): Promise<GeneratedCustomPuzzle[]> {
  const client = new StockfishClient();
  const generated: GeneratedCustomPuzzle[] = [];
  const total = missedTactics.length;
  const depth = options.depth ?? TARGET_DEPTH;

  try {
    for (let i = 0; i < missedTactics.length; i += 1) {
      const missed = missedTactics[i];
      const snapshots = await client.analyzeFen(missed.fen, depth);
      const puzzle = buildGeneratedPuzzle(missed, snapshots.get(1), snapshots.get(2));
      if (puzzle) generated.push(puzzle);
      options.onProgress?.({
        completed: i + 1,
        total,
        currentPattern: missed.pattern,
        generated: generated.length,
        puzzles: [...generated],
      });
    }
  } finally {
    client.dispose();
  }

  return generated;
}
