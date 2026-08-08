"use client";

import { useEffect } from "react";
import { ensurePersonalBootstrap } from "@/lib/personal";

/**
 * Runs the personal-edition bootstrap on any /app/* entry point, so deep links
 * (bookmarks straight to /app/training etc.) work on a fresh browser without
 * routing through /app first. Renders nothing.
 */
export default function PersonalBootstrap() {
  useEffect(() => {
    ensurePersonalBootstrap().catch(() => { /* offline — defaults apply */ });
  }, []);
  return null;
}
