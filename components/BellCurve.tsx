"use client";

import { getBellCurvePoints } from "@/lib/percentile";

interface BellCurveProps {
  patternName: string;
  userSolveRate: number;  // 0-1
  percentile: number;     // 1-99
  width?: number;
  height?: number;
}

/**
 * Sprint 8 — Bell curve visualization (pure SVG, no extra library).
 * Shows community distribution with user's position marked.
 */
export default function BellCurve({
  patternName,
  userSolveRate,
  percentile,
  width = 320,
  height = 120,
}: BellCurveProps) {
  const data = getBellCurvePoints(patternName, userSolveRate);
  if (!data) return null;

  const { curve, userX, userY, mean } = data;

  // SVG layout
  const padL = 12;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  // Map normalized 0-1 coords to SVG pixels
  const toSvgX = (nx: number) => padL + nx * chartW;
  const toSvgY = (ny: number) => padT + (1 - ny) * chartH;

  // Build SVG path for the full curve
  const pathPoints = curve.map((pt, i) => {
    const x = toSvgX(pt.x);
    const y = toSvgY(pt.y);
    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  });
  const curvePath = pathPoints.join(" ");

  // Filled area under curve (left of user)
  const userSvgX = toSvgX(userX);
  const baselineY = toSvgY(0);
  const fillPoints = curve
    .filter((pt) => pt.x <= userX)
    .map((pt) => `${toSvgX(pt.x)},${toSvgY(pt.y)}`);

  // Close the fill path at baseline
  const fillPath =
    fillPoints.length > 0
      ? `M ${toSvgX(curve.find((p) => p.x <= userX)?.x ?? 0)} ${baselineY} L ${fillPoints.join(" L ")} L ${userSvgX} ${baselineY} Z`
      : "";

  // Mean marker x
  const meanSvgX = toSvgX(mean);
  const userSvgY = toSvgY(userY);

  const isAboveMean = userSolveRate >= 0;
  const userColor = percentile >= 75 ? "#4ade80" : percentile >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ position: "relative" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block" }}
        aria-label={`Bell curve showing you're better than ${percentile}% of players`}
      >
        <defs>
          <linearGradient id={`fill-grad-${patternName.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={userColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={userColor} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Baseline */}
        <line
          x1={padL}
          y1={baselineY}
          x2={padL + chartW}
          y2={baselineY}
          stroke="#2e3a5c"
          strokeWidth="1"
        />

        {/* Fill area — user's portion of distribution */}
        {fillPath && (
          <path
            d={fillPath}
            fill={`url(#fill-grad-${patternName.replace(/\s+/g, "")})`}
          />
        )}

        {/* Bell curve line */}
        <path
          d={curvePath}
          fill="none"
          stroke="#475569"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Mean marker (dashed vertical line) */}
        <line
          x1={meanSvgX}
          y1={padT}
          x2={meanSvgX}
          y2={baselineY}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
        <text
          x={meanSvgX}
          y={padT + chartH + 14}
          textAnchor="middle"
          fontSize="9"
          fill="#475569"
        >
          avg
        </text>

        {/* User marker — vertical line */}
        <line
          x1={userSvgX}
          y1={padT}
          x2={userSvgX}
          y2={baselineY}
          stroke={userColor}
          strokeWidth="1.5"
        />

        {/* User dot on the curve */}
        <circle cx={userSvgX} cy={userSvgY} r="4" fill={userColor} />

        {/* "You" label */}
        <text
          x={userSvgX + (userX > 0.75 ? -6 : 6)}
          y={Math.max(padT + 10, userSvgY - 8)}
          textAnchor={userX > 0.75 ? "end" : "start"}
          fontSize="9"
          fontWeight="bold"
          fill={userColor}
        >
          You
        </text>

        {/* Percentile label on baseline */}
        <text
          x={userSvgX}
          y={padT + chartH + 14}
          textAnchor={userX > 0.75 ? "end" : "start"}
          fontSize="9"
          fill={userColor}
          fontWeight="bold"
        >
          {isAboveMean ? `Top ${100 - percentile}%` : `${percentile}th`}
        </text>
      </svg>

      {/* Axis labels */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        paddingLeft: `${padL}px`,
        paddingRight: `${padR}px`,
        marginTop: "-4px",
      }}>
        <span style={{ color: "#334155", fontSize: "0.65rem" }}>0%</span>
        <span style={{ color: "#334155", fontSize: "0.65rem" }}>Solve rate</span>
        <span style={{ color: "#334155", fontSize: "0.65rem" }}>100%</span>
      </div>
    </div>
  );
}
