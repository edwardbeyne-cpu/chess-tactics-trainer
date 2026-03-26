/**
 * Sprint 8 — Social Proof Prompt Session Tracking
 *
 * Rules:
 * - Max one social proof prompt per session (sessionStorage)
 * - Once dismissed, don't show again this session
 * - Use sessionStorage so it resets each browser session
 */

const SESSION_PROOF_KEY = "ctt_social_proof_shown";

export type SocialProofType =
  | "fifth-puzzle"
  | "failed-puzzle"
  | "dashboard-comparison";

/**
 * Check if a social proof prompt has been shown/dismissed this session.
 * Returns true if we should suppress the prompt.
 */
export function isSocialProofSuppressed(): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(SESSION_PROOF_KEY) === "true";
}

/**
 * Mark social proof as shown for this session.
 * Call when any social proof prompt is displayed.
 */
export function markSocialProofShown(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_PROOF_KEY, "true");
}

/**
 * Reset social proof tracking (for testing).
 */
export function resetSocialProofTracking(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_PROOF_KEY);
}
