/**
 * Sprint 5 — Feedback Storage
 *
 * In-app feedback responses stored in localStorage.
 * Admin page reads directly from localStorage (client-side only).
 * Optional: also submits to Formspree for email delivery.
 */

const FEEDBACK_KEY = "ctt_feedback_responses";

export interface FeedbackResponseMetadata {
  route: string;
  userAgent: string;
  screenSize: string;
  betaTester: boolean;
}

export interface FeedbackResponse {
  id: string;
  submittedAt: string;
  chessLevel: "Beginner" | "Intermediate" | "Advanced";
  likedMost: string;
  frustrated: string;
  patternDifference: string;
  wouldPay: string;
  metadata?: FeedbackResponseMetadata;
}

export function getFeedbackResponses(): FeedbackResponse[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]") as FeedbackResponse[];
  } catch {
    return [];
  }
}

export function saveFeedbackResponse(
  response: Omit<FeedbackResponse, "id" | "submittedAt">
): FeedbackResponse {
  if (typeof window === "undefined") throw new Error("localStorage not available");
  const full: FeedbackResponse = {
    ...response,
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    submittedAt: new Date().toISOString(),
  };
  const existing = getFeedbackResponses();
  existing.push(full);
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(existing));
  return full;
}
