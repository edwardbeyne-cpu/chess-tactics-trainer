// Client helper for the /api/chess proxy. Use this instead of calling
// api.chess.com or lichess.org directly from the browser — the proxy adds
// edge caching and lets us swap in retries/backoff in one place later.

const PROXY = "/api/chess";

async function proxyFetch(params: Record<string, string>): Promise<Response> {
  const qs = new URLSearchParams(params).toString();
  return fetch(`${PROXY}?${qs}`, { headers: { Accept: "application/json" } });
}

export const chesscom = {
  stats: (username: string) =>
    proxyFetch({ source: "chesscom", kind: "stats", username }),
  profile: (username: string) =>
    proxyFetch({ source: "chesscom", kind: "profile", username }),
  archives: (username: string) =>
    proxyFetch({ source: "chesscom", kind: "archives", username }),
  archive: (url: string) =>
    proxyFetch({ source: "chesscom", kind: "archive", url }),
};

export const lichess = {
  user: (username: string) =>
    proxyFetch({ source: "lichess", kind: "user", username }),
  games: (username: string, opts?: { max?: number; moves?: boolean; pgnInJson?: boolean }) =>
    proxyFetch({
      source: "lichess",
      kind: "games",
      username,
      max: String(opts?.max ?? 50),
      moves: String(opts?.moves ?? false),
      pgnInJson: String(opts?.pgnInJson ?? false),
    }),
  puzzle: (theme?: string) =>
    theme
      ? proxyFetch({ source: "lichess", kind: "puzzle", theme })
      : proxyFetch({ source: "lichess", kind: "puzzle" }),
  puzzleById: (id: string) =>
    proxyFetch({ source: "lichess", kind: "puzzleById", id }),
};
