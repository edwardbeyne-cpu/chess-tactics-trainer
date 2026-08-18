"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  getTacticsRatingData,
  getPlatformRatingsData,
  getUserSettings,
  type TacticsRatingEntry,
  type PlatformRatingSnapshot,
} from "@/lib/storage";

// ── Chart data merging ────────────────────────────────────────────────────

interface ChartPoint {
  date: string;
  tactics?: number;
  chesscomBlitz?: number;
  lichessRapid?: number;
}

function buildChartData(
  tacticsHistory: TacticsRatingEntry[],
  chesscomHistory: PlatformRatingSnapshot[],
  lichessHistory: PlatformRatingSnapshot[],
  daysLimit: number | null,
  showChesscom: boolean,
  showLichess: boolean
): ChartPoint[] {
  // Collect all dates
  const allDates = new Set<string>();
  tacticsHistory.forEach((h) => allDates.add(h.date));
  if (showChesscom) chesscomHistory.forEach((h) => allDates.add(h.date));
  if (showLichess) lichessHistory.forEach((h) => allDates.add(h.date));

  if (allDates.size === 0) return [];

  // Apply date limit
  let sortedDates = Array.from(allDates).sort();
  if (daysLimit !== null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysLimit);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    sortedDates = sortedDates.filter((d) => d >= cutoffStr);
  }

  // Build lookup maps
  const tacticsMap = new Map(tacticsHistory.map((h) => [h.date, h.rating]));
  const chesscomMap = new Map(chesscomHistory.map((h) => [h.date, h.blitz]));
  const lichessMap = new Map(lichessHistory.map((h) => [h.date, h.rapid]));

  // Forward-fill tactics rating (carry last known value forward)
  let lastTactics: number | undefined;
  let lastChesscom: number | undefined;
  let lastLichess: number | undefined;

  return sortedDates.map((date) => {
    if (tacticsMap.has(date)) lastTactics = tacticsMap.get(date);
    if (showChesscom && chesscomMap.get(date) !== undefined) lastChesscom = chesscomMap.get(date);
    if (showLichess && lichessMap.get(date) !== undefined) lastLichess = lichessMap.get(date);

    const point: ChartPoint = { date };
    if (lastTactics !== undefined) point.tactics = lastTactics;
    if (showChesscom && lastChesscom !== undefined) point.chesscomBlitz = lastChesscom;
    if (showLichess && lastLichess !== undefined) point.lichessRapid = lastLichess;
    return point;
  });
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Custom tooltip ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "8px",
      padding: "0.6rem 0.9rem",
      fontSize: "0.8rem",
    }}>
      <div style={{ color: "#94a3b8", marginBottom: "0.3rem" }}>{label}</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <div key={entry.dataKey} style={{ color: entry.color, display: "flex", gap: "0.5rem" }}>
          <span>{entry.name}:</span>
          <span style={{ fontWeight: "bold" }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Chart Component ──────────────────────────────────────────────────

export default function RatingHistoryChart() {
  const tacticsData = useMemo(() => getTacticsRatingData(), []);
  const platformData = useMemo(() => getPlatformRatingsData(), []);
  const settings = useMemo(() => getUserSettings(), []);

  const showChesscom = settings.trackChesscom && !!settings.chesscomUsername;
  const showLichess = settings.trackLichess && !!settings.lichessUsername;

  const chartData = buildChartData(
    tacticsData.tacticsRatingHistory,
    platformData.chesscom,
    platformData.lichess,
    null,
    showChesscom,
    showLichess
  );

  // Net change across the visible tactics history for the header badge
  const tacticsPoints = chartData.filter((p) => p.tactics !== undefined);
  const netChange = tacticsPoints.length >= 2
    ? (tacticsPoints[tacticsPoints.length - 1].tactics ?? 0) - (tacticsPoints[0].tactics ?? 0)
    : 0;

  if (chartData.length < 2) {
    return (
      <div style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #2e3a5c",
        borderRadius: "12px",
        padding: "1.5rem",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📈</div>
        <div style={{ color: "#e2e8f0", fontWeight: "bold", marginBottom: "0.4rem" }}>Rating History</div>
        <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
          Your tactics rating is recorded once per training day — the chart appears after your second day.
        </div>
      </div>
    );
  }

  // X-axis: show at most ~7 labels
  const tickIndices = chartData.length <= 7
    ? chartData.map((_, i) => i)
    : Array.from({ length: 7 }, (_, i) => Math.floor(i * (chartData.length - 1) / 6));
  const tickDates = new Set(tickIndices.map((i) => chartData[i].date));

  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      border: "1px solid #2e3a5c",
      borderRadius: "12px",
      padding: "1.5rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: "bold", margin: 0 }}>
          📈 Tactics Rating Over Time
        </h2>
        {netChange !== 0 && (
          <span style={{
            color: netChange > 0 ? "#4ade80" : "#ef4444",
            backgroundColor: netChange > 0 ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
            border: `1px solid ${netChange > 0 ? "#1a4a2a" : "#4a1a1a"}`,
            borderRadius: "999px",
            padding: "0.2rem 0.7rem",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}>
            {netChange > 0 ? "+" : ""}{netChange}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3a5c" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#64748b", fontSize: 11 }}
            tickFormatter={(v) => tickDates.has(v) ? shortDate(v) : ""}
            axisLine={{ stroke: "#2e3a5c" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={{ stroke: "#2e3a5c" }}
            tickLine={false}
            width={40}
            domain={["dataMin - 50", "dataMax + 50"]}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "0.75rem", color: "#94a3b8", paddingTop: "0.5rem" }}
          />
          <Line
            type="monotone"
            dataKey="tactics"
            name="Tactics Rating"
            stroke="#4ade80"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, fill: "#4ade80" }}
            connectNulls
          />
          {showChesscom && (
            <Line
              type="monotone"
              dataKey="chesscomBlitz"
              name="Chess.com Blitz"
              stroke="#f59e0b"
              strokeWidth={2}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, fill: "#f59e0b" }}
              connectNulls
            />
          )}
          {showLichess && (
            <Line
              type="monotone"
              dataKey="lichessRapid"
              name="Lichess Rapid"
              stroke="#a855f7"
              strokeWidth={2}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, fill: "#a855f7" }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
