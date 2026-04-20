import { safeSetItem } from "@/lib/safe-storage";

// Sprint 23 — Creator Mode Storage
// Manages custom puzzle sets and creator profiles

export interface CreatorSet {
  id: string;
  name: string;
  description: string;
  patterns: string[]; // pattern names in lowercase, e.g. ["fork", "pin"]
  minRating: number;
  maxRating: number;
  puzzleIds: string[];
  shareCode: string;
  createdAt: string; // YYYY-MM-DD
  timesUsed: number;
}

export interface CreatorProfile {
  name: string;
  youtubeUrl: string;
  twitterUrl: string;
  websiteUrl: string;
}

const CREATOR_SETS_KEY = "ctt_creator_sets";
const CREATOR_PROFILE_KEY = "ctt_creator_profile";
const ACTIVE_CREATOR_SET_KEY = "ctt_active_creator_set";

// ─────────────────────────────────────────────────────────────────────────────
// Creator Profile
// ─────────────────────────────────────────────────────────────────────────────

export function getCreatorProfile(): CreatorProfile {
  if (typeof window === "undefined") {
    return { name: "", youtubeUrl: "", twitterUrl: "", websiteUrl: "" };
  }
  try {
    const stored = localStorage.getItem(CREATOR_PROFILE_KEY);
    if (stored) return JSON.parse(stored) as CreatorProfile;
  } catch {
    // ignore
  }
  return { name: "", youtubeUrl: "", twitterUrl: "", websiteUrl: "" };
}

export function saveCreatorProfile(profile: CreatorProfile): void {
  if (typeof window === "undefined") return;
  safeSetItem(CREATOR_PROFILE_KEY, JSON.stringify(profile));
}

// ─────────────────────────────────────────────────────────────────────────────
// Creator Sets
// ─────────────────────────────────────────────────────────────────────────────

export function getCreatorSets(): CreatorSet[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CREATOR_SETS_KEY) || "[]") as CreatorSet[];
  } catch {
    return [];
  }
}

export function saveCreatorSets(sets: CreatorSet[]): void {
  if (typeof window === "undefined") return;
  safeSetItem(CREATOR_SETS_KEY, JSON.stringify(sets));
}

export function addCreatorSet(set: CreatorSet): void {
  const sets = getCreatorSets();
  sets.push(set);
  saveCreatorSets(sets);
}

export function updateCreatorSet(id: string, updates: Partial<CreatorSet>): void {
  const sets = getCreatorSets();
  const idx = sets.findIndex((s) => s.id === id);
  if (idx >= 0) {
    sets[idx] = { ...sets[idx], ...updates };
    saveCreatorSets(sets);
  }
}

export function deleteCreatorSet(id: string): void {
  const sets = getCreatorSets().filter((s) => s.id !== id);
  saveCreatorSets(sets);
}

export function getCreatorSetByCode(shareCode: string): CreatorSet | null {
  const sets = getCreatorSets();
  return sets.find((s) => s.shareCode.toUpperCase() === shareCode.toUpperCase()) ?? null;
}

export function incrementSetTimesUsed(id: string): void {
  updateCreatorSet(id, { timesUsed: (getCreatorSets().find((s) => s.id === id)?.timesUsed ?? 0) + 1 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Creator Set (what user is currently training)
// ─────────────────────────────────────────────────────────────────────────────

export function getActiveCreatorSet(): CreatorSet | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(ACTIVE_CREATOR_SET_KEY);
    if (stored) return JSON.parse(stored) as CreatorSet;
  } catch {
    // ignore
  }
  return null;
}

export function setActiveCreatorSet(set: CreatorSet | null): void {
  if (typeof window === "undefined") return;
  if (set === null) {
    localStorage.removeItem(ACTIVE_CREATOR_SET_KEY);
  } else {
    safeSetItem(ACTIVE_CREATOR_SET_KEY, JSON.stringify(set));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Share Code Generation
// ─────────────────────────────────────────────────────────────────────────────

export function generateShareCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function generateUniqueShareCode(existingCodes: string[]): string {
  let code = generateShareCode();
  let attempts = 0;
  while (existingCodes.includes(code) && attempts < 100) {
    code = generateShareCode();
    attempts++;
  }
  return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded Featured Sets (Sprint 23 Discovery)
// These use real puzzle IDs from the database.
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURED_SETS: CreatorSet[] = [
  {
    id: "featured-fork-fundamentals",
    name: "Fork Fundamentals",
    description: "50 fork puzzles for beginners. Perfect for learning how to attack two pieces at once.",
    patterns: ["fork"],
    minRating: 600,
    maxRating: 1200,
    puzzleIds: [], // populated at runtime
    shareCode: "FORK01",
    createdAt: "2026-03-29",
    timesUsed: 0,
  },
  {
    id: "featured-advanced-pins",
    name: "Advanced Pins",
    description: "50 tactical pin puzzles rated 1400–2000. Test your ability to immobilize enemy pieces.",
    patterns: ["pin"],
    minRating: 1400,
    maxRating: 2000,
    puzzleIds: [],
    shareCode: "PIN001",
    createdAt: "2026-03-29",
    timesUsed: 0,
  },
  {
    id: "featured-back-rank",
    name: "Back Rank Nightmares",
    description: "50 back rank mate puzzles. Learn to spot and exploit the most common endgame blunder.",
    patterns: ["back rank mate"],
    minRating: 600,
    maxRating: 1800,
    puzzleIds: [],
    shareCode: "BACK01",
    createdAt: "2026-03-29",
    timesUsed: 0,
  },
];

export const ALL_FEATURED_CODES = FEATURED_SETS.map((s) => s.shareCode);
