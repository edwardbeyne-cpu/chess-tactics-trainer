/**
 * Personal edition: monetization removed. These shims keep old call sites
 * working — everything reports full access, trials never exist.
 */

export type TrialStatus = {
  active: boolean;
  startedAt: string | null;
  daysRemaining: number;
  expired: boolean;
};

export function getTrialStatus(): TrialStatus {
  return { active: false, startedAt: null, daysRemaining: 0, expired: false };
}

export function startTrial(): boolean {
  return false;
}

export function clearTrial(): void {}

export function hasActiveSubscription(): boolean {
  return true;
}

export function canAccessPuzzles(): boolean {
  return true;
}
