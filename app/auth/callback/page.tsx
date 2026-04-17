"use client";

/**
 * OAuth / magic-link callback. With detectSessionInUrl=true the browser
 * SDK auto-exchanges the code for a session. We just wait briefly then
 * redirect.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = params.get("next") || "/app/training-plan";
    const errorParam = params.get("error_description") || params.get("error");
    if (errorParam) {
      setError(errorParam);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setError("Auth unavailable");
      return;
    }

    // Wait for the SDK to process the URL params and write to localStorage.
    // We poll localStorage directly because getSession() is unreliable here.
    let cancelled = false;
    const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1];
    const storageKey = projectRef ? `sb-${projectRef}-auth-token` : null;
    const checkStorage = async () => {
      for (let i = 0; i < 30; i += 1) {
        if (storageKey && localStorage.getItem(storageKey)) {
          if (!cancelled) router.replace(next);
          return;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!cancelled) router.replace(next);
    };
    checkStorage();
    return () => { cancelled = true; };
  }, [params, router]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: "1rem",
      color: "#e2e8f0",
      backgroundColor: "#0f0f1a",
    }}>
      {error ? (
        <>
          <div style={{ fontSize: "1.1rem", color: "#fca5a5" }}>Sign-in failed</div>
          <div style={{ fontSize: "0.85rem", color: "#94a3b8", maxWidth: "420px", textAlign: "center" }}>{error}</div>
          <button
            onClick={() => router.replace("/")}
            style={{
              backgroundColor: "#4ade80",
              color: "#0f0f1a",
              border: "none",
              borderRadius: "8px",
              padding: "0.6rem 1rem",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Back to home
          </button>
        </>
      ) : (
        <>
          <div style={{
            width: 28,
            height: 28,
            border: "3px solid rgba(255,255,255,0.2)",
            borderTopColor: "#4ade80",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ fontSize: "0.9rem", color: "#94a3b8" }}>Signing you in…</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </div>
  );
}
