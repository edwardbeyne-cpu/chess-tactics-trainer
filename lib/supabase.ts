"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn("Supabase env vars are missing — auth features will be disabled.");
}

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        // Default storage: localStorage. Simpler than cookie storage; no SSR conflict.
      },
    });
  }
  return _client;
}

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  sub_tier: number;
  beta_tester: boolean;
  chess_username: string | null;
  chess_platform: string | null;
  created_at: string;
  last_seen_at: string;
};
