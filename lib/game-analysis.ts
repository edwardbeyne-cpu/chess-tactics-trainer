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

export interface MissedTactic {
  pattern: string;
  fen: string;
  moveNumber?: number;
  /** Engine-verified fields (present when Stockfish confirmed the miss). */
  bestLine?: string[];
  evalGap?: number;
  rating?: number;
  engineVerified?: boolean;
}

export interface StoredGameAnalysis {
  missedTactics: MissedTactic[];
  strengths: PatternSummary[];
  weaknesses: PatternSummary[];
  recommendation: string;
  platform: Platform;
  username: string;
  analyzedAt: string;
  gameCount: number;
  /** True when the miss list was verified by Stockfish rather than heuristics. */
  engineVerified?: boolean;
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
  // Strip PGN headers (lines starting with [)
  const headerless = pgn.replace(/\[[^\]]*\]\s*/g, "");
  const cleaned = headerless
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
      // Skip unrecognized tokens but don't break — try the next one
      continue;
    }
  }
  return uci;
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// Get the values of opponent pieces that the piece at `square` can capture.
// Uses side-flip trick: temporarily switches the active color so we can query
// the piece's attacks from its current owner's perspective.
function getAttackedPieceValues(fen: string, square: string): number[] {
  try {
    const parts = fen.split(" ");
    // Flip active side so the piece at `square` belongs to the side to move
    parts[1] = parts[1] === "w" ? "b" : "w";
    parts[2] = "-"; // clear castling rights to avoid illegal-state errors
    parts[3] = "-"; // clear en passant
    const flippedFen = parts.join(" ");
    const c = new Chess(flippedFen);
    return c.moves({ square: square as Square, verbose: true })
      .filter((m) => m.captured)
      .map((m) => PIECE_VALUES[m.captured!] ?? 0);
  } catch {
    return [];
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
// Only includes patterns that represent real tactical misses worth training
const TACTIC_PRIORITY = [
  "checkmate",
  "fork",
  "discovered attack",
  "winning capture",
  "pin",
  "skewer",
  "back rank mate",
] as const;

type TacticLabel = (typeof TACTIC_PRIORITY)[number];

// FAST tactic scanner — optimized for browser performance.
// Focuses on captures and checks — the moves most likely to be tactical.
function findAvailableTactics(fen: string): Map<TacticLabel, string[]> {
  const found = new Map<TacticLabel, string[]>();

  const addMove = (label: TacticLabel, uci: string) => {
    const arr = found.get(label) ?? [];
    arr.push(uci);
    found.set(label, arr);
  };

  try {
    const c = new Chess(fen);
    const allMoves = c.moves({ verbose: true });

    // Pre-filter to only tactical candidate moves: captures, knight moves, checks
    // This avoids cloning the board for quiet non-knight moves
    const candidates = allMoves.filter(
      (m) => m.captured || m.piece === "n" || m.piece === "q"
    );

    for (const m of candidates) {
      const moveUci = m.from + m.to + (m.promotion ?? "");

      // Winning capture: piece captures something worth more
      // PxN, PxB, PxR, PxQ, NxR, NxQ, BxR, BxQ, RxQ
      if (m.captured) {
        const capturedVal = PIECE_VALUES[m.captured] ?? 0;
        const attackerVal = PIECE_VALUES[m.piece] ?? 0;
        if (capturedVal > attackerVal) {
          addMove("winning capture", moveUci);
        }
      }

      // Fork detection: piece moves and attacks 2+ enemy pieces worth 3+
      // Only check knights and queens (most common fork pieces, worth the clone cost)
      if (m.piece === "n" || m.piece === "q") {
        const clone = new Chess(fen);
        clone.move(m);
        const attacked = getAttackedPieceValues(clone.fen(), m.to);
        const significantTargets = attacked.filter((v) => v >= 3);
        if (significantTargets.length >= 2) {
          // Extra filter: at least one target must be rook or queen
          if (attacked.some((v) => v >= 5)) {
            addMove("fork", moveUci);
          }
        }

        // Check + attack = discovered attack pattern
        if (clone.inCheck() && attacked.some((v) => v >= 3)) {
          addMove("discovered attack", moveUci);
        }
      }
    }
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

    for (const ucis of Array.from(tactics.values())) {
      if (ucis.some((u) => normalize(u) === playerNorm)) {
        return null; // Player executed a tactic — not missed
      }
    }
  }

  return bestTactic;
}

// ── Candidate collection (cheap chess.js pre-filter) ────────────────────────
//
// Stage 1 of the two-stage pipeline: quickly flag positions where a tactic
// MIGHT have existed. Stage 2 (Stockfish) verifies each candidate and
// classifies the real motif. The heuristic label is only used as a fallback
// when the engine is unavailable.

interface MissCandidate {
  fen: string;
  playedUci: string;
  moveNumber: number;
  heuristicLabel: string;
  severity: number;
}

const HEURISTIC_SEVERITY: Record<string, number> = {
  "checkmate": 5,
  "back rank mate": 4,
  "fork": 3,
  "winning capture": 3,
  "discovered attack": 2,
  "pin": 2,
  "skewer": 2,
};

function collectMissCandidates(games: GameResult[]): MissCandidate[] {
  const candidates: MissCandidate[] = [];
  let totalParsedMoves = 0;
  let totalPlayerMoves = 0;

  for (const { pgn, playerColor } of games) {
    const moves = parsePgnMoves(pgn);
    totalParsedMoves += moves.length;
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

      // Skip first 6 full moves (12 half-moves) — very early opening
      if (moveNum <= 12) continue;

      const wasPlayerTurn = isWhite
        ? fen.split(" ")[1] === "w"
        : fen.split(" ")[1] === "b";
      if (!wasPlayerTurn) continue;
      totalPlayerMoves++;

      // Primary detector (captures/forks/checks), excludes tactics the player played
      let label: string | null = detectMissedTactic(fen, uci);
      // Widen the net with the ray-based detectors so pin/skewer/back-rank
      // positions reach engine verification too.
      if (!label) {
        if (hasBackRankThreat(fen)) label = "back rank mate";
        else if (hasPinOpportunity(fen)) label = "pin";
        else if (hasSkewerOpportunity(fen)) label = "skewer";
      }
      if (label) {
        candidates.push({
          fen,
          playedUci: uci,
          moveNumber: moveNum,
          heuristicLabel: label,
          severity: HEURISTIC_SEVERITY[label] ?? 1,
        });
      }
    }
  }

  console.log(`[CTT] Parsed ${totalParsedMoves} moves, ${totalPlayerMoves} player moves, ${candidates.length} miss candidates`);
  return candidates;
}

// ── Motif classification of an engine line ──────────────────────────────────

function isSmotheredMate(mated: Chess): boolean {
  // Mated king has every adjacent square occupied by its own pieces.
  const board = mated.board();
  const color = mated.turn();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = boardPieceAt(board, f, r);
      if (p && p.type === "k" && p.color === color) {
        for (let df = -1; df <= 1; df++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (df === 0 && dr === 0) continue;
            const nf = f + df, nr = r + dr;
            if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
            const adj = boardPieceAt(board, nf, nr);
            if (!adj || adj.color !== color) return false;
          }
        }
        return true;
      }
    }
  }
  return false;
}

function matedKingOnBackRank(mated: Chess): boolean {
  const color = mated.turn();
  const backRank = color === "w" ? 0 : 7; // rank index (0 = rank 1)
  const board = mated.board();
  for (let f = 0; f < 8; f++) {
    const p = boardPieceAt(board, f, backRank);
    if (p && p.type === "k" && p.color === color) return true;
  }
  return false;
}

// Walk a ray from `square`; returns the first two pieces encountered in order.
function piecesOnRay(c: Chess, square: string, df: number, dr: number) {
  const board = c.board();
  const out: Array<{ type: string; color: string }> = [];
  let f = square.charCodeAt(0) - 97 + df;
  let r = parseInt(square[1]) - 1 + dr;
  while (f >= 0 && f < 8 && r >= 0 && r < 8) {
    const p = boardPieceAt(board, f, r);
    if (p) {
      out.push(p);
      if (out.length >= 2) break;
    }
    f += df;
    r += dr;
  }
  return out;
}

const SLIDER_RAYS: Record<string, [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};

// After our slider lands on `to`: pin = first opp piece then opp king behind;
// skewer = first opp piece (value ≥5 incl. king) with a lesser opp piece behind.
function sliderCreatesPinOrSkewer(afterFen: string, to: string, sliderType: string, ourColor: string): "pin" | "skewer" | null {
  if (!SLIDER_RAYS[sliderType]) return null;
  try {
    const c = new Chess(afterFen);
    for (const [df, dr] of SLIDER_RAYS[sliderType]) {
      const ray = piecesOnRay(c, to, df, dr);
      if (ray.length < 2) continue;
      const [front, back] = ray;
      if (front.color === ourColor || back.color === ourColor) continue;
      if (back.type === "k") return "pin";
      const frontVal = PIECE_VALUES[front.type] ?? 0;
      const backVal = PIECE_VALUES[back.type] ?? 0;
      if (frontVal >= 5 && backVal < frontVal) return "skewer";
    }
  } catch { /* ignore */ }
  return null;
}

// Does one of our sliders (not the moved piece) attack through the vacated
// square at an opponent rook/queen/king? → discovered attack/check.
function detectDiscovered(afterFen: string, vacated: string, movedTo: string, ourColor: string): "check" | "attack" | null {
  try {
    const c = new Chess(afterFen);
    const board = c.board();
    const vf = vacated.charCodeAt(0) - 97;
    const vr = parseInt(vacated[1]) - 1;

    for (const [df, dr] of SLIDER_RAYS.q) {
      // Walk backwards from the vacated square to find one of our sliders
      let f = vf - df, r = vr - dr;
      let slider: { type: string; color: string } | null = null;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = boardPieceAt(board, f, r);
        if (p) {
          const isOurs = p.color === ourColor;
          const coversDir = (df !== 0 && dr !== 0)
            ? (p.type === "b" || p.type === "q")
            : (p.type === "r" || p.type === "q");
          if (isOurs && coversDir) slider = p;
          break;
        }
        f -= df; r -= dr;
      }
      if (!slider) continue;

      // Walk forwards from the vacated square to the first piece
      f = vf + df; r = vr + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = boardPieceAt(board, f, r);
        if (p) {
          if (p.color !== ourColor) {
            if (p.type === "k") return "check";
            if ((PIECE_VALUES[p.type] ?? 0) >= 5) return "attack";
          }
          break;
        }
        f += df; r += dr;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Classify the tactical motif of an engine best line, returning a display
 * label. Falls back to "Winning Captures" / "Checks" when no specific
 * motif is recognized.
 */
function classifyMotif(fen: string, pv: string[], mate: number | null): string {
  try {
    const c = new Chess(fen);
    const first = pv[0];
    const from = first.slice(0, 2);
    const to = first.slice(2, 4);
    const firstMove = c.move({ from, to, promotion: first.length === 5 ? first[4] : undefined });
    if (!firstMove) return "Winning Captures";
    const ourColor = firstMove.color;
    const afterFen = c.fen();

    // ── Mate motifs: play the PV out and inspect the mating pattern ──
    if (mate !== null && mate > 0) {
      const cm = new Chess(fen);
      let lastMove: ReturnType<Chess["move"]> | null = null;
      try {
        for (const uci of pv) {
          lastMove = cm.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : undefined });
        }
      } catch { /* partial PV — fall through */ }
      if (cm.isCheckmate() && lastMove) {
        if (lastMove.piece === "n" && isSmotheredMate(cm)) return "Smothered Mates";
        if ((lastMove.piece === "r" || lastMove.piece === "q") && matedKingOnBackRank(cm)) return "Back Rank Mates";
        return "Checkmates";
      }
    }

    // ── Fork: moved piece attacks 2+ valuable targets (check counts as one) ──
    const attackedVals = getAttackedPieceValues(afterFen, to);
    const givesCheck = c.inCheck();
    // Does the moved piece itself attack the enemy king? (chess.js never
    // generates king captures, so getAttackedPieceValues can't tell us.)
    const oppColor = ourColor === "w" ? "b" : "w";
    const kingSquares = c.findPiece({ type: "k", color: oppColor });
    const movedAttacksKing =
      kingSquares.length > 0 &&
      c.attackers(kingSquares[0], ourColor).includes(to as Square);
    const bigTargets = attackedVals.filter((v) => v >= 3).length + (movedAttacksKing ? 1 : 0);
    if (bigTargets >= 2) return "Fork";

    // ── Discovered check / attack ──
    if (givesCheck && !movedAttacksKing) return "Discovered Checks";
    const disc = detectDiscovered(afterFen, from, to, ourColor);
    if (disc === "attack") return "Discovered Attacks";

    // ── Pin / skewer created by the moved slider ──
    if (["b", "r", "q"].includes(firstMove.piece)) {
      const ps = sliderCreatesPinOrSkewer(afterFen, to, firstMove.piece, ourColor);
      if (ps === "pin") return "Pin";
      if (ps === "skewer") return "Skewer";
    }

    if (firstMove.captured) return "Winning Captures";
    if (givesCheck) return "Checks";
    return "Winning Captures";
  } catch {
    return "Winning Captures";
  }
}

// ── Stage 2: engine verification ────────────────────────────────────────────

const VERIFY_DEPTH = 13;
const MAX_VERIFY_CANDIDATES = 120;
const MIN_MISS_GAP_CP = 150;

async function verifyCandidatesWithEngine(candidates: MissCandidate[]): Promise<MissedTactic[]> {
  const { StockfishClient, scoreToCentipawns, estimateRating } = await import("@/lib/stockfish-client");
  const client = new StockfishClient();
  const verified: MissedTactic[] = [];
  const normalize = (u: string) => u.replace(/undefined$/, "").toLowerCase();

  try {
    await client.init();
    for (const cand of candidates) {
      let snapshots;
      try {
        snapshots = await client.analyzeFen(cand.fen, VERIFY_DEPTH);
      } catch {
        continue; // one bad position shouldn't kill the run
      }
      const best = snapshots.get(1);
      const second = snapshots.get(2);
      if (!best?.pv?.length) continue;
      const bestCp = scoreToCentipawns(best);
      if (bestCp === null) continue;
      const secondCp = scoreToCentipawns(second);
      const gap = secondCp === null ? Math.abs(bestCp) : bestCp - secondCp;

      // A real miss: a single clearly-best move existed (big gap), the
      // resulting position is at least OK for the player, and the player
      // played something else.
      if (gap < MIN_MISS_GAP_CP || bestCp < -50) continue;
      if (normalize(best.pv[0]) === normalize(cand.playedUci)) continue;

      verified.push({
        pattern: classifyMotif(cand.fen, best.pv, best.mate),
        fen: cand.fen,
        moveNumber: cand.moveNumber,
        bestLine: best.pv.slice(0, 4),
        evalGap: Math.round(Math.min(gap, 100000)),
        rating: estimateRating(bestCp, gap, best.depth, Math.min(best.pv.length, 4)),
        engineVerified: true,
      });
    }
  } finally {
    client.dispose();
  }
  return verified;
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
      { headers: { Accept: "application/json" }, redirect: "follow" }
    );
    if (!archivesRes.ok) return [];
    const { archives } = (await archivesRes.json()) as { archives: string[] };
    if (!archives?.length) return [];

    const reversed = [...archives].reverse();
    const allGames: GameResult[] = [];

    for (const archive of reversed) {
      if (allGames.length >= 50) break;
      const res = await fetch(archive, {
        headers: { Accept: "application/json" }, redirect: "follow",
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

// ── Threat Detection puzzle builder ──────────────────────────────────────────
//
// Walks the opponent's turns in each game. When the opponent had a fork/pin/skewer
// AND actually played it, record the position BEFORE their move as a defensive puzzle.
// This gives real "your opponent just played a tactic — defend it" positions from your games.

export const THREAT_DETECTION_GAMES_KEY = "ctt_threat_detection_game_puzzles";

export interface GameThreatPuzzle {
  id: string;
  fen: string;           // position before opponent's threatening move (where player must defend)
  defenderFen: string;   // position after opponent's move (what player sees)
  attackerMove: string;  // UCI of the opponent's threatening move
  threatType: string;    // "fork" | "pin" | "skewer"
  orientation: "white" | "black";  // player's perspective
  acceptableDefenseMoves: string[];  // moves[next] from the game = what was actually played
  rating?: number;
  source: string;        // "chesscom:username"
}

const THREAT_PATTERNS = ["fork", "pin", "skewer"] as const;
type ThreatPattern = (typeof THREAT_PATTERNS)[number];

function detectOpponentThreat(fen: string): { pattern: ThreatPattern; moves: string[] } | null {
  const tactics = findAvailableTactics(fen);
  for (const pattern of THREAT_PATTERNS) {
    if (tactics.has(pattern as TacticLabel)) {
      return { pattern: pattern as ThreatPattern, moves: tactics.get(pattern as TacticLabel)! };
    }
  }
  // Also check pin and skewer via their dedicated functions (findAvailableTactics misses some)
  if (hasPinOpportunity(fen)) return { pattern: "pin", moves: [] };
  if (hasSkewerOpportunity(fen)) return { pattern: "skewer", moves: [] };
  return null;
}

export function buildThreatDetectionPuzzlesFromGames(
  games: Array<{ pgn: string; playerColor: string }>,
  source: string
): GameThreatPuzzle[] {
  const results: GameThreatPuzzle[] = [];
  let puzzleIdx = 0;

  for (const { pgn, playerColor } of games) {
    const moves = parsePgnMoves(pgn);
    const isWhite = playerColor.toLowerCase().startsWith("w");
    const c = new Chess();
    let moveNum = 0;

    for (let i = 0; i < moves.length - 1; i++) {
      const uci = moves[i];
      moveNum++;
      const fenBeforeMove = c.fen();

      let moved;
      try {
        moved = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : undefined });
      } catch { break; }

      if (moveNum <= 12) continue; // skip opening

      const wasOpponentTurn = isWhite
        ? fenBeforeMove.split(" ")[1] === "b"
        : fenBeforeMove.split(" ")[1] === "w";

      if (!wasOpponentTurn) continue;

      // Check if opponent had a fork/pin/skewer AND the move they played is one of those threats
      const threat = detectOpponentThreat(fenBeforeMove);
      if (!threat) continue;

      // The move they played must be the threatening move (not just any move)
      // If findAvailableTactics gave us specific moves, verify the played move is one of them
      if (threat.moves.length > 0) {
        const normalize = (u: string) => u.replace(/undefined$/, "").toLowerCase();
        const playedNorm = normalize(uci);
        if (!threat.moves.some((m) => normalize(m) === playedNorm)) continue;
      }

      // The defending player's next move is what was actually played
      const nextMove = moves[i + 1];
      if (!nextMove) continue;

      const defenderFen = c.fen();
      const defenderSide = defenderFen.split(" ")[1];

      // Validate the defensive move is legal and purely defensive (quiet move)
      try {
        const defTest = new Chess(defenderFen);
        const defResult = defTest.move({
          from: nextMove.slice(0, 2),
          to: nextMove.slice(2, 4),
          promotion: nextMove.length === 5 ? nextMove[4] : undefined,
        });
        if (!defResult) continue;
        // Accept any legal move — it came from a real game, so it's a real defensive response
        // (unlike the Lichess inversion approach, we don't need to filter captures/checks)
      } catch { continue; }

      const orientation: "white" | "black" = isWhite ? "white" : "black";

      results.push({
        id: `threat-game-${puzzleIdx++}`,
        fen: fenBeforeMove,
        defenderFen,
        attackerMove: uci,
        threatType: threat.pattern,
        orientation,
        acceptableDefenseMoves: [nextMove],
        source,
      });

      if (results.length >= 200) break;
    }
    if (results.length >= 200) break;
  }

  console.log(`[CTT] Built ${results.length} threat detection puzzles from games`);
  return results;
}

export async function runGameAnalysis(
  username: string,
  platform: Platform = "chesscom"
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const debugLines: string[] = [];
  const dbg = (msg: string) => { debugLines.push(msg); console.log(msg); localStorage.setItem("ctt_analysis_debug", JSON.stringify(debugLines)); };
  try {
    // Signal that analysis is in progress so UI can show loading state
    localStorage.setItem("ctt_analysis_status", "running");
    dbg(`[CTT] Starting game analysis for ${username} ${platform}`);

    const games = await fetchRecentGames(username, platform);
    dbg(`[CTT] Fetched ${games.length} games`);
    if (games.length > 0) {
      // Debug: show first game's PGN length and first 100 chars
      const firstPgn = games[0].pgn;
      console.log("[CTT] First game PGN length:", firstPgn.length, "preview:", firstPgn.slice(0, 100));
      // Debug: test parsing on first game
      const testMoves = parsePgnMoves(firstPgn);
      console.log("[CTT] First game parsed moves:", testMoves.length, "sample:", testMoves.slice(0, 5));
    }
    if (games.length === 0) {
      localStorage.setItem("ctt_analysis_status", "done");
      return false;
    }

    // Stage 1: cheap candidate collection
    const candidates = collectMissCandidates(games);
    const capped = [...candidates]
      .sort((a, b) => b.severity - a.severity)
      .slice(0, MAX_VERIFY_CANDIDATES);

    // Stage 2: Stockfish verification + motif classification.
    // Falls back to heuristic labels if the engine can't start (e.g. WASM
    // unavailable) so analysis still produces something.
    let missed: MissedTactic[];
    let engineVerified = true;
    try {
      missed = await verifyCandidatesWithEngine(capped);
      dbg(`[CTT] Engine verified ${missed.length}/${capped.length} candidate misses`);
    } catch (engineErr) {
      engineVerified = false;
      dbg(`[CTT] Engine unavailable (${engineErr instanceof Error ? engineErr.message : engineErr}) — using heuristic labels`);
      missed = capped.map((cand) => ({
        pattern: normalizePatternLabel(cand.heuristicLabel),
        fen: cand.fen,
        moveNumber: cand.moveNumber,
      }));
    }
    console.log("[CTT] Analysis complete. Missed tactics:", missed.length);

    // If no missed tactics found, don't store empty data — let auto-retry handle it
    if (missed.length === 0) {
      console.warn("[CTT] No missed tactics detected — skipping localStorage write so auto-retry can re-analyze");
      localStorage.setItem("ctt_analysis_status", "empty");
      return false;
    }
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
      engineVerified,
    };

    localStorage.setItem("ctt_custom_analysis", JSON.stringify(payload));
    localStorage.setItem("ctt_game_analysis", JSON.stringify(payload));
    localStorage.setItem("ctt_custom_platform", platform);
    localStorage.setItem("ctt_custom_username", username);
    localStorage.setItem("ctt_analysis_status", "done");

    // Build threat detection puzzles from the user's games
    const threatPuzzles = buildThreatDetectionPuzzlesFromGames(
      games,
      `${platform}:${username}`
    );
    dbg(`[CTT] Built ${threatPuzzles.length} threat detection puzzles from games`);
    localStorage.setItem(THREAT_DETECTION_GAMES_KEY, JSON.stringify(threatPuzzles));

    // NOTE: ctt_custom_queue is owned by CustomPuzzles (a string[] of puzzle
    // ids). The old code wrote objects here, which its consumer couldn't
    // read — Custom Puzzles now builds directly from missedTactics instead.

    console.log("[CTT] Analysis saved to localStorage successfully");
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    dbg(`[CTT] Game analysis FAILED: ${errMsg}`);
    localStorage.setItem("ctt_analysis_status", "error");
    return false;
  }
}
