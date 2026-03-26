import type { Metadata } from "next";
import "./globals.css";
import RewardfulScript from "@/components/RewardfulScript";

export const metadata: Metadata = {
  title: "ChessTrainer — Science-Based Tactics Training",
  description:
    "Chess tactics training with spaced repetition — built around your games and your weaknesses. 3M+ Lichess puzzles, 28 tactical patterns, SM-2 algorithm.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <RewardfulScript />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#0f0f1a", color: "#e2e8f0", fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
