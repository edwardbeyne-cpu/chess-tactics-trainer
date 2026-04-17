"use client";

/**
 * AuthProvider — React context wrapping Supabase auth state.
 *
 * Provides:
 *  - user: Supabase auth user (or null)
 *  - profile: row from public.profiles (or null)
 *  - loading: true until first session check completes
 *  - signInWithGoogle(): kicks off OAuth flow
 *  - signInWithEmail(email): sends magic link
 *  - signOut(): clears session
 *  - refreshProfile(): re-fetches profile row
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { getSupabase, type Profile } from "@/lib/supabase";
import {
  fetchCloudData,
  needsMigrationPrompt,
  applyMergeStrategy,
  pullOnFocus,
  type CloudRow,
  type MergeStrategy,
} from "@/lib/sync";
import MigrationPromptModal from "@/components/MigrationPromptModal";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Migration state: set when sign-in reveals data on both sides
  const [pendingMigration, setPendingMigration] = useState<{
    cloudRows: CloudRow[];
    userId: string;
  } | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to fetch profile:", error.message);
      return null;
    }
    return data as Profile | null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await fetchProfile(user.id);
    setProfile(p);
  }, [user, fetchProfile]);

  // Mirror profile tier/beta to localStorage so existing getSubscriptionTier()
  // and isBetaTester() calls continue to work without modification.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!profile) return;
    try {
      localStorage.setItem("ctt_sub_tier", String(profile.sub_tier ?? 0));
      localStorage.setItem("ctt_beta_tester", profile.beta_tester ? "true" : "false");
      // Fire storage event so any mounted components re-check entitlement
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("ctt-subscription-updated"));
    } catch {
      // ignore
    }
  }, [profile]);

  // Initial session check + listen for auth changes
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    // Read session directly from localStorage to avoid hangs in supabase.auth.getSession()
    const readUserFromStorage = (): User | null => {
      try {
        const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1];
        if (!projectRef) return null;
        const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.access_token) return null;
        // Check expiry
        if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) return null;
        return parsed.user as User;
      } catch {
        return null;
      }
    };

    const initial = readUserFromStorage();
    setUser(initial);
    setLoading(false);
    if (initial) {
      fetchProfile(initial.id).then((p) => {
        if (active) setProfile(p);
      });
    }

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event: string, session: Session | null) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const p = await fetchProfile(u.id);
        setProfile(p);
        // Sync cloud data on sign-in
        if (_event === "SIGNED_IN") {
          const cloudRows = await fetchCloudData(u.id);
          if (needsMigrationPrompt(cloudRows)) {
            setPendingMigration({ cloudRows, userId: u.id });
          } else {
            // Auto-merge (no conflict)
            await applyMergeStrategy("merge", cloudRows, u.id);
          }
        }
      } else {
        setProfile(null);
        setPendingMigration(null);
      }
    });

    // Pull on window focus
    const handleFocus = () => { pullOnFocus(); };
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchProfile]);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`,
      },
    });
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Auth unavailable" };
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`,
      },
    });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, signInWithGoogle, signInWithEmail, signOut, refreshProfile }),
    [user, profile, loading, signInWithGoogle, signInWithEmail, signOut, refreshProfile]
  );

  const resolveMigration = useCallback(async (strategy: MergeStrategy) => {
    if (!pendingMigration) return;
    await applyMergeStrategy(strategy, pendingMigration.cloudRows, pendingMigration.userId);
    setPendingMigration(null);
  }, [pendingMigration]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {pendingMigration && (
        <MigrationPromptModal onChoose={resolveMigration} />
      )}
    </AuthContext.Provider>
  );
}
