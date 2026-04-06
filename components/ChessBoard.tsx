"use client";

import { useEffect, useRef, useCallback } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { Key, Color } from "chessground/types";
import { Chess } from "chess.js";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";

interface ChessBoardProps {
  fen: string;
  onMove?: (from: string, to: string) => boolean;
  lastMove?: [string, string];
  highlightSquares?: Record<string, { background?: string; borderRadius?: string }>;
  draggable?: boolean;
  boardWidth?: number;
  orientation?: "white" | "black";
  disableAnimation?: boolean;
  showCoordinates?: boolean;
  animateMove?: boolean;  // Whether to animate piece movement
  mode?: "training" | "identification";  // training: moves stay moved; identification: snaps back (CCT)
}

function getMovable(fen: string, draggable: boolean) {
  if (!draggable) return { color: undefined as Color | undefined, dests: new Map(), turnColor: "white" as Color };
  
  const chess = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  const moves = chess.moves({ verbose: true });
  
  for (const move of moves) {
    const from = move.from as Key;
    if (!dests.has(from)) dests.set(from, []);
    dests.get(from)!.push(move.to as Key);
  }

  const turn = chess.turn() === "w" ? "white" : "black";
  return { color: turn as Color, dests, turnColor: turn as Color };
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
  green: "rgba(255, 170, 0, 0.85)",   // bright orange-yellow — pops on green board
  yellow: "rgba(255, 200, 0, 0.85)",  // pure yellow
  red: "rgba(220, 50, 50, 0.85)",     // keep red
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
  disableAnimation = false,
  showCoordinates = true,
  animateMove = true,
  mode = "training",  // "training": moves stay moved; "identification": snaps back (CCT)
}: ChessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);
  const dragStartRef = useRef<Key | null>(null);
  const rightMouseDownRef = useRef<boolean>(false);
  const arrows = useRef<Arrow[]>([]);
  const highlights = useRef<SquareHighlight[]>([]);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const fenRef = useRef(fen);
  fenRef.current = fen;
  const draggableRef = useRef(draggable);
  draggableRef.current = draggable;
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const modeRef = useRef(mode);
  modeRef.current = mode;

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
    const file = String.fromCharCode(97 + (orientationRef.current === "white" ? fileIndex : 7 - fileIndex));
    const rank = String(orientationRef.current === "white" ? 8 - rankIndex : rankIndex + 1);
    return (file + rank) as Key;
  }, []);

  const applyAnnotations = useCallback(() => {
    if (!cgRef.current) return;

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

  // Initialize Chessground
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy any previous instance
    if (cgRef.current) {
      cgRef.current.destroy();
      cgRef.current = null;
    }

    const movable = getMovable(fenRef.current, draggableRef.current);

    const config: Config = {
      fen: fenRef.current,
      orientation: orientationRef.current,
      turnColor: movable.turnColor,
      coordinates: showCoordinates,
      movable: {
        free: false,
        color: movable.color,
        dests: movable.dests,
        events: {
          after: (orig: Key, dest: Key) => {
            if (onMoveRef.current) {
              const accepted = onMoveRef.current(orig, dest);
              
              // CCT identification mode: always reset board after move attempt
              // Training mode: only reset if move was rejected
              if (modeRef.current === "identification") {
                // Identification (CCT Trainer): snap back after every attempt
                if (cgRef.current) {
                  const currentMovable = getMovable(fenRef.current, draggableRef.current);
                  cgRef.current.set({
                    fen: fenRef.current,
                    turnColor: currentMovable.turnColor,
                    movable: {
                      free: false,
                      color: currentMovable.color,
                      dests: currentMovable.dests,
                    },
                  });
                }
                if (accepted) {
                  clearAnnotations();
                }
              } else {
                // Training mode: only reset if move was rejected
                if (!accepted && cgRef.current) {
                  const currentMovable = getMovable(fenRef.current, draggableRef.current);
                  cgRef.current.set({
                    fen: fenRef.current,
                    turnColor: currentMovable.turnColor,
                    movable: {
                      free: false,
                      color: currentMovable.color,
                      dests: currentMovable.dests,
                    },
                  });
                }
                if (accepted) {
                  clearAnnotations();
                }
              }
            }
          },
        },
      },
      lastMove: lastMove as [Key, Key] | undefined,
      animation: { enabled: animateMove, duration: 250 },
      draggable: { enabled: draggableRef.current },
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
        const idx = highlights.current.findIndex((h) => h.key === startSquare);
        if (idx >= 0 && highlights.current[idx].color === color) {
          highlights.current.splice(idx, 1);
        } else if (idx >= 0) {
          highlights.current[idx].color = color;
        } else {
          highlights.current.push({ key: startSquare, color });
        }
      } else {
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
      if (cgRef.current) {
        cgRef.current.destroy();
        cgRef.current = null;
      }
    };
    // Re-initialize on key prop changes (puzzle.id used as key on ChessBoard)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update board when fen/draggable/orientation/lastMove changes
  useEffect(() => {
    if (!cgRef.current) return;
    const movable = getMovable(fen, draggable);
    cgRef.current.set({
      fen,
      orientation,
      turnColor: movable.turnColor,
      movable: {
        free: false,
        color: movable.color,
        dests: movable.dests,
      },
      lastMove: lastMove as [Key, Key] | undefined,
      animation: { enabled: !disableAnimation, duration: 250 },
    });
  }, [fen, draggable, lastMove, orientation, disableAnimation]);

  return (
    <div
      data-fen={fen}
      data-board="chess-tactics-trainer"
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
