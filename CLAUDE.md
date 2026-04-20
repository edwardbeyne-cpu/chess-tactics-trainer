# Chess Tactics Trainer — Developer Context

## Overview
Next.js web app for chess improvement through personalized tactical training. Live at chesstacticstrainer.com. Deployed on Vercel.

## Tech Stack
- **Framework:** Next.js 15 (App Router, `"use client"` components)
- **Language:** TypeScript
- **Chess logic:** chess.js
- **Board rendering:** react-chessboard (ChessBoard component)
- **Engine:** Stockfish WASM (client-side, lazy-loaded)
- **Styling:** Inline styles (dark theme, no CSS framework)
- **State:** localStorage only — no database, no user accounts
- **Deployment:** Vercel (`vercel --prod --yes` — does NOT auto-deploy from GitHub)

## Key Architecture Decisions
- **Client-side only** — all analysis, storage, and puzzle logic runs in the browser
- **localStorage for everything** — user data, mastery progress, analysis results, settings
- **No backend** — Chess.com/Lichess APIs called directly from client
- **Lazy-load lichess-puzzles via `lib/puzzle-data.ts`** — `data/lichess-puzzles.ts` is ~416KB. NEVER import its data exports (`cachedPuzzlesByTheme`, `PATTERN_PUZZLE_COUNTS`, `PUZZLES_PER_PATTERN`) at the top level. Use `usePuzzleData()` in render code or `await loadPuzzleData()` in async functions. Type-only imports (`import type { LichessCachedPuzzle }`) are fine.
- **Quota-aware storage** — Use `safeSetItem` from `@/lib/safe-storage` instead of `localStorage.setItem`. It catches `QuotaExceededError`, prunes unbounded keys (`ctt_sm2_attempts`, `ctt_activity_log`, `ctt_puzzle_times`, `ctt_personal_puzzles`), and retries.
- **Chess.com / Lichess API proxy** — Use `lib/chess-api.ts` (`chesscom.stats(u)`, `lichess.user(u)`, etc.) instead of fetching `api.chess.com` / `lichess.org` directly. The proxy at `/api/chess` adds Vercel edge caching (`s-maxage` 5min–6hr).

## Critical Gotchas
1. **Vercel deployment** — Run `vercel --prod --yes` manually after each push. No auto-deploy.
2. **Object.entries/Object.values** — Always null-guard: `Object.entries(data ?? {})`. localStorage data can be null/malformed.
3. **Chess.com API** — Usernames must be `.toLowerCase()`. Don't use `User-Agent` header (mobile Safari blocks it). Prefer `lib/chess-api.ts` over direct fetches.
4. **SSR guards** — Many functions need `if (typeof window === "undefined") return` guards since components are `"use client"` but may still SSR.
5. **useState initialization from localStorage** — Use lazy initializer `useState(() => { if (typeof window === "undefined") return default; return readFromLocalStorage(); })` to avoid hydration mismatches and paywall flashes.

## Project Structure
```
app/                          # Next.js App Router pages
  app/                        # Main app routes (behind nav)
    training-plan/            # Training Plan dashboard
    training/                 # Active puzzle training session
    patterns/                 # Drill Tactics (by pattern)
    custom-puzzles/           # Custom Puzzles (Pro feature)
    threat-detection/         # Threat Detection training
    calibration/              # Onboarding calibration flow
    tools/                    # Tools page (CCT Trainer, etc.)
    settings/                 # User settings
    debug/                    # Debug page (beta testers only)
  beta/                       # Beta access URL (auto-unlocks Pro)
  free/                       # Free tier testing URL
  pricing/                    # Pricing page

components/
  TrainingPlan.tsx            # Training Plan dashboard (large file)
  TrainingSession.tsx         # Puzzle training with TacticBoard (large file, exports TacticBoard)
  CustomPuzzles.tsx           # Custom Puzzles feature (Pro)
  ThreatDetection.tsx         # Threat Detection training
  CalibrationFlow.tsx         # Onboarding calibration
  ChessBoard.tsx              # Board rendering wrapper
  StockfishAnalysis.tsx       # Stockfish analysis overlay
  AppNav.tsx                  # Navigation bar
  Puzzle.tsx                  # Drill Tactics puzzle component

lib/
  storage.ts                  # All localStorage helpers (large file)
  game-analysis.ts            # Canonical game analysis pipeline (shared by Training Plan + Custom Puzzles)
  custom-puzzle-generator.ts  # Stockfish WASM puzzle generation
  threat-puzzles.ts           # Threat Detection puzzle inversion
  beta.ts                     # Beta access utilities
  percentile.ts               # Rating percentile calculations

data/
  lichess-puzzles.ts          # Cached Lichess puzzle database (~3MB, LAZY LOAD ONLY)

public/
  stockfish/                  # Stockfish WASM files
```

## Key Components

### TacticBoard (TrainingSession.tsx)
The main puzzle-solving component. Exported and reused by Custom Puzzles. Includes:
- Chess board with move validation
- CCT sidebar (Checks/Captures/Threats)
- Analyze with Engine button
- Puzzle Settings
- Timer support

### Mastery System
- 1 correct solve under 10 seconds = 1 mastery hit
- Wrong answer resets mastery progress to 0
- Puzzles served in daily batches based on daily goal setting
- Training and Custom Puzzles have SEPARATE mastery sets

### Game Analysis Pipeline (lib/game-analysis.ts)
- Fetches games from Chess.com/Lichess
- Detects missed tactics using chess.js heuristics
- Writes to `ctt_game_analysis` localStorage key
- Used by BOTH Training Plan and Custom Puzzles (do not duplicate)

## localStorage Keys (important ones)
- `ctt_game_analysis` — canonical game analysis results
- `ctt_custom_analysis` — Custom Puzzles analysis cache
- `ctt_calibration_rating` — user's calibration rating
- `ctt_sub_tier` — "0" (free), "1" (improver), "2" (pro/serious)
- `ctt_beta_tester` — "true" for beta users
- `ctt_mastery_progress` — Training mastery sets
- `ctt_custom_mastery_set` — Custom Puzzles mastery set
- `ctt_threat_detection_progress` — Threat Detection stats
- `ctt_puzzle_settings` — timer, CCT mode settings

## Feature Tiers
- **Free:** Training Plan, Training, Drill Tactics, Threat Detection
- **Pro:** Custom Puzzles, advanced analytics
- **Beta:** `/beta` URL auto-unlocks Pro + shows beta badge

## Eddy's Chess.com
- Username: Eddy0302 (lowercase: eddy0302)
- Ratings: Bullet ~813, Blitz ~1073, Rapid ~1313
