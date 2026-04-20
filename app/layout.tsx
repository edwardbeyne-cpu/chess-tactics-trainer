import type { Metadata, Viewport } from "next";
import "./globals.css";
import RewardfulScript from "@/components/RewardfulScript";
import AppInit from "@/components/AppInit";
import ErrorBoundary from "@/components/ErrorBoundary";

export const viewport: Viewport = {
  themeColor: "#0f1a2e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "ChessTrainer — Science-Based Tactics Training",
  description:
    "Chess tactics training with spaced repetition — built around your games and your weaknesses. 3M+ Lichess puzzles, 28 tactical patterns, SM-2 algorithm.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chess Tactics Trainer",
  },
  icons: {
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
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
        <AppInit />
        <ErrorBoundary scope="root">{children}</ErrorBoundary>
      </body>
    </html>
  );
}
