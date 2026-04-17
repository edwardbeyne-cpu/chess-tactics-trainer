"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import SignInModal from "./SignInModal";
import BetaAccessModal from "./BetaAccessModal";

export default function AuthButton() {
  const { user, profile, loading, signOut } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showBetaModal, setShowBetaModal] = useState(false);

  if (loading) return null;

  // ── Signed out ────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowSignIn(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            backgroundColor: "transparent",
            border: "1px solid #2e3a5c",
            borderRadius: "8px",
            color: "#e2e8f0",
            padding: "0.4rem 0.85rem",
            fontSize: "0.85rem",
            cursor: "pointer",
            flexShrink: 0,
            transition: "border-color 0.15s",
            fontWeight: 500,
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = "#4ade80")}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = "#2e3a5c")}
        >
          Sign in
        </button>
        {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
      </>
    );
  }

  // ── Signed in ─────────────────────────────────────────────────────────────
  const displayName =
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Account";
  const picture = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const isBeta = !!profile?.beta_tester;

  const handleSignOut = async () => {
    setShowDropdown(false);
    await signOut();
  };

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
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={picture}
              alt={displayName}
              width={28}
              height={28}
              style={{ borderRadius: "50%", display: "block" }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: "#4ade80",
                color: "#0f0f1a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: "bold",
              }}
            >
              {displayName[0]?.toUpperCase()}
            </div>
          )}
          <span
            style={{
              color: "#e2e8f0",
              fontSize: "0.85rem",
              maxWidth: "120px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName.split(" ")[0]}
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
              minWidth: "220px",
              zIndex: 100,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #2e3a5c" }}>
              <div style={{ color: "#e2e8f0", fontSize: "0.9rem", fontWeight: "bold" }}>{displayName}</div>
              <div style={{ color: "#64748b", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
              {isBeta && (
                <div style={{ color: "#4ade80", fontSize: "0.7rem", marginTop: "0.25rem" }}>✓ Beta Pro access</div>
              )}
            </div>
            {!isBeta && (
              <button
                onClick={() => { setShowDropdown(false); setShowBetaModal(true); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  backgroundColor: "transparent",
                  border: "none",
                  color: "#f59e0b",
                  padding: "0.6rem 1rem",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                🔑 Enter beta code
              </button>
            )}
            <button
              onClick={handleSignOut}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                backgroundColor: "transparent",
                border: "none",
                color: "#94a3b8",
                padding: "0.6rem 1rem",
                fontSize: "0.85rem",
                cursor: "pointer",
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
          onApplied={() => setShowBetaModal(false)}
        />
      )}
    </>
  );
}
