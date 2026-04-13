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

interface AnalysisSnapshot {
  depth: number;
  multipv: number;
  score: number | null;
  mate: number | null;
  pv: string[];
}

interface GenerateOptions {
  onProgress?: (progress: { completed: number; total: number; currentPattern?: string; generated: number; puzzles: GeneratedCustomPuzzle[] }) => void;
  depth?: number;
}

const STOCKFISH_PUBLIC_PATH = '/stockfish/stockfish-18-lite-single.js';
const MIN_EVAL_GAP_CP = 150;
const TARGET_DEPTH = 18;
const MAX_PV_MOVES = 4;

function scoreToCentipawns(snapshot: AnalysisSnapshot | undefined): number | null {
  if (!snapshot) return null;
  if (typeof snapshot.mate === 'number') {
    const sign = snapshot.mate > 0 ? 1 : -1;
    return sign * (100000 - Math.min(Math.abs(snapshot.mate), 1000));
  }
  return snapshot.score;
}

function estimateRating(best: number | null, gap: number, depth: number, moveCount: number): number {
  const bestMagnitude = Math.min(Math.abs(best ?? 0), 600);
  const depthBonus = Math.max(0, depth - 12) * 18;
  const gapBonus = Math.min(300, Math.round(gap / 8));
  const moveBonus = Math.max(0, moveCount - 2) * 35;
  const rating = 1350 + Math.round(bestMagnitude / 12) + depthBonus + gapBonus + moveBonus;
  return Math.max(900, Math.min(2800, rating));
}

function normalizeTheme(pattern: string): string {
  return pattern.toLowerCase().replace(/\s+/g, '-');
}

function parseInfoLine(line: string): AnalysisSnapshot | null {
  if (!line.startsWith('info ')) return null;
  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
  const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
  const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);
  if (!depthMatch || !multipvMatch || !pvMatch) return null;

  return {
    depth: Number(depthMatch[1]),
    multipv: Number(multipvMatch[1]),
    score: cpMatch ? Number(cpMatch[1]) : null,
    mate: mateMatch ? Number(mateMatch[1]) : null,
    pv: pvMatch[1].trim().split(/\s+/).filter(Boolean),
  };
}

class StockfishClient {
  private worker: Worker | null = null;
  private ready = false;
  private pendingResolve: ((value: Map<number, AnalysisSnapshot>) => void) | null = null;
  private pendingReject: ((reason?: unknown) => void) | null = null;
  private currentSnapshots = new Map<number, AnalysisSnapshot>();
  private lastReadyTimer: number | null = null;

  async init() {
    if (this.worker) return;
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      throw new Error('Stockfish requires a browser with Web Worker support.');
    }

    this.worker = new Worker(STOCKFISH_PUBLIC_PATH);
    this.worker.onmessage = (event: MessageEvent<string>) => {
      const line = String(event.data || '').trim();
      if (!line) return;
      if (line === 'uciok') {
        this.worker?.postMessage('isready');
        return;
      }
      if (line === 'readyok') {
        this.ready = true;
        if (this.lastReadyTimer) {
          window.clearTimeout(this.lastReadyTimer);
          this.lastReadyTimer = null;
        }
        return;
      }
      const info = parseInfoLine(line);
      if (info && info.depth >= 8 && info.pv.length) {
        const existing = this.currentSnapshots.get(info.multipv);
        if (!existing || info.depth >= existing.depth) {
          this.currentSnapshots.set(info.multipv, info);
        }
      }
      if (line.startsWith('bestmove')) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingReject = null;
        const snapshots = new Map(this.currentSnapshots);
        this.currentSnapshots.clear();
        resolve?.(snapshots);
      }
    };
    this.worker.onerror = (event) => {
      const reject = this.pendingReject;
      this.pendingResolve = null;
      this.pendingReject = null;
      reject?.(event.message || 'Stockfish worker failed');
    };

    this.worker.postMessage('uci');
    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (this.ready) {
          resolve();
          return;
        }
        if (Date.now() - started > 15000) {
          reject(new Error('Stockfish failed to initialize.'));
          return;
        }
        this.lastReadyTimer = window.setTimeout(tick, 50);
      };
      tick();
    });

    this.worker.postMessage('setoption name Threads value 1');
    this.worker.postMessage('setoption name Hash value 16');
  }

  async analyzeFen(fen: string, depth = TARGET_DEPTH): Promise<Map<number, AnalysisSnapshot>> {
    await this.init();
    if (!this.worker) throw new Error('Stockfish worker unavailable');
    this.currentSnapshots.clear();
    this.worker.postMessage('ucinewgame');
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage('setoption name MultiPV value 2');

    return new Promise<Map<number, AnalysisSnapshot>>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.worker?.postMessage(`go depth ${depth}`);
      window.setTimeout(() => {
        if (this.pendingReject === reject) {
          this.worker?.postMessage('stop');
        }
      }, 20000);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.pendingResolve = null;
    this.pendingReject = null;
    this.currentSnapshots.clear();
  }
}

function buildGeneratedPuzzle(missed: MissedTacticInput, best: AnalysisSnapshot | undefined, second: AnalysisSnapshot | undefined): GeneratedCustomPuzzle | null {
  if (!best) return null;
  const bestCp = scoreToCentipawns(best);
  const secondCp = scoreToCentipawns(second);
  if (!best.pv.length || bestCp === null) return null;
  const gap = secondCp === null ? Math.abs(bestCp) : Math.abs(bestCp - secondCp);
  if (gap < MIN_EVAL_GAP_CP) return null;

  const moves = best.pv.slice(0, MAX_PV_MOVES);
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
