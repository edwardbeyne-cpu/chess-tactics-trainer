"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getUserProfile,
  signOut,
  handleGoogleSignIn,
  type UserProfile,
  type GoogleCredentialResponse,
} from "@/lib/auth";
import BetaAccessModal from "./BetaAccessModal";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";


export default function AuthButton() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showBetaModal, setShowBetaModal] = useState(false);
  const [gisReady, setGisReady] = useState(false);

  useEffect(() => {
    setProfile(getUserProfile());
  }, []);

  const onGoogleSignIn = useCallback((response: GoogleCredentialResponse) => {
    const newProfile = handleGoogleSignIn(response.credential);
    if (newProfile) {
      setProfile(newProfile);
      // Show beta prompt if not yet entered
      if (!newProfile.betaCodeEntered && !newProfile.betaPromptDismissed) {
        setShowBetaModal(true);
      }
    }
  }, []);

  // Load Google Identity Services
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const scriptId = "gis-script";
    if (document.getElementById(scriptId)) {
      setGisReady(true);
      return;
    }

    window.googleSignInCallback = onGoogleSignIn;

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google && GOOGLE_CLIENT_ID) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: onGoogleSignIn,
          auto_select: false,
        });
      }
      setGisReady(true);
    };
    document.head.appendChild(script);
  }, [onGoogleSignIn]);

  const handleSignIn = () => {
    if (!GOOGLE_CLIENT_ID) {
      alert("Google OAuth not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID.");
      return;
    }
    if (window.google) {
      window.google.accounts.id.prompt();
    }
  };

  const handleSignOut = () => {
    signOut();
    setProfile(null);
    setShowDropdown(false);
  };

  if (!profile) {
    return (
      <>
        <button
          onClick={handleSignIn}
          disabled={!gisReady && !!GOOGLE_CLIENT_ID}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            backgroundColor: "transparent",
            border: "1px solid #2e3a5c",
            borderRadius: "8px",
            color: "#e2e8f0",
            padding: "0.4rem 0.75rem",
            fontSize: "0.85rem",
            cursor: "pointer",
            flexShrink: 0,
            transition: "border-color 0.15s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = "#4ade80")}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = "#2e3a5c")}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
        {showBetaModal && (
          <BetaAccessModal
            onClose={() => setShowBetaModal(false)}
            onApplied={() => {
              setShowBetaModal(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <button
          onClick={() => setShowDropdown((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            backgroundColor: "transparent",
            border: "1px solid #2e3a5c",
            borderRadius: "8px",
            padding: "0.3rem 0.6rem",
            cursor: "pointer",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.picture}
            alt={profile.name}
            width={28}
            height={28}
            style={{ borderRadius: "50%", display: "block" }}
            referrerPolicy="no-referrer"
          />
          <span style={{ color: "#e2e8f0", fontSize: "0.85rem", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {profile.name.split(" ")[0]}
          </span>
          <span style={{ color: "#64748b", fontSize: "0.7rem" }}>▾</span>
        </button>

        {showDropdown && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              backgroundColor: "#1a1a2e",
              border: "1px solid #2e3a5c",
              borderRadius: "10px",
              padding: "0.5rem 0",
              minWidth: "200px",
              zIndex: 100,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #2e3a5c" }}>
              <div style={{ color: "#e2e8f0", fontSize: "0.9rem", fontWeight: "bold" }}>{profile.name}</div>
              <div style={{ color: "#64748b", fontSize: "0.75rem" }}>{profile.email}</div>
              {profile.betaCodeEntered && (
                <div style={{ color: "#4ade80", fontSize: "0.7rem", marginTop: "0.25rem" }}>✓ Beta Pro access</div>
              )}
            </div>
            {!profile.betaCodeEntered && (
              <button
                onClick={() => { setShowDropdown(false); setShowBetaModal(true); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  backgroundColor: "transparent", border: "none",
                  color: "#f59e0b", padding: "0.6rem 1rem",
                  fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                🔑 Enter beta code
              </button>
            )}
            <button
              onClick={handleSignOut}
              style={{
                display: "block", width: "100%", textAlign: "left",
                backgroundColor: "transparent", border: "none",
                color: "#94a3b8", padding: "0.6rem 1rem",
                fontSize: "0.85rem", cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {showBetaModal && (
        <BetaAccessModal
          onClose={() => setShowBetaModal(false)}
          onApplied={() => {
            setShowBetaModal(false);
            setProfile(getUserProfile());
          }}
        />
      )}
    </>
  );
}
