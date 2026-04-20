// Thin wrapper around PostHog. No-ops when key is missing so local dev and
// preview builds don't need a key set. Initialize once via initAnalytics().
import posthog from "posthog-js";

let initialized = false;

export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  initialized = true;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    persistence: "localStorage",
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") ph.debug(false);
    },
  });
  // Expose to window so safe-storage's quota warning can ping it without import cycles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).posthog = posthog;
}

type EventProps = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, props?: EventProps): void {
  if (typeof window === "undefined") return;
  if (!initialized) return;
  try {
    posthog.capture(event, props);
  } catch { /* noop */ }
}

export function identify(distinctId: string, props?: EventProps): void {
  if (typeof window === "undefined" || !initialized) return;
  try {
    posthog.identify(distinctId, props);
  } catch { /* noop */ }
}
