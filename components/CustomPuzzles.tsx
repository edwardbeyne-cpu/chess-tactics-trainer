"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Chess } from "chess.js";
import { runGameAnalysis, type StoredGameAnalysis } from "@/lib/game-analysis";
import { TacticBoard, type TacticBoardProps } from "./TrainingSession";
import UpgradeModal from "./UpgradeModal";
// GeneratedCustomPuzzle type inlined to avoid importing the stockfish module at page load
interface GeneratedCustomPuzzle {
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

// ── Constants ──────────────────────────────────────────────────────────────

const CUSTOM_QUEUE_KEY = "ctt_custom_queue";
const CUSTOM_GENERATED_PUZZLES_KEY = "ctt_custom_puzzles_generated";
const CUSTOM_ANALYSIS_KEY = "ctt_custom_analysis";
const CUSTOM_USERNAME_KEY = "ctt_custom_username";
const CUSTOM_PLATFORM_KEY = "ctt_custom_platform";

const MAX_GAMES = 50;

// Piece values for heuristic analysis
const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 100,
};

// Tactic pattern names mapped to our puzzle themes
const TACTIC_PATTERNS = [
  "Fork",
  "Pin",
  "Skewer",
  "Back Rank",
  "Discovered Attack",
  "Overloading",
  "Deflection",
  "Zwischenzug",
  "Smothered Mate",
  "Trapped Piece",
];

// Lichess theme keys matching patterns above
const PATTERN_TO_THEME: Record<string, string> = {
  "Fork": "fork",
  "Pin": "pin",
  "Skewer": "skewer",
  "Back Rank": "backRankMate",
  "Discovered Attack": "discoveredAttack",
  "Overloading": "overloading",
  "Deflection": "deflection",
  "Zwischenzug": "intermezzo",
  "Smothered Mate": "smotheredMate",
  "Trapped Piece": "trappedPiece",
};

// ── Types ──────────────────────────────────────────────────────────────────

type Platform = "chesscom" | "lichess";
type PageState = "connect" | "analyzing" | "results";

interface MissedTactic {
  pattern: string;
  fen: string;
  moveNumber: number;
  gameIndex: number;
}

interface AnalysisResult {
  missedByPattern: Record<string, number>;
  total: number;
  platform: Platform;
  username: string;
  analyzedAt: string;
}

interface StoredAnalysis extends AnalysisResult {
  customQueue: string[]; // fallback Lichess puzzle IDs
  generatedCount?: number;
  generationMode?: 'stockfish' | 'fallback';
}

// ── Utility: check Pro tier ─────────────────────────────────────────────────

function isProUser(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("ctt_sub_tier") === "2";
}

// ── Heuristic missed-tactic detection ──────────────────────────────────────
// We can't run Stockfish in-browser cleanly, so we use Chess.js to detect
// tactical patterns based on position characteristics.

/**
 * Identify if a position contains a tactical opportunity for the active side.
 * Returns the pattern name or null if nothing found.
 */
function detectTacticOpportunity(chess: Chess): string | null {
  const board = chess.board();
  const turn = chess.turn(); // 'w' or 'b'
  const opponent = turn === 'w' ? 'b' : 'w';

  // Helper: get all pieces for a color
  function getPieces(color: 'w' | 'b'): Array<{ square: string; type: string; value: number }> {
    const pieces: Array<{ square: string; type: string; value: number }> = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.color === color) {
          const files = 'abcdefgh';
          const square = files[c] + (8 - r);
          pieces.push({ square, type: piece.type, value: PIECE_VALUES[piece.type] ?? 1 });
        }
      }
    }
    return pieces;
  }

  const myPieces = getPieces(turn);
  const theirPieces = getPieces(opponent);
  const moves = chess.moves({ verbose: true });

  // ── 1. Back rank mate ──
  // Check if opponent king is on back rank with pawns blocking escape
  const opponentKing = theirPieces.find(p => p.type === 'k');
  if (opponentKing) {
    const backRank = opponent === 'b' ? '8' : '1';
    if (opponentKing.square[1] === backRank) {
      // Check if opponent's back rank is limited
      const backRankMoves = moves.filter(m =>
        m.piece !== 'k' && m.to[1] === backRank && m.flags.includes('c')
      );
      if (backRankMoves.length > 0) {
        return "Back Rank";
      }
    }
  }

  // ── 2. Fork ──
  // Check if any move of ours attacks 2+ valuable opponent pieces
  const attacksMap: Record<string, string[]> = {};
  for (const move of moves) {
    if (!attacksMap[move.from]) attacksMap[move.from] = [];
    attacksMap[move.from].push(move.to);
  }

  for (const [, targets] of Object.entries(attacksMap)) {
    // Count how many opponent valuable pieces (value >= 3) this piece can reach
    const attackedHighValue = targets.filter(sq =>
      theirPieces.some(p => p.square === sq && p.value >= 3)
    );
    if (attackedHighValue.length >= 2) return "Fork";
    // Also check: attacks king + any piece
    const attacksKing = targets.some(sq => theirPieces.some(p => p.square === sq && p.type === 'k'));
    const attacksOther = targets.some(sq => theirPieces.some(p => p.square === sq && p.value >= 3 && p.type !== 'k'));
    if (attacksKing && attacksOther) return "Fork";
  }

  // ── 3. Pin ──
  // Simplistic: check if a sliding piece of ours has an opponent piece in front of king
  const sliders = myPieces.filter(p => ['r', 'b', 'q'].includes(p.type));
  for (const slider of sliders) {
    const captureTargets = moves.filter(m =>
      m.from === slider.square && m.flags.includes('c')
    ).map(m => m.to);

    for (const sq of captureTargets) {
      const target = theirPieces.find(p => p.square === sq);
      if (!target || target.type === 'k') continue;
      // Check if king is behind this square from the slider's perspective
      // (simplified: if king and slider are on same file/rank/diagonal, and target is between)
      if (opponentKing) {
        const sliderFile = slider.square.charCodeAt(0);
        const sliderRank = parseInt(slider.square[1]);
        const targetFile = sq.charCodeAt(0);
        const targetRank = parseInt(sq[1]);
        const kingFile = opponentKing.square.charCodeAt(0);
        const kingRank = parseInt(opponentKing.square[1]);

        const sameFile = sliderFile === targetFile && targetFile === kingFile;
        const sameRank = sliderRank === targetRank && targetRank === kingRank;
        const sameDiag = Math.abs(sliderFile - targetFile) === Math.abs(sliderRank - targetRank) &&
          Math.abs(targetFile - kingFile) === Math.abs(targetRank - kingRank) &&
          Math.sign(targetFile - sliderFile) === Math.sign(kingFile - sliderFile);

        if ((sameFile || sameRank || sameDiag) && target.value < PIECE_VALUES['q']) {
          return "Pin";
        }
      }
    }
  }

  // ── 4. Skewer ──
  // Valuable piece forced to move exposes piece behind
  const captureMoves = moves.filter(m => m.flags.includes('c'));
  for (const move of captureMoves) {
    const captured = theirPieces.find(p => p.square === move.to);
    if (!captured) continue;
    // If captured piece is high value and we're a slider
    const mover = myPieces.find(p => p.square === move.from);
    if (!mover || !['r', 'b', 'q'].includes(mover.type)) continue;
    if (captured.value >= 5) {
      // Check if another opponent piece is on the same line behind
      const df = move.to.charCodeAt(0) - move.from.charCodeAt(0);
      const dr = parseInt(move.to[1]) - parseInt(move.from.charCodeAt(0) > 0 ? move.to[1] : move.from[1]);
      const nextFile = String.fromCharCode(move.to.charCodeAt(0) + Math.sign(df));
      const nextRank = String((parseInt(move.to[1]) + Math.sign(parseInt(move.to[1]) - parseInt(move.from[1]))));
      const nextSq = nextFile + nextRank;
      if (theirPieces.some(p => p.square === nextSq && p.value >= 3)) {
        return "Skewer";
      }
      void dr; // suppress unused
    }
  }

  // ── 5. Trapped piece ──
  // Opponent piece has very few safe moves
  const opponentMoves = chess.moves({ verbose: true });
  void opponentMoves; // would need to switch sides; skip for performance

  // ── 6. Discovered attack ──
  // A piece move that opens an attack line from another piece
  const mySliders = myPieces.filter(p => ['r', 'b', 'q'].includes(p.type));
  for (const slider of mySliders) {
    for (const move of moves) {
      if (move.from === slider.square) continue;
      // After this move, does the slider now attack a valuable opponent piece?
      const moverSq = move.from;
      // Simplified: check if mover was blocking slider's line to an opponent piece
      const moverFile = moverSq.charCodeAt(0);
      const moverRank = parseInt(moverSq[1]);
      const sliderFile = slider.square.charCodeAt(0);
      const sliderRank = parseInt(slider.square[1]);
      const sameFile = moverFile === sliderFile;
      const sameRank = moverRank === sliderRank;
      const sameDiag = Math.abs(moverFile - sliderFile) === Math.abs(moverRank - sliderRank);
      if (sameFile || sameRank || sameDiag) {
        // Check if there's a valuable opponent piece on that line beyond the mover
        const df = Math.sign(moverFile - sliderFile);
        const dr = Math.sign(moverRank - sliderRank);
        let f = moverFile + df;
        let r = moverRank + dr;
        while (f >= 97 && f <= 104 && r >= 1 && r <= 8) {
          const sq = String.fromCharCode(f) + r;
          const target = theirPieces.find(p => p.square === sq);
          if (target) {
            if (target.value >= 3) return "Discovered Attack";
            break;
          }
          f += df;
          r += dr;
        }
      }
    }
  }

  return null;
}

/**
 * Detect if a player blundered in a position.
 * Returns whether this position had a tactic the player missed.
 * Simple heuristic: did the player move to a position where they lost
 * material compared to what was available?
 */
function detectMissedTactic(
  fenBeforeMove: string,
  playerMove: string,
  isPlayerMove: boolean
): string | null {
  if (!isPlayerMove) return null;

  try {
    const chess = new Chess(fenBeforeMove);
    // Check if this position had a tactic the player could have played
    const tactic = detectTacticOpportunity(chess);

    // Now make the player's actual move
    const from = playerMove.slice(0, 2);
    const to = playerMove.slice(2, 4);
    const promotion = playerMove.length === 5 ? playerMove[4] : undefined;

    try {
      chess.move({ from, to, promotion });
    } catch {
      return null;
    }

    // If a tactic existed but the player didn't take any captures of high-value pieces
    if (tactic) {
      // Check if player's move was a capture of high-value material
      const capturedPiece = playerMove.length >= 4 ? null : null;
      void capturedPiece;
      // Simple: if tactic existed and player didn't capture (didn't make an aggressive move), flag it
      const chessCheck = new Chess(fenBeforeMove);
      const allMoves = chessCheck.moves({ verbose: true });
      const captureMoves = allMoves.filter(m => m.flags.includes('c') && (PIECE_VALUES[m.captured ?? ''] ?? 0) >= 3);
      const playerDidCapture = captureMoves.some(m => m.from === from && m.to === to);
      if (!playerDidCapture && captureMoves.length > 0) {
        return tactic;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse PGN into a list of moves in UCI format.
 * Returns array of UCI move strings.
 */
function parsePgnMoves(pgn: string): string[] {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    try {
      // Try loading as plain move text
      const clean = pgn.replace(/\d+\.\s*/g, '').replace(/\{[^}]*\}/g, '').trim();
      const tokens = clean.split(/\s+/).filter(t => t && !t.match(/^(1-0|0-1|1\/2-1\/2|\*)$/));
      const tempChess = new Chess();
      const uciMoves: string[] = [];
      for (const token of tokens) {
        try {
          const move = tempChess.move(token);
          if (move) {
            uciMoves.push(move.from + move.to + (move.promotion ?? ''));
          }
        } catch {
          break;
        }
      }
      return uciMoves;
    } catch {
      return [];
    }
  }
  return chess.history({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? ''));
}

/**
 * Analyze a single game for missed tactics.
 * playerColor: 'white' | 'black'
 */
function analyzeGame(
  pgn: string,
  playerColor: string,
  gameIndex: number
): MissedTactic[] {
  const missed: MissedTactic[] = [];
  const moves = parsePgnMoves(pgn);
  if (moves.length === 0) return missed;

  const isWhite = playerColor.toLowerCase().startsWith('w');
  const chess = new Chess();
  let moveNum = 0;

  for (const uciMove of moves) {
    moveNum++;
    const isPlayerTurn = isWhite ? chess.turn() === 'w' : chess.turn() === 'b';
    const fenBefore = chess.fen();

    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.length === 5 ? uciMove[4] : undefined;

    try {
      chess.move({ from, to, promotion });
    } catch {
      break;
    }

    if (isPlayerTurn) {
      const tactic = detectMissedTactic(fenBefore, uciMove, true);
      if (tactic) {
        missed.push({ pattern: tactic, fen: fenBefore, moveNumber: moveNum, gameIndex });
      }
    }
  }

  return missed;
}

// ── Chess.com game fetcher ──────────────────────────────────────────────────

interface ChesscomGame {
  pgn: string;
  white: { username: string };
  black: { username: string };
  time_class: string;
}

async function fetchChesscomGames(username: string): Promise<Array<{ pgn: string; playerColor: string }>> {
  // 1. Get archives
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`,
    { headers: { 'User-Agent': 'ChessTacticsTrainer/1.0' } }
  );
  if (!archivesRes.ok) throw new Error(`Chess.com API error: ${archivesRes.status}`);
  const { archives } = await archivesRes.json() as { archives: string[] };
  if (!archives || archives.length === 0) throw new Error('No games found for this username');

  // 2. Fetch games from multiple archives (up to 3 months) until we have MAX_GAMES
  const allGames: ChesscomGame[] = [];
  const maxArchivesToFetch = Math.min(3, archives.length); // Don't go back more than 3 months

  // Iterate backwards through archives (most recent first)
  for (let i = 0; i < maxArchivesToFetch && allGames.length < MAX_GAMES; i++) {
    const archiveUrl = archives[archives.length - 1 - i];
    try {
      const gamesRes = await fetch(archiveUrl, {
        headers: { 'User-Agent': 'ChessTacticsTrainer/1.0' }
      });
      if (!gamesRes.ok) continue; // Skip failed fetches, try next archive
      const { games } = await gamesRes.json() as { games: ChesscomGame[] };
      if (!games || games.length === 0) continue;
      allGames.push(...games);
    } catch {
      // Skip failed fetches, continue to next archive
      continue;
    }
  }

  if (allGames.length === 0) throw new Error('No games found for this username');

  // 3. Take most recent MAX_GAMES and determine player color
  const sliced = allGames.slice(-MAX_GAMES);
  return sliced.map(g => ({
    pgn: g.pgn,
    playerColor: g.white.username.toLowerCase() === username.toLowerCase() ? 'white' : 'black',
  }));
}

// ── Lichess game fetcher ───────────────────────────────────────────────────

async function fetchLichessGames(username: string): Promise<Array<{ pgn: string; playerColor: string }>> {
  const url = `https://lichess.org/api/games/user/${username}?max=${MAX_GAMES}&moves=true&pgnInJson=false`;
  const res = await fetch(url, {
    headers: { Accept: 'application/x-ndjson' }
  });
  if (!res.ok) throw new Error(`Lichess API error: ${res.status}`);

  const text = await res.text();
  const lines = text.trim().split('\n').filter(Boolean);

  const games: Array<{ pgn: string; playerColor: string }> = [];

  for (const line of lines) {
    try {
      const game = JSON.parse(line);
      if (!game.moves) continue;
      const pgn = game.moves; // Lichess returns moves as SAN
      const playerColor = game.players?.white?.user?.name?.toLowerCase() === username.toLowerCase() ? 'white' : 'black';
      games.push({ pgn, playerColor });
    } catch {
      continue;
    }
  }

  if (games.length === 0) throw new Error('No games found. Make sure your profile is public.');
  return games;
}

// ── Pull puzzles matching weak patterns ────────────────────────────────────

async function buildCustomQueue(
  missedByPattern: Record<string, number>
): Promise<string[]> {
  // Sort patterns by miss frequency
  const sorted = Object.entries(missedByPattern ?? {})
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) return [];

  const queueIds: string[] = [];

  // Import lichess-puzzles data (we'll load it dynamically to avoid top-level imports)
  const { cachedPuzzlesByTheme } = await import('@/data/lichess-puzzles');

  const totalWeight = sorted.reduce((sum, [, c]) => sum + c, 0);

  // Build 50 puzzles weighted by miss frequency
  const TARGET = 50;

  for (const [pattern, count] of sorted) {
    const themeKey = PATTERN_TO_THEME[pattern];
    if (!themeKey) continue;

    const puzzlesForTheme = cachedPuzzlesByTheme[themeKey] ?? [];
    if (puzzlesForTheme.length === 0) continue;

    const weight = count / totalWeight;
    const numPuzzles = Math.max(1, Math.round(TARGET * weight));

    // Pick random puzzles from this theme
    const shuffled = [...puzzlesForTheme].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, numPuzzles);
    for (const p of selected) {
      if (!queueIds.includes(p.id)) {
        queueIds.push(p.id);
      }
    }
  }

  // Shuffle final queue
  return queueIds.sort(() => Math.random() - 0.5).slice(0, TARGET);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function UpgradePrompt() {
  const [showModal, setShowModal] = useState(false);
  return (
    <div style={{
      backgroundColor: '#1a1a2e',
      border: '1px solid #2e3a5c',
      borderRadius: '16px',
      padding: '3rem 2rem',
      textAlign: 'center',
      maxWidth: '520px',
      margin: '2rem auto',
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
      <h2 style={{ color: '#e2e8f0', fontWeight: 'bold', marginBottom: '0.75rem', fontSize: '1.5rem' }}>
        Custom Puzzles is a Pro Feature
      </h2>
      <p style={{ color: '#94a3b8', marginBottom: '0.5rem', lineHeight: 1.6 }}>
        Upgrade to Pro to connect your Chess.com or Lichess account, analyze your games,
        and get a personalized puzzle queue targeting your weakest patterns.
      </p>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '2rem' }}>
        Have a beta code? Enter <strong style={{ color: '#4ade80' }}>BETA2026</strong> in Settings to unlock Pro instantly.
      </p>
      <button
        onClick={() => setShowModal(true)}
        style={{
          backgroundColor: '#4ade80',
          color: '#0f0f1a',
          padding: '0.875rem 2.5rem',
          borderRadius: '10px',
          border: 'none',
          fontWeight: 'bold',
          fontSize: '1rem',
          cursor: 'pointer',
        }}
      >
        Upgrade to Pro
      </button>
      {showModal && <UpgradeModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function ConnectState({
  onConnect,
}: {
  onConnect: (platform: Platform, username: string) => void;
}) {
  const [showChesscomInput, setShowChesscomInput] = useState(false);
  const [showLichessInput, setShowLichessInput] = useState(false);
  const [chesscomUsername, setChesscomUsername] = useState('');
  const [lichessUsername, setLichessUsername] = useState('');

  const handleConnect = (platform: Platform, username: string) => {
    if (!username.trim()) return;
    onConnect(platform, username.trim());
  };

  return (
    <div style={{
      maxWidth: '580px',
      margin: '0 auto',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🎯</div>
      <h2 style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '1.75rem', marginBottom: '0.75rem' }}>
        Train on Your Weaknesses
      </h2>
      <p style={{ color: '#94a3b8', lineHeight: 1.7, marginBottom: '2.5rem', fontSize: '1rem' }}>
        Connect your Chess.com or Lichess account. We&apos;ll analyze your games, find the tactics
        you miss most, and build you a custom puzzle queue.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '380px', margin: '0 auto' }}>
        {/* Chess.com */}
        {!showChesscomInput ? (
          <button
            onClick={() => { setShowChesscomInput(true); setShowLichessInput(false); }}
            style={{
              backgroundColor: '#1a1a2e',
              border: '1px solid #2e3a5c',
              borderRadius: '12px',
              padding: '1rem 1.5rem',
              color: '#e2e8f0',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              transition: 'border-color 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.borderColor = '#4ade80')}
            onMouseOut={e => (e.currentTarget.style.borderColor = '#2e3a5c')}
          >
            <span style={{ fontSize: '1.5rem' }}>♟</span>
            Connect Chess.com
          </button>
        ) : (
          <div style={{
            backgroundColor: '#1a1a2e',
            border: '1px solid #4ade80',
            borderRadius: '12px',
            padding: '1rem 1.5rem',
          }}>
            <div style={{ color: '#4ade80', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.6rem', textAlign: 'left' }}>
              ♟ Chess.com Username
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={chesscomUsername}
                onChange={e => setChesscomUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect('chesscom', chesscomUsername)}
                placeholder="your username"
                autoFocus
                style={{
                  flex: 1,
                  backgroundColor: '#0f0f1a',
                  border: '1px solid #2e3a5c',
                  borderRadius: '8px',
                  padding: '0.6rem 0.8rem',
                  color: '#e2e8f0',
                  fontSize: '0.95rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => handleConnect('chesscom', chesscomUsername)}
                disabled={!chesscomUsername.trim()}
                style={{
                  backgroundColor: chesscomUsername.trim() ? '#4ade80' : '#1e3a2e',
                  color: chesscomUsername.trim() ? '#0f0f1a' : '#2e5a3e',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.6rem 1rem',
                  fontWeight: 'bold',
                  cursor: chesscomUsername.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.9rem',
                }}
              >
                Analyze →
              </button>
            </div>
          </div>
        )}

        {/* Lichess */}
        {!showLichessInput ? (
          <button
            onClick={() => { setShowLichessInput(true); setShowChesscomInput(false); }}
            style={{
              backgroundColor: '#1a1a2e',
              border: '1px solid #2e3a5c',
              borderRadius: '12px',
              padding: '1rem 1.5rem',
              color: '#e2e8f0',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              transition: 'border-color 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.borderColor = '#a78bfa')}
            onMouseOut={e => (e.currentTarget.style.borderColor = '#2e3a5c')}
          >
            <span style={{ fontSize: '1.5rem' }}>🐴</span>
            Connect Lichess
          </button>
        ) : (
          <div style={{
            backgroundColor: '#1a1a2e',
            border: '1px solid #a78bfa',
            borderRadius: '12px',
            padding: '1rem 1.5rem',
          }}>
            <div style={{ color: '#a78bfa', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.6rem', textAlign: 'left' }}>
              🐴 Lichess Username
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={lichessUsername}
                onChange={e => setLichessUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect('lichess', lichessUsername)}
                placeholder="your username"
                autoFocus
                style={{
                  flex: 1,
                  backgroundColor: '#0f0f1a',
                  border: '1px solid #2e3a5c',
                  borderRadius: '8px',
                  padding: '0.6rem 0.8rem',
                  color: '#e2e8f0',
                  fontSize: '0.95rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => handleConnect('lichess', lichessUsername)}
                disabled={!lichessUsername.trim()}
                style={{
                  backgroundColor: lichessUsername.trim() ? '#a78bfa' : '#1e1a3a',
                  color: lichessUsername.trim() ? '#0f0f1a' : '#3e3a5a',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.6rem 1rem',
                  fontWeight: 'bold',
                  cursor: lichessUsername.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.9rem',
                }}
              >
                Analyze →
              </button>
            </div>
          </div>
        )}
      </div>

      <p style={{ color: '#475569', fontSize: '0.78rem', marginTop: '2rem' }}>
        No sign-in required. Uses public APIs only. Your games are analyzed locally.
      </p>
    </div>
  );
}

function AnalyzingState({
  platform,
  username,
  progress,
  total,
  statusMsg,
  error,
  onCancel,
}: {
  platform: Platform;
  username: string;
  progress: number;
  total: number;
  statusMsg: string;
  error: string | null;
  onCancel: () => void;
}) {
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  const platformColor = platform === 'chesscom' ? '#4ade80' : '#a78bfa';
  const platformLabel = platform === 'chesscom' ? '♟ Chess.com' : '🐴 Lichess';

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
      <h2 style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
        Analyzing Your Games
      </h2>
      <p style={{ color: platformColor, fontSize: '0.9rem', marginBottom: '2rem' }}>
        {platformLabel} · {username}
      </p>

      {error ? (
        <div style={{
          backgroundColor: '#2a1a1a',
          border: '1px solid #ef4444',
          borderRadius: '10px',
          padding: '1rem 1.5rem',
          marginBottom: '1.5rem',
          color: '#ef4444',
          fontSize: '0.9rem',
          textAlign: 'left',
        }}>
          ⚠️ {error}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
            {/* CSS Spinner */}
            <div style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              border: '2px solid #64748b',
              borderTopColor: platformColor,
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
              {statusMsg}
            </div>
          </div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
          <div style={{
            backgroundColor: '#1a1a2e',
            borderRadius: '999px',
            height: '12px',
            overflow: 'hidden',
            marginBottom: '0.5rem',
            border: '1px solid #2e3a5c',
          }}>
            <div style={{
              height: '100%',
              backgroundColor: platformColor,
              borderRadius: '999px',
              width: `${pct}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '2rem' }}>
            {progress} of {total} games analyzed
          </div>
        </>
      )}

      <button
        onClick={onCancel}
        style={{
          backgroundColor: 'transparent',
          border: '1px solid #2e3a5c',
          borderRadius: '8px',
          padding: '0.6rem 1.5rem',
          color: '#64748b',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        Cancel
      </button>
    </div>
  );
}

function ResultsState({
  analysis,
  onStartTraining,
  onReanalyze,
}: {
  analysis: StoredAnalysis;
  onStartTraining: () => void;
  onReanalyze: () => void;
}) {
  const { missedByPattern, total = 0, platform = 'chesscom' as Platform, username = '', customQueue = [] } = analysis ?? {};
  const platformColor = platform === 'chesscom' ? '#4ade80' : '#a78bfa';
  const platformLabel = platform === 'chesscom' ? '♟ Chess.com' : '🐴 Lichess';

  // Sort patterns by miss count
  const sorted = Object.entries(missedByPattern ?? {})
    .filter(([, c]) => c > 0)
    .sort(([, a], [, b]) => b - a);

  const maxMiss = sorted[0]?.[1] ?? 1;

  const totalMissed = sorted.reduce((sum, [, c]) => sum + c, 0);

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📊</div>
        <h2 style={{ color: '#e2e8f0', fontWeight: 'bold', fontSize: '1.5rem', marginBottom: '0.4rem' }}>
          Your Weakness Report
        </h2>
        <p style={{ color: platformColor, fontSize: '0.85rem' }}>
          {platformLabel} · {username} · {total} games analyzed
        </p>
      </div>

      {totalMissed === 0 ? (
        <div style={{
          backgroundColor: '#1a1a2e',
          border: '1px solid #2e3a5c',
          borderRadius: '12px',
          padding: '2rem',
          textAlign: 'center',
          marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏆</div>
          <p style={{ color: '#94a3b8' }}>
            No missed tactics detected in the analyzed games. Your recent play looks solid!
          </p>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            (Analysis uses heuristic detection — Stockfish analysis would be more precise)
          </p>
        </div>
      ) : (
        <>
          {/* Summary sentence */}
          <div style={{
            backgroundColor: '#13132b',
            border: '1px solid #2e3a5c',
            borderRadius: '12px',
            padding: '1rem 1.5rem',
            marginBottom: '1.5rem',
            color: '#94a3b8',
            fontSize: '0.95rem',
            lineHeight: 1.6,
          }}>
            You missed{' '}
            {sorted.slice(0, 3).map(([p, c], i) => (
              <span key={p}>
                <strong style={{ color: '#e2e8f0' }}>{p}</strong> opportunities{' '}
                <strong style={{ color: '#ef4444' }}>{c} time{c !== 1 ? 's' : ''}</strong>
                {i < Math.min(sorted.length, 3) - 1 ? ', ' : ''}
              </span>
            ))}
            {sorted.length > 3 && ', and more'}. Your custom queue will drill these patterns.
          </div>

          {/* Bar chart */}
          <div style={{
            backgroundColor: '#1a1a2e',
            border: '1px solid #2e3a5c',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1rem' }}>
              Missed Tactics by Pattern
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {sorted.map(([pattern, count]) => (
                <div key={pattern}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>{pattern}</span>
                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{count} missed</span>
                  </div>
                  <div style={{ backgroundColor: '#0f0f1a', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      backgroundColor: count === maxMiss ? '#ef4444' : count >= maxMiss * 0.6 ? '#f97316' : '#4ade80',
                      borderRadius: '999px',
                      width: `${(count / maxMiss) * 100}%`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Queue info */}
      <div style={{
        backgroundColor: '#0d1f16',
        border: '1px solid #166534',
        borderRadius: '12px',
        padding: '1rem 1.5rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ color: '#4ade80', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            ✅ Custom Queue Ready — {customQueue.length} Puzzles
          </div>
          <div style={{ color: '#6b9e7a', fontSize: '0.85rem' }}>
            Weighted by your miss frequency. Queue saved to your device.
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={onStartTraining}
          disabled={customQueue.length === 0}
          style={{
            flex: 1,
            backgroundColor: customQueue.length > 0 ? '#4ade80' : '#1e3a2e',
            color: customQueue.length > 0 ? '#0f0f1a' : '#2e5a3e',
            border: 'none',
            borderRadius: '10px',
            padding: '1rem',
            fontWeight: 'bold',
            fontSize: '1rem',
            cursor: customQueue.length > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          🎯 Start Custom Training
        </button>
        <button
          onClick={onReanalyze}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #2e3a5c',
            borderRadius: '10px',
            padding: '1rem',
            color: '#94a3b8',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            minWidth: '140px',
          }}
        >
          🔄 Re-analyze
        </button>
      </div>

      <p style={{ color: '#475569', fontSize: '0.75rem', marginTop: '1.5rem', textAlign: 'center' }}>
        Analysis uses pattern-detection heuristics. For deeper analysis, Stockfish integration is on the roadmap.
      </p>
    </div>
  );
}

// ── Custom Queue Puzzle Mode ────────────────────────────────────────────────

function CustomQueueTraining({ onBack }: { onBack: () => void }) {
  const [puzzleIds, setPuzzleIds] = useState<string[]>([]);
  const [generatedPuzzles, setGeneratedPuzzles] = useState<GeneratedCustomPuzzle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const queue = JSON.parse(localStorage.getItem(CUSTOM_QUEUE_KEY) || '[]') as string[];
      const generated = JSON.parse(localStorage.getItem(CUSTOM_GENERATED_PUZZLES_KEY) || '[]') as GeneratedCustomPuzzle[];
      setPuzzleIds(queue);
      setGeneratedPuzzles(Array.isArray(generated) ? generated : []);
    } catch {
      setPuzzleIds([]);
      setGeneratedPuzzles([]);
    }
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  const totalPuzzles = generatedPuzzles.length || puzzleIds.length;

  if (totalPuzzles === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: '#94a3b8' }}>No custom queue found. Please analyze your games first.</p>
        <button onClick={onBack} style={{ marginTop: '1rem', backgroundColor: '#4ade80', color: '#0f0f1a', border: 'none', borderRadius: '8px', padding: '0.75rem 1.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
          ← Back
        </button>
      </div>
    );
  }

  const currentId = puzzleIds[currentIndex];
  const currentGeneratedPuzzle = generatedPuzzles[currentIndex];
  const handleNext = () => {
    if (currentIndex < totalPuzzles - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      onBack();
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={onBack}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #2e3a5c',
            borderRadius: '8px',
            padding: '0.5rem 1rem',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          ← Back to Results
        </button>
        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          Custom Queue · Puzzle {currentIndex + 1} of {totalPuzzles}
        </div>
        <div style={{
          backgroundColor: '#0d1f16',
          border: '1px solid #166534',
          borderRadius: '999px',
          padding: '0.25rem 0.75rem',
          color: '#4ade80',
          fontSize: '0.75rem',
          fontWeight: 'bold',
        }}>
          🎯 Personalized
        </div>
      </div>

      <CustomQueuePuzzleBoard
        puzzleId={currentId}
        generatedPuzzle={currentGeneratedPuzzle}
        onNext={handleNext}
        puzzleIndex={currentIndex + 1}
        totalPuzzles={totalPuzzles}
      />
    </div>
  );
}

// ── Single puzzle board for custom queue (uses lichess cached puzzles) ──────

function CustomQueuePuzzleBoard({
  puzzleId,
  generatedPuzzle,
  onNext,
  puzzleIndex,
  totalPuzzles,
}: {
  puzzleId?: string;
  generatedPuzzle?: GeneratedCustomPuzzle;
  onNext: () => void;
  puzzleIndex: number;
  totalPuzzles: number;
}) {
  const [puzzle, setPuzzle] = useState<{
    id?: string;
    fen: string;
    moves: string[];
    rating: number;
    themes: string[];
    sourceGame?: number;
    sourceType?: 'generated';
  } | null>(generatedPuzzle ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (generatedPuzzle) {
      setPuzzle(generatedPuzzle);
      setLoading(false);
      return;
    }

    if (!puzzleId) {
      setPuzzle(null);
      setError('Puzzle not found in local database.');
      setLoading(false);
      return;
    }

    import('@/data/lichess-puzzles').then(({ cachedPuzzlesByTheme }) => {
      let found = null;
      for (const puzzles of Object.values(cachedPuzzlesByTheme)) {
        const p = puzzles.find(x => x.id === puzzleId);
        if (p) { found = p; break; }
      }
      if (found) {
        setPuzzle(found);
      } else {
        setError('Puzzle not found in local database.');
      }
      setLoading(false);
    });
  }, [generatedPuzzle, puzzleId]);

  if (loading) return <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>Loading puzzle...</div>;
  if (error || !puzzle) return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error || 'Failed to load puzzle.'}</p>
      <button onClick={onNext} style={{ backgroundColor: '#4ade80', color: '#0f0f1a', border: 'none', borderRadius: '8px', padding: '0.75rem 1.5rem', fontWeight: 'bold', cursor: 'pointer' }}>Next Puzzle →</button>
    </div>
  );

  return (
    <CustomPuzzleSolver
      fen={puzzle.fen}
      moves={puzzle.moves}
      rating={puzzle.rating}
      themes={puzzle.themes}
      puzzleId={puzzle?.id || puzzleId || 'custom-generated'}
      puzzleIndex={puzzleIndex}
      totalPuzzles={totalPuzzles}
      onNext={onNext}
    />
  );
}

// ── Puzzle solver (interactive board) ─────────────────────────────────────

// ── Puzzle solver (interactive board) ─────────────────────────────────────
// Reuses TacticBoard for identical UI/UX with Training section

function CustomPuzzleSolver({
  fen: initialFen,
  moves,
  rating,
  themes,
  puzzleId,
  puzzleIndex,
  totalPuzzles,
  onNext,
}: {
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  puzzleId: string;
  puzzleIndex: number;
  totalPuzzles: number;
  onNext: () => void;
}) {
  // Apply first move (opponent's) to get actual puzzle start
  const { startFen, solution, firstTheme } = (() => {
    if (!moves || moves.length < 2 || puzzleId.startsWith('custom-')) return { startFen: initialFen, solution: moves, firstTheme: themes[0] || 'Custom' };
    try {
      const chess = new Chess(initialFen);
      const m = moves[0];
      chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.length === 5 ? m[4] : undefined });
      return { startFen: chess.fen(), solution: moves.slice(1), firstTheme: themes[0] || 'Custom' };
    } catch {
      return { startFen: initialFen, solution: moves, firstTheme: themes[0] || 'Custom' };
    }
  })();

  // Track if we've advanced to next puzzle already
  const advancedRef = useRef(false);

  // Map to TacticBoard props
  const puzzleData: TacticBoardProps['puzzleData'] = {
    fen: startFen,
    solution: solution,
    rating: rating,
    theme: firstTheme,
  };

  const handleResult = useCallback((correct: boolean) => {
    // TacticBoard handles the result; we don't need to do anything here
  }, []);

  const handleAdvance = useCallback(() => {
    // Only advance once
    if (!advancedRef.current) {
      advancedRef.current = true;
      onNext();
    }
  }, [onNext]);

  const handleRetry = useCallback(() => {
    // TacticBoard's retry resets the puzzle; we don't advance
    advancedRef.current = false;
  }, []);

  return (
    <TacticBoard
      puzzleData={puzzleData}
      onResult={handleResult}
      onAdvance={handleAdvance}
      onRetry={handleRetry}
    />
  );
}

// ── Main CustomPuzzles component ────────────────────────────────────────────

interface CustomPuzzlesProps {
  onTrainingStateChange?: (training: boolean) => void;
}

export default function CustomPuzzles({ onTrainingStateChange }: CustomPuzzlesProps = {}) {
  const [isPro, setIsPro] = useState(false);
  const [pageState, setPageState] = useState<PageState>('connect');
  const [training, setTraining] = useState(false);
  const [platform, setPlatform] = useState<Platform>('chesscom');
  const [username, setUsername] = useState('');
  const [progress, setProgress] = useState(0);
  const [totalGames, setTotalGames] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null);
  const cancelRef = useRef(false);

  // Notify parent when training state changes
  useEffect(() => {
    onTrainingStateChange?.(training);
  }, [training, onTrainingStateChange]);

  useEffect(() => {
    setIsPro(isProUser());
    
    // Load any existing analysis - check multiple sources
    const loadAnalysis = async () => {
      try {
        // First, check if Custom Puzzles already has cached analysis
        const customStored = JSON.parse(localStorage.getItem(CUSTOM_ANALYSIS_KEY) || 'null') as StoredAnalysis | null;
        if (customStored) {
          setAnalysis(customStored);
          setPageState('results');
          const storedUsername = localStorage.getItem(CUSTOM_USERNAME_KEY) ?? '';
          const storedPlatform = (localStorage.getItem(CUSTOM_PLATFORM_KEY) ?? 'chesscom') as Platform;
          setUsername(storedUsername);
          setPlatform(storedPlatform);
          return;
        }

        // Second, check if user connected during onboarding (Training Plan analysis exists)
        const gameAnalysisRaw = localStorage.getItem('ctt_game_analysis');
        const storedUsername = localStorage.getItem('ctt_custom_username') || localStorage.getItem('ctt_username') || '';
        const storedPlatform = (localStorage.getItem('ctt_custom_platform') || localStorage.getItem('ctt_platform') || 'chesscom') as Platform;

        if (gameAnalysisRaw && storedUsername) {
          try {
            const gameAnalysis: StoredGameAnalysis = JSON.parse(gameAnalysisRaw);
            
            // Validate that analysis has actual data
            console.log('[CustomPuzzles] ctt_game_analysis:', {
              gameCount: gameAnalysis.gameCount,
              weaknesses: gameAnalysis.weaknesses?.length,
              missedTactics: gameAnalysis.missedTactics?.length,
            });

            // If analysis is empty or stale (0 games), re-run fresh analysis instead of showing empty results
            if (!gameAnalysis.gameCount || gameAnalysis.gameCount === 0 || !gameAnalysis.weaknesses?.length) {
              console.log('[CustomPuzzles] Analysis data is empty/stale, re-running fresh analysis');
              // Fall through to trigger fresh runAnalysis below
              setUsername(storedUsername);
              setPlatform(storedPlatform);
              // We'll let the outer catch trigger, then the code below will re-run analysis
              throw new Error('Empty analysis data - re-running');
            }
            
            // Build missedByPattern from shared analysis - with fallback to missedTactics
            let missedByPattern: Record<string, number> = {};
            
            // Primary: use weaknesses if available
            if (gameAnalysis.weaknesses?.length) {
              missedByPattern = gameAnalysis.weaknesses.reduce((acc, w) => {
                acc[w.pattern] = w.count || 0;
                return acc;
              }, {} as Record<string, number>);
            }
            
            // Fallback: build from missedTactics if weaknesses are empty
            if (Object.keys(missedByPattern).length === 0 && gameAnalysis.missedTactics?.length) {
              console.log('[CustomPuzzles] Using fallback: building missedByPattern from missedTactics');
              for (const t of gameAnalysis.missedTactics) {
                missedByPattern[t.pattern] = (missedByPattern[t.pattern] || 0) + 1;
              }
            }

            // Only proceed if we have actual weakness data
            if (Object.keys(missedByPattern).length === 0) {
              console.log('[CustomPuzzles] No weakness data found even with fallback, re-running analysis');
              throw new Error('No weakness data - re-running analysis');
            }

            // Build custom queue from existing analysis
            let customQueue: string[] = [];
            try {
              customQueue = await buildCustomQueue(missedByPattern);
            } catch {
              customQueue = [];
            }

            // Create analysis result from shared data
            const result: StoredAnalysis = {
              missedByPattern,
              total: gameAnalysis.gameCount || 0,
              platform: storedPlatform,
              username: storedUsername,
              analyzedAt: gameAnalysis.analyzedAt || new Date().toISOString(),
              customQueue,
              generatedCount: 0,
              generationMode: 'fallback',
            };

            // Save for future use
            try {
              localStorage.setItem(CUSTOM_ANALYSIS_KEY, JSON.stringify(result));
              localStorage.setItem(CUSTOM_QUEUE_KEY, JSON.stringify(customQueue));
              localStorage.setItem(CUSTOM_USERNAME_KEY, storedUsername);
              localStorage.setItem(CUSTOM_PLATFORM_KEY, storedPlatform);
            } catch {
              // ignore storage errors
            }

            setAnalysis(result);
            setUsername(storedUsername);
            setPlatform(storedPlatform);
            setPageState('results');
            return;
          } catch (err) {
            // If parsing, validation, or queue building fails, try fresh analysis if we have username
            console.log('[CustomPuzzles] Analysis loading failed:', err instanceof Error ? err.message : err);
            if (storedUsername) {
              console.log('[CustomPuzzles] Attempting fresh analysis for', storedUsername);
              // Trigger fresh analysis with stored credentials
              setUsername(storedUsername);
              setPlatform(storedPlatform);
              setPageState('analyzing');
              setStatusMsg('Analyzing your games...');
              try {
                await runGameAnalysis(storedUsername, storedPlatform);
                // After analysis completes, reload
                setTimeout(() => loadAnalysis(), 500);
              } catch (analysisErr) {
                console.error('[CustomPuzzles] Fresh analysis failed:', analysisErr);
                // Fall through to connect screen
              }
              return;
            }
            // If no stored username, continue to connect screen
          }
        }
      } catch {
        // ignore
      }
    };

    loadAnalysis();
  }, []);

  const runAnalysis = useCallback(async (plat: Platform, uname: string) => {
    cancelRef.current = false;
    setPlatform(plat);
    setUsername(uname);
    setPageState('analyzing');
    setAnalysisError(null);
    setProgress(0);
    setTotalGames(0);
    setStatusMsg('Fetching your games...');

    try {
      // Use the shared game analysis pipeline from lib/game-analysis.ts
      setStatusMsg('Analyzing your games...');
      await runGameAnalysis(uname, plat);

      if (cancelRef.current) return;

      // Read the results from localStorage where runGameAnalysis wrote them
      const gameAnalysisRaw = localStorage.getItem('ctt_game_analysis');
      if (!gameAnalysisRaw) {
        setAnalysisError('No analysis results. Please check your username and try again.');
        return;
      }

      const gameAnalysis: StoredGameAnalysis = JSON.parse(gameAnalysisRaw);
      
      // Build missedByPattern from weaknesses (patterns where user is weakest)
      const missedByPattern = gameAnalysis.weaknesses?.reduce((acc, w) => {
        acc[w.pattern] = w.count || 0;
        return acc;
      }, {} as Record<string, number>) || {};

      if (cancelRef.current) return;

      // Extract missed tactics for Stockfish generation (limit to first 12)
      // Convert from the shared format to the custom puzzle format
      const missedTactics = (gameAnalysis.missedTactics?.slice(0, 12) ?? []).map((mt, idx) => ({
        pattern: mt.pattern,
        fen: mt.fen,
        moveNumber: mt.moveNumber ?? idx,
        gameIndex: idx,
      }));
      
      let generatedPuzzles: GeneratedCustomPuzzle[] = [];
      let customQueue: string[] = [];
      let generationMode: 'stockfish' | 'fallback' = 'stockfish';

      try {
        setStatusMsg(`Loading Stockfish engine...`);
        const { generateCustomPuzzlesFromMissedTactics } = await import("@/lib/custom-puzzle-generator");
        
        // Race Stockfish generation against a 30-second overall timeout
        const timeoutPromise = new Promise<GeneratedCustomPuzzle[]>((_, reject) => 
          setTimeout(() => reject(new Error('Stockfish generation timed out after 30s')), 30000)
        );
        
        const generatePromise = generateCustomPuzzlesFromMissedTactics(missedTactics, {
          onProgress: ({ completed, total, generated, currentPattern, puzzles }) => {
            setStatusMsg(`Building custom puzzles... (${completed}/${total} complete${currentPattern ? ` · ${currentPattern}` : ''} · ${generated} puzzles ready)`);
            try {
              localStorage.setItem(CUSTOM_GENERATED_PUZZLES_KEY, JSON.stringify(puzzles));
              localStorage.setItem(CUSTOM_QUEUE_KEY, JSON.stringify(puzzles.map((p) => p.id)));
            } catch {
              // ignore storage errors during progressive generation
            }
          },
        });
        
        generatedPuzzles = await Promise.race([generatePromise, timeoutPromise]);
      } catch (err) {
        console.warn('[CustomPuzzles] Stockfish generation failed, falling back:', err);
        generatedPuzzles = [];
      }

      if (generatedPuzzles.length === 0) {
        generationMode = 'fallback';
        setStatusMsg('Stockfish unavailable — building fallback custom queue...');
        customQueue = await buildCustomQueue(missedByPattern);
      } else {
        customQueue = generatedPuzzles.map((p) => p.id);
      }

      const result: StoredAnalysis = {
        missedByPattern,
        total: gameAnalysis.gameCount || 0,
        platform: plat,
        username: uname,
        analyzedAt: new Date().toISOString(),
        customQueue,
        generatedCount: generatedPuzzles.length,
        generationMode,
      };

      try {
        localStorage.setItem(CUSTOM_ANALYSIS_KEY, JSON.stringify(result));
        localStorage.setItem(CUSTOM_QUEUE_KEY, JSON.stringify(customQueue));
        localStorage.setItem(CUSTOM_GENERATED_PUZZLES_KEY, JSON.stringify(generatedPuzzles));
        localStorage.setItem(CUSTOM_USERNAME_KEY, uname);
        localStorage.setItem(CUSTOM_PLATFORM_KEY, plat);
      } catch {
        // ignore storage errors
      }

      setAnalysis(result);
      setPageState('results');
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Failed to analyze games.');
      return;
    }
  }, []);

  const handleConnect = useCallback((plat: Platform, uname: string) => {
    runAnalysis(plat, uname);
  }, [runAnalysis]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setPageState('connect');
    setAnalysisError(null);
  }, []);

  const handleReanalyze = useCallback(() => {
    setAnalysis(null);
    setPageState('connect');
    try {
      localStorage.removeItem(CUSTOM_ANALYSIS_KEY);
      localStorage.removeItem(CUSTOM_QUEUE_KEY);
      localStorage.removeItem(CUSTOM_GENERATED_PUZZLES_KEY);
    } catch { /**/ }
  }, []);

  const handleStartTraining = useCallback(() => {
    setTraining(true);
  }, []);

  const handleBackFromTraining = useCallback(() => {
    setTraining(false);
    // Reload analysis in case queue was consumed
    try {
      const stored = JSON.parse(localStorage.getItem(CUSTOM_ANALYSIS_KEY) || 'null') as StoredAnalysis | null;
      if (stored) setAnalysis(stored);
    } catch { /**/ }
  }, []);

  if (!isPro) return <UpgradePrompt />;

  if (training) return <CustomQueueTraining onBack={handleBackFromTraining} />;

  return (
    <div>
      {pageState === 'connect' && (
        <ConnectState onConnect={handleConnect} />
      )}
      {pageState === 'analyzing' && (
        <AnalyzingState
          platform={platform}
          username={username}
          progress={progress}
          total={totalGames}
          statusMsg={statusMsg}
          error={analysisError}
          onCancel={handleCancel}
        />
      )}
      {pageState === 'results' && analysis && (
        <ResultsState
          analysis={analysis}
          onStartTraining={handleStartTraining}
          onReanalyze={handleReanalyze}
        />
      )}
    </div>
  );
}
