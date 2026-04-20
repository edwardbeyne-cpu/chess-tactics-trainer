import { safeSetItem } from "@/lib/safe-storage";

/**
 * Sprint 5 — Auth & Beta Access
 *
 * Google Identity Services (GIS) based sign-in.
 * User profile stored in localStorage (no backend required for beta).
 * Beta access code BETA2026 grants full Pro tier.
 */

const AUTH_KEY = "ctt_user_profile";
const BETA_KEY = "ctt_beta_access";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture: string;
  provider: "google" | "guest";
  createdAt: string;
  betaCodeEntered: boolean;  // true if BETA2026 was entered
  betaPromptDismissed: boolean; // true if user clicked "skip" on first login
}

export const BETA_CODE = "BETA2026";

// ─── User profile ──────────────────────────────────────────────────────────

export function getUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null") as UserProfile | null;
  } catch {
    return null;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  safeSetItem(AUTH_KEY, JSON.stringify(profile));
}

export function signOut(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
  // Revoke Google token if available
  if (typeof window !== "undefined" && window.google?.accounts?.id?.disableAutoSelect) {
    window.google.accounts.id.disableAutoSelect();
  }
}

export function isSignedIn(): boolean {
  return getUserProfile() !== null;
}

// ─── Beta access ───────────────────────────────────────────────────────────

export function hasBetaAccess(): boolean {
  if (typeof window === "undefined") return false;
  const profile = getUserProfile();
  if (profile?.betaCodeEntered) return true;
  // Also check standalone beta key (for guests who entered the code)
  return localStorage.getItem(BETA_KEY) === "true";
}

export function applyBetaCode(code: string): boolean {
  if (code.trim().toUpperCase() !== BETA_CODE) return false;
  if (typeof window === "undefined") return false;

  // Store in standalone key (works for guests too)
  safeSetItem(BETA_KEY, "true");

  // Also update profile if signed in
  const profile = getUserProfile();
  if (profile) {
    profile.betaCodeEntered = true;
    saveUserProfile(profile);
  }

  // Grant Pro tier via both current and legacy subscription mechanisms
  safeSetItem("ctt_sub_tier", "2");
  safeSetItem("subscription_status", "active");

  // Nudge already-mounted UI to re-check entitlement state
  try {
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("ctt-subscription-updated"));
  } catch {
    // ignore
  }

  return true;
}

export function dismissBetaPrompt(): void {
  if (typeof window === "undefined") return;
  const profile = getUserProfile();
  if (profile) {
    profile.betaPromptDismissed = true;
    saveUserProfile(profile);
  } else {
    // Guest — remember dismissal separately
    safeSetItem("ctt_beta_prompt_dismissed", "true");
  }
}

export function shouldShowBetaPrompt(): boolean {
  if (typeof window === "undefined") return false;
  if (hasBetaAccess()) return false;

  const profile = getUserProfile();
  if (profile?.betaPromptDismissed) return false;

  // For guests
  if (localStorage.getItem("ctt_beta_prompt_dismissed") === "true") return false;

  return true;
}

// ─── Google Identity Services ──────────────────────────────────────────────

export interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
}

export interface GoogleJwtPayload {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

/** Decode a Google JWT (no verification needed for display purposes) */
export function decodeGoogleJwt(token: string): GoogleJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload as GoogleJwtPayload;
  } catch {
    return null;
  }
}

export function handleGoogleSignIn(credential: string): UserProfile | null {
  const payload = decodeGoogleJwt(credential);
  if (!payload) return null;

  const existing = getUserProfile();
  const profile: UserProfile = {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    provider: "google",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    betaCodeEntered: existing?.betaCodeEntered ?? hasBetaAccess(),
    betaPromptDismissed: existing?.betaPromptDismissed ?? false,
  };

  saveUserProfile(profile);
  return profile;
}
