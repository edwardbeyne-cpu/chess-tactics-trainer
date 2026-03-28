"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { handleGoogleSignIn, type GoogleCredentialResponse } from "@/lib/auth";
import BetaAccessModal from "./BetaAccessModal";
import { useState } from "react";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";


export default function GoogleSignInSection() {
  const router = useRouter();
  const btnRef = useRef<HTMLDivElement>(null);
  const [showBetaModal, setShowBetaModal] = useState(false);
  const [gisError, setGisError] = useState(false);

  const onCredential = useCallback(
    (response: GoogleCredentialResponse) => {
      const profile = handleGoogleSignIn(response.credential);
      if (!profile) return;
      if (!profile.betaCodeEntered && !profile.betaPromptDismissed) {
        setShowBetaModal(true);
      } else {
        router.push("/app/dashboard");
      }
    },
    [router]
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setGisError(true);
      return;
    }

    const init = () => {
      if (!window.google || !btnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onCredential,
        auto_select: false,
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "outline",
        size: "large",
        width: 360,
        text: "signin_with",
        shape: "rectangular",
      });
    };

    const scriptId = "gis-script";
    const existing = document.getElementById(scriptId);
    if (existing) {
      // Script already loaded
      init();
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = init;
    script.onerror = () => setGisError(true);
    document.head.appendChild(script);
  }, [onCredential]);

  if (gisError || !GOOGLE_CLIENT_ID) {
    return (
      <div
        style={{
          backgroundColor: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "8px",
          padding: "0.75rem",
          color: "#64748b",
          fontSize: "0.75rem",
          marginBottom: "0.5rem",
        }}
      >
        Google Sign-In not configured.{" "}
        <span style={{ color: "#475569" }}>Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable.</span>
      </div>
    );
  }

  return (
    <>
      {/* Google renders its own button into this div */}
      <div
        ref={btnRef}
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "0.25rem",
          minHeight: "44px",
        }}
      />
      {showBetaModal && (
        <BetaAccessModal
          onClose={() => {
            setShowBetaModal(false);
            router.push("/app/dashboard");
          }}
          onApplied={() => {
            setShowBetaModal(false);
            router.push("/app/dashboard");
          }}
        />
      )}
    </>
  );
}
