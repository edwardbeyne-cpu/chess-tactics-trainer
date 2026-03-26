"use client";

import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { Key, Color } from "chessground/types";
import { Chess } from "chess.js";

interface ChessBoardProps {
  fen: string;
  onMove?: (from: string, to: string) => boolean;
  lastMove?: [string, string];
  highlightSquares?: Record<string, { background?: string; borderRadius?: string }>;
  draggable?: boolean;
  boardWidth?: number;
  orientation?: "white" | "black";
}

function getFen(fen: string): string {
  return fen;
}

function getMovable(fen: string, draggable: boolean) {
  if (!draggable) return { color: undefined as Color | undefined, dests: new Map() };
  
  const chess = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  const moves = chess.moves({ verbose: true });
  
  for (const move of moves) {
    const from = move.from as Key;
    if (!dests.has(from)) dests.set(from, []);
    dests.get(from)!.push(move.to as Key);
  }

  const turn = chess.turn() === "w" ? "white" : "black";
  return { color: turn as Color, dests };
}

export default function ChessBoard({
  fen,
  onMove,
  lastMove,
  draggable = true,
  boardWidth = 480,
  orientation = "white",
}: ChessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const movable = getMovable(fen, draggable);

    const config: Config = {
      fen,
      orientation,
      movable: {
        free: false,
        color: movable.color,
        dests: movable.dests,
        events: {
          after: (orig: Key, dest: Key) => {
            if (onMove) {
              const accepted = onMove(orig, dest);
              if (!accepted && cgRef.current) {
                // Revert to current fen if move rejected
                cgRef.current.set({ fen });
              }
            }
          },
        },
      },
      lastMove: lastMove as [Key, Key] | undefined,
      animation: { enabled: true, duration: 250 },
      draggable: {
        enabled: draggable,
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      premovable: { enabled: false },
    };

    cgRef.current = Chessground(containerRef.current, config);

    return () => {
      cgRef.current?.destroy();
      cgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update board when fen/draggable changes
  useEffect(() => {
    if (!cgRef.current) return;
    const movable = getMovable(fen, draggable);
    cgRef.current.set({
      fen,
      movable: {
        free: false,
        color: movable.color,
        dests: movable.dests,
      },
      lastMove: lastMove as [Key, Key] | undefined,
    });
  }, [fen, draggable, lastMove]);

  return (
    <div
      style={{
        width: boardWidth,
        height: boardWidth,
        position: "relative",
      }}
    >
      {/* Chessground CSS is injected via global styles */}
      <div
        ref={containerRef}
        className="cg-wrap"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
