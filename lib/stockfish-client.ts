// Shared Stockfish WASM client.
// Used by lib/game-analysis.ts (miss verification) and
// lib/custom-puzzle-generator.ts (puzzle building) so both run the same engine.

export interface AnalysisSnapshot {
  depth: number;
  multipv: number;
  score: number | null;
  mate: number | null;
  pv: string[];
}

const STOCKFISH_PUBLIC_PATH = '/stockfish/stockfish-18-lite-single.js';

export function scoreToCentipawns(snapshot: AnalysisSnapshot | undefined): number | null {
  if (!snapshot) return null;
  if (typeof snapshot.mate === 'number') {
    const sign = snapshot.mate > 0 ? 1 : -1;
    return sign * (100000 - Math.min(Math.abs(snapshot.mate), 1000));
  }
  return snapshot.score;
}

/**
 * Trim an engine PV to a playable puzzle solution: at most `maxPlies`, and
 * always ODD length so the line ends on the solver's own move. TacticBoard
 * treats solution[0], [2], ... as player moves and auto-plays odd indices —
 * an even-length line would end on an opponent reply and never complete.
 */
export function pvToSolution(pv: string[], maxPlies = 4): string[] {
  const moves = pv.slice(0, maxPlies);
  if (moves.length % 2 === 0 && moves.length > 0) moves.pop();
  return moves;
}

/** Heuristic puzzle-rating estimate from engine output. */
export function estimateRating(best: number | null, gap: number, depth: number, moveCount: number): number {
  const bestMagnitude = Math.min(Math.abs(best ?? 0), 600);
  const depthBonus = Math.max(0, depth - 12) * 18;
  const gapBonus = Math.min(300, Math.round(gap / 8));
  const moveBonus = Math.max(0, moveCount - 2) * 35;
  const rating = 1350 + Math.round(bestMagnitude / 12) + depthBonus + gapBonus + moveBonus;
  return Math.max(900, Math.min(2800, rating));
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

export class StockfishClient {
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
        // Just flip the flag — the init poll tick (every 50ms) sees it and
        // resolves. The original code also cleared the scheduled tick here,
        // which orphaned the init promise forever: readyok almost always
        // arrives while a tick is pending, so init would hang and callers'
        // outer timeouts fired instead ("Stockfish generation timed out").
        this.ready = true;
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

  /**
   * Analyze a position. `movetimeMs` bounds wall-clock per position (the
   * search stops at depth OR movetime, whichever comes first) — essential
   * when verifying a batch of a hundred positions in the background.
   */
  async analyzeFen(fen: string, depth = 18, movetimeMs?: number): Promise<Map<number, AnalysisSnapshot>> {
    await this.init();
    if (!this.worker) throw new Error('Stockfish worker unavailable');
    this.currentSnapshots.clear();
    this.worker.postMessage('ucinewgame');
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage('setoption name MultiPV value 2');

    return new Promise<Map<number, AnalysisSnapshot>>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      const goCmd = movetimeMs ? `go depth ${depth} movetime ${movetimeMs}` : `go depth ${depth}`;
      this.worker?.postMessage(goCmd);
      const hardStop = movetimeMs ? movetimeMs + 5000 : 20000;
      window.setTimeout(() => {
        if (this.pendingReject === reject) {
          this.worker?.postMessage('stop');
        }
      }, hardStop);
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
