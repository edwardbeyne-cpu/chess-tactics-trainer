export const BETA_TESTER_KEY = "ctt_beta_tester";
export const BETA_FEEDBACK_KEY = "ctt_beta_feedback";

export interface BetaFeedbackEntry {
  id: string;
  timestamp: string;
  page: string;
  rating: "up" | "down";
  comment: string;
}

export function isBetaTester(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BETA_TESTER_KEY) === "true";
}

export function enableBetaAccess(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("ctt_sub_tier", "2");
  localStorage.setItem(BETA_TESTER_KEY, "true");
}

export function getBetaFeedback(): BetaFeedbackEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(BETA_FEEDBACK_KEY) || "[]") as BetaFeedbackEntry[];
  } catch {
    return [];
  }
}

export function saveBetaFeedback(entry: Omit<BetaFeedbackEntry, "id" | "timestamp">): BetaFeedbackEntry {
  if (typeof window === "undefined") throw new Error("localStorage not available");
  const full: BetaFeedbackEntry = {
    ...entry,
    id: `beta_fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  const existing = getBetaFeedback();
  existing.push(full);
  localStorage.setItem(BETA_FEEDBACK_KEY, JSON.stringify(existing));
  return full;
}

export function getClientFeedbackMetadata(currentPath?: string) {
  if (typeof window === "undefined") {
    return {
      route: currentPath || "unknown",
      userAgent: "server",
      screenSize: "unknown",
      betaTester: false,
    };
  }

  return {
    route: currentPath || window.location.pathname,
    userAgent: window.navigator.userAgent,
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    betaTester: isBetaTester(),
  };
}
