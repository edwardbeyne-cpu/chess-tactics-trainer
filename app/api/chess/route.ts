// Proxy for Chess.com and Lichess APIs.
// Why: at 100k DAU, direct browser → Chess.com calls hit per-IP rate limits and
// our origin gets blocked. Proxying through Vercel lets the CDN cache responses
// (s-maxage) so repeat requests for the same username are served from edge.
//
// Endpoints:
//   /api/chess?source=chesscom&kind=stats&username=foo
//   /api/chess?source=chesscom&kind=archives&username=foo
//   /api/chess?source=chesscom&kind=archive&url=<archive_url>
//   /api/chess?source=lichess&kind=user&username=foo
//   /api/chess?source=lichess&kind=games&username=foo&max=50
//   /api/chess?source=lichess&kind=puzzle&theme=fork
//   /api/chess?source=lichess&kind=puzzleById&id=abc
//
// Caching: stats/user 1h, archives 6h, games 5min, puzzles no cache (random).

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

interface UpstreamSpec {
  url: string;
  cacheSeconds: number;
  accept?: string;
}

function buildUpstream(params: URLSearchParams): UpstreamSpec | { error: string } {
  const source = params.get("source");
  const kind = params.get("kind");
  const username = params.get("username")?.toLowerCase().trim();

  if (source === "chesscom") {
    if (!username && kind !== "archive") return { error: "username required" };
    switch (kind) {
      case "stats":
        return { url: `https://api.chess.com/pub/player/${encodeURIComponent(username!)}/stats`, cacheSeconds: 3600 };
      case "profile":
        return { url: `https://api.chess.com/pub/player/${encodeURIComponent(username!)}`, cacheSeconds: 3600 };
      case "archives":
        return { url: `https://api.chess.com/pub/player/${encodeURIComponent(username!)}/games/archives`, cacheSeconds: 21600 };
      case "archive": {
        const archiveUrl = params.get("url");
        if (!archiveUrl || !archiveUrl.startsWith("https://api.chess.com/")) {
          return { error: "invalid archive url" };
        }
        return { url: archiveUrl, cacheSeconds: 3600 };
      }
      default:
        return { error: "unknown kind" };
    }
  }

  if (source === "lichess") {
    switch (kind) {
      case "user":
        if (!username) return { error: "username required" };
        return { url: `https://lichess.org/api/user/${encodeURIComponent(username)}`, cacheSeconds: 3600 };
      case "games": {
        if (!username) return { error: "username required" };
        const max = Math.min(parseInt(params.get("max") || "50", 10) || 50, 200);
        const moves = params.get("moves") === "true" ? "true" : "false";
        const pgnInJson = params.get("pgnInJson") === "true" ? "true" : "false";
        return {
          url: `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&moves=${moves}&pgnInJson=${pgnInJson}&clocks=false&evals=false&opening=false`,
          cacheSeconds: 300,
          accept: "application/x-ndjson",
        };
      }
      case "puzzle": {
        const theme = params.get("theme");
        const url = theme
          ? `https://lichess.org/api/puzzle/next?angle=${encodeURIComponent(theme)}`
          : `https://lichess.org/api/puzzle/next`;
        return { url, cacheSeconds: 0 };
      }
      case "puzzleById": {
        const id = params.get("id");
        if (!id) return { error: "id required" };
        return { url: `https://lichess.org/api/puzzle/${encodeURIComponent(id)}`, cacheSeconds: 86400 };
      }
      default:
        return { error: "unknown kind" };
    }
  }

  return { error: "unknown source" };
}

export async function GET(req: NextRequest) {
  const spec = buildUpstream(req.nextUrl.searchParams);
  if ("error" in spec) {
    return NextResponse.json({ error: spec.error }, { status: 400 });
  }

  try {
    const upstream = await fetch(spec.url, {
      headers: {
        Accept: spec.accept ?? "application/json",
      },
      // Let Next.js participate in fetch caching too.
      next: spec.cacheSeconds > 0 ? { revalidate: spec.cacheSeconds } : { revalidate: 0 },
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return new NextResponse(body, {
        status: upstream.status,
        headers: { "Content-Type": upstream.headers.get("Content-Type") || "text/plain" },
      });
    }

    const contentType = upstream.headers.get("Content-Type") || "application/json";
    const body = await upstream.text();
    const cacheControl = spec.cacheSeconds > 0
      ? `public, s-maxage=${spec.cacheSeconds}, stale-while-revalidate=${spec.cacheSeconds * 2}`
      : "no-store";

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "upstream fetch failed", message: String(e) },
      { status: 502 }
    );
  }
}
