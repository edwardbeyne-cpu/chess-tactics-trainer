/**
 * Visual Scaffolding: compute piece-relationship arrows for a position.
 *
 * Renders translucent overlays that surface the "lines of force" on the
 * board — attackers (red) and defenders (blue) — so an amateur player sees
 * the same chunks an expert sees. Toggleable in puzzle settings.
 *
 * Design notes:
 * - Only renders cross-piece tension where a higher-value piece is hung or
 *   contested. We deliberately don't draw every legal capture (that would
 *   be visual noise) — only meaningful pressure on minor+ pieces.
 * - Defender arrows only appear on pieces that are also attacked, to keep
 *   the focus on tension points.
 */

import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";

export interface ScaffoldArrow {
  from: string;
  to: string;
  brush?: string;
}

const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 100,
};

export function computeScaffoldingArrows(fen: string): ScaffoldArrow[] {
  const arrows: ScaffoldArrow[] = [];
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }

  const board = chess.board();
  const tensionSquares: { sq: Square; piece: { type: PieceSymbol; color: Color } }[] = [];

  // Step 1: collect all minor+ pieces under attack from the opposite color
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.type === "p") continue; // skip pawns to reduce noise
      const opposing: Color = cell.color === "w" ? "b" : "w";
      let attackers: Square[] = [];
      try {
        attackers = chess.attackers(cell.square, opposing);
      } catch { continue; }
      if (attackers.length === 0) continue;
      tensionSquares.push({ sq: cell.square, piece: { type: cell.type, color: cell.color } });

      // Attacker arrows (red): only from pieces of equal-or-lower value
      // (otherwise it's just a normal exchange, not real pressure)
      for (const atkSq of attackers) {
        const atkPiece = chess.get(atkSq);
        if (!atkPiece) continue;
        if (PIECE_VALUE[atkPiece.type] <= PIECE_VALUE[cell.type]) {
          arrows.push({ from: atkSq, to: cell.square, brush: "red" });
        }
      }
    }
  }

  // Step 2: defender arrows on tensioned pieces (blue)
  for (const { sq, piece } of tensionSquares) {
    let defenders: Square[] = [];
    try {
      defenders = chess.attackers(sq, piece.color);
    } catch { continue; }
    for (const defSq of defenders) {
      arrows.push({ from: defSq, to: sq, brush: "blue" });
    }
  }

  // Cap to avoid extreme noise on busy positions
  return arrows.slice(0, 24);
}
