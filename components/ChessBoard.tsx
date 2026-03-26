"use client";

import { useEffect, useRef, useCallback } from "react";
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

// ── Annotation helpers ─────────────────────────────────────────────────────

type AnnotationColor = "green" | "yellow" | "red";

interface Arrow {
  from: Key;
  to: Key;
  color: AnnotationColor;
}

interface SquareHighlight {
  key: Key;
  color: AnnotationColor;
}

const COLOR_TO_CSS: Record<AnnotationColor, string> = {
  green: "rgba(0, 180, 80, 0.5)",
  yellow: "rgba(230, 190, 0, 0.5)",
  red: "rgba(220, 50, 50, 0.5)",
};

const COLOR_TO_BRUSH: Record<AnnotationColor, string> = {
  green: "green",
  yellow: "yellow",
  red: "red",
};

function getAnnotationColor(e: MouseEvent): AnnotationColor {
  if (e.shiftKey) return "yellow";
  if (e.ctrlKey || e.metaKey) return "red";
  return "green";
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
  const dragStartRef = useRef<Key | null>(null);
  const rightMouseDownRef = useRef<boolean>(false);
  const arrows = useRef<Arrow[]>([]);
  const highlights = useRef<SquareHighlight[]>([]);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // Convert file/rank to square key from mouse position
  const getSquareFromEvent = useCallback((e: MouseEvent): Key | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const fileIndex = Math.floor((x / rect.width) * 8);
    const rankIndex = Math.floor((y / rect.height) * 8);
    if (fileIndex < 0 || fileIndex > 7 || rankIndex < 0 || rankIndex > 7) return null;
    const file = String.fromCharCode(97 + (orientation === "white" ? fileIndex : 7 - fileIndex));
    const rank = String(orientation === "white" ? 8 - rankIndex : rankIndex + 1);
    return (file + rank) as Key;
  }, [orientation]);

  const applyAnnotations = useCallback(() => {
    if (!cgRef.current) return;

    // Apply square highlights via chessground shapes
    const shapes = [
      ...arrows.current.map((a) => ({
        orig: a.from,
        dest: a.to,
        brush: COLOR_TO_BRUSH[a.color],
      })),
      ...highlights.current.map((h) => ({
        orig: h.key,
        brush: COLOR_TO_BRUSH[h.color],
      })),
    ];
    cgRef.current.setShapes(shapes);
  }, []);

  const clearAnnotations = useCallback(() => {
    arrows.current = [];
    highlights.current = [];
    applyAnnotations();
  }, [applyAnnotations]);

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
            if (onMoveRef.current) {
              const accepted = onMoveRef.current(orig, dest);
              if (accepted) {
                // Clear annotations on any move played
                clearAnnotations();
              } else if (cgRef.current) {
                cgRef.current.set({ fen });
              }
            }
          },
        },
      },
      lastMove: lastMove as [Key, Key] | undefined,
      animation: { enabled: true, duration: 250 },
      draggable: { enabled: draggable },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      drawable: {
        enabled: true,
        visible: true,
        defaultSnapToValidMove: true,
        eraseOnClick: false,
        brushes: {
          green: { key: "green", color: COLOR_TO_CSS.green, opacity: 1, lineWidth: 10 },
          yellow: { key: "yellow", color: COLOR_TO_CSS.yellow, opacity: 1, lineWidth: 10 },
          red: { key: "red", color: COLOR_TO_CSS.red, opacity: 1, lineWidth: 10 },
          blue: { key: "blue", color: "#003088", opacity: 1, lineWidth: 10 },
        },
      },
    };

    cgRef.current = Chessground(containerRef.current, config);

    // ── Right-click annotation handling ────────────────────────────────────

    const el = containerRef.current;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      rightMouseDownRef.current = true;
      dragStartRef.current = getSquareFromEvent(e);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      if (!rightMouseDownRef.current) return;
      rightMouseDownRef.current = false;

      const endSquare = getSquareFromEvent(e);
      const startSquare = dragStartRef.current;
      dragStartRef.current = null;

      if (!startSquare || !endSquare) return;

      const color = getAnnotationColor(e);

      if (startSquare === endSquare) {
        // Toggle highlight on square
        const idx = highlights.current.findIndex((h) => h.key === startSquare);
        if (idx >= 0 && highlights.current[idx].color === color) {
          highlights.current.splice(idx, 1);
        } else if (idx >= 0) {
          highlights.current[idx].color = color;
        } else {
          highlights.current.push({ key: startSquare, color });
        }
      } else {
        // Toggle arrow
        const idx = arrows.current.findIndex(
          (a) => a.from === startSquare && a.to === endSquare
        );
        if (idx >= 0 && arrows.current[idx].color === color) {
          arrows.current.splice(idx, 1);
        } else if (idx >= 0) {
          arrows.current[idx].color = color;
        } else {
          arrows.current.push({ from: startSquare, to: endSquare, color });
        }
      }

      applyAnnotations();
    };

    el.addEventListener("contextmenu", handleContextMenu);
    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("mouseup", handleMouseUp);

    return () => {
      el.removeEventListener("contextmenu", handleContextMenu);
      el.removeEventListener("mousedown", handleMouseDown);
      el.removeEventListener("mouseup", handleMouseUp);
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
        userSelect: "none",
      }}
    >
      <div
        ref={containerRef}
        className="cg-wrap"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
