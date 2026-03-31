#!/usr/bin/env node
/**
 * Filter lichess-puzzles.ts to only include puzzles where the target pattern
 * is in a PRIMARY position (themes[0], themes[1], or themes[2]).
 *
 * Fallback rule (from task spec):
 *   If fewer than 50 puzzles would remain after filtering → keep ALL puzzles
 *   for that pattern (don't discard the pattern entirely).
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../data/lichess-puzzles.ts');
const content = fs.readFileSync(DB_FILE, 'utf8');
const lines = content.split('\n');

const PATTERNS = [
  'fork','pin','skewer','discoveredAttack','backRankMate','smotheredMate',
  'deflection','interference','overloading','zugzwang','attraction','clearance',
  'trappedPiece','doubleCheck','discoveredCheck','kingsideAttack','queensideAttack'
];

const PRIMARY_THRESHOLD = 50; // keep all if filtered result < this

// ── Parse puzzles per pattern ────────────────────────────────────────────────
let currentPattern = null;
const puzzlesByPattern = {};
for (const p of PATTERNS) puzzlesByPattern[p] = [];

for (const line of lines) {
  for (const p of PATTERNS) {
    if (line.includes(`"${p}": [`)) { currentPattern = p; break; }
  }
  if (currentPattern && line.includes('{ id:')) {
    puzzlesByPattern[currentPattern].push(line);
  }
}

// ── Filter each pattern ──────────────────────────────────────────────────────
const stats = {};
const filtered = {};
const notes = [];

for (const pattern of PATTERNS) {
  const original = puzzlesByPattern[pattern];
  const before = original.length;

  // Apply pos 0-2 filter
  const primaryFiltered = original.filter(line => {
    const m = line.match(/themes:\s*\[([^\]]+)\]/);
    if (!m) return false;
    const themes = (m[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ''));
    const idx = themes.indexOf(pattern);
    return idx >= 0 && idx <= 2;
  });

  let final;
  let usedFallback = false;

  if (primaryFiltered.length < PRIMARY_THRESHOLD) {
    // Fallback: keep all original puzzles
    final = [...original];
    usedFallback = true;
    if (primaryFiltered.length === 0) {
      notes.push(`⚠️  ${pattern}: theme NOT FOUND in top-3 of any puzzle — keeping all ${before} (data quality issue)`);
    } else {
      notes.push(`ℹ️  ${pattern}: only ${primaryFiltered.length} puzzles pass pos 0-2 filter (< ${PRIMARY_THRESHOLD}) — keeping all ${before}`);
    }
  } else {
    final = primaryFiltered;
  }

  // Re-sort ascending by rating
  final.sort((a, b) => {
    const rA = parseInt((a.match(/rating:\s*(\d+)/) || [])[1] || '9999', 10);
    const rB = parseInt((b.match(/rating:\s*(\d+)/) || [])[1] || '9999', 10);
    return rA - rB;
  });

  filtered[pattern] = final;
  stats[pattern] = { before, after: final.length, usedFallback };

  const marker = usedFallback ? ' [FALLBACK]' : '';
  console.log(`${pattern.padEnd(20)} before=${String(before).padStart(3)}  after=${String(final.length).padStart(3)}  removed=${String(before - final.length).padStart(3)}${marker}`);
}

// ── Build header ─────────────────────────────────────────────────────────────
const maxCount = Math.max(...Object.values(stats).map(s => s.after));

const header = `// Auto-generated from Lichess puzzle database — Sprint 11 Curriculum
// Source: https://database.lichess.org/lichess_db_puzzle.csv.zst
// Generated: ${new Date().toISOString().slice(0, 10)}
// Filtered: puzzles where target theme is in positions 0-2 of themes[] (primary/secondary)
// Fallback: patterns with <${PRIMARY_THRESHOLD} qualifying puzzles retain all originals

export interface LichessCachedPuzzle {
  id: string;
  fen: string;        // Position where puzzle starts (player to move)
  moves: string[];    // UCI solution moves e.g. ["e2e4", "e7e5"]
  rating: number;
  themes: string[];
}

export const PUZZLES_PER_PATTERN = ${maxCount};

export const cachedPuzzlesByTheme: Record<string, LichessCachedPuzzle[]> = {`;

// ── Reconstruct body ─────────────────────────────────────────────────────────
const patternEntries = PATTERNS.map((pattern, idx) => {
  const isLast = idx === PATTERNS.length - 1;
  return `  "${pattern}": [\n${filtered[pattern].join('\n')}\n  ]${isLast ? '' : ','}`;
});

const output = header + '\n' + patternEntries.join('\n') + '\n};\n';

// Add PATTERN_PUZZLE_COUNTS export after cachedPuzzlesByTheme
const countsObj = Object.fromEntries(PATTERNS.map(p => [p, filtered[p].length]));
const countsJson = JSON.stringify(countsObj, null, 2);
const countsExport = `\n// Per-pattern puzzle counts (use instead of hardcoded ${maxCount})\nexport const PATTERN_PUZZLE_COUNTS: Record<string, number> = ${countsJson};\n`;
const outputWithCounts = output + countsExport;

fs.writeFileSync(DB_FILE, outputWithCounts, 'utf8');

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n── Notes ──────────────────────────────────────────────────────────────');
notes.forEach(n => console.log(n));

const totalBefore = Object.values(stats).reduce((s, v) => s + v.before, 0);
const totalAfter = Object.values(stats).reduce((s, v) => s + v.after, 0);
console.log(`\n── Totals ─────────────────────────────────────────────────────────────`);
console.log(`Before: ${totalBefore}  After: ${totalAfter}  Removed: ${totalBefore - totalAfter}`);
console.log(`PUZZLES_PER_PATTERN = ${maxCount}`);
console.log(`\n✅ Wrote filtered database to ${DB_FILE}`);
