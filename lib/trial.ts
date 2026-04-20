import { safeSetItem } from "@/lib/safe-storage";

/**
 * Trial management utilities
 */

const TRIAL_DAYS = parseInt(process.env.NEXT_PUBLIC_TRIAL_DAYS || '7');

export type TrialStatus = {
  active: boolean;
  startedAt: string | null;
  daysRemaining: number;
  expired: boolean;
};

/**
 * Get trial status from localStorage
 */
export function getTrialStatus(): TrialStatus {
  if (typeof window === 'undefined') {
    return { active: false, startedAt: null, daysRemaining: 0, expired: false };
  }

  const startedAt = localStorage.getItem('trial_start_date');
  if (!startedAt) {
    return { active: false, startedAt: null, daysRemaining: 0, expired: false };
  }

  const startDate = new Date(startedAt);
  const now = new Date();
  const diffTime = now.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, TRIAL_DAYS - diffDays);
  const expired = diffDays >= TRIAL_DAYS;

  return {
    active: !expired,
    startedAt,
    daysRemaining,
    expired,
  };
}

/**
 * Start trial (call on first puzzle solve)
 */
export function startTrial() {
  if (typeof window === 'undefined') return false;

  const existing = localStorage.getItem('trial_start_date');
  if (existing) {
    return false; // Already started
  }

  const now = new Date().toISOString();
  safeSetItem('trial_start_date', now);
  return true;
}

/**
 * Clear trial data (for testing)
 */
export function clearTrial() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('trial_start_date');
}

/**
 * Check if user has active subscription (placeholder)
 * Later replace with real subscription status from DB
 */
export function hasActiveSubscription(): boolean {
  if (typeof window === 'undefined') return false;
  // For now, check localStorage for a mock subscription flag
  // This will be replaced with real Stripe subscription status via webhook
  const subscription = localStorage.getItem('subscription_status');
  return subscription === 'active';
}

/**
 * Check if user can access puzzles (trial active OR subscribed)
 */
export function canAccessPuzzles(): boolean {
  const trial = getTrialStatus();
  return trial.active || hasActiveSubscription();
}
