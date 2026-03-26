'use client';

import { canAccessPuzzles } from '@/lib/trial';
import { useState, useEffect } from 'react';
import UpgradeModal from './UpgradeModal';

interface PaywallProps {
  children: React.ReactNode;
}

export default function Paywall({ children }: PaywallProps) {
  const [access, setAccess] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const hasAccess = canAccessPuzzles();
    setAccess(hasAccess);
    if (!hasAccess) {
      // Auto-show upgrade modal after a delay
      const timer = setTimeout(() => setShowModal(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  if (access) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        style={{
          backgroundColor: '#1a1a2e',
          border: '1px solid #2e3a5c',
          borderRadius: '12px',
          padding: '3rem 2rem',
          textAlign: 'center',
          maxWidth: '500px',
          margin: '2rem auto',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ color: '#e2e8f0', fontWeight: 'bold', marginBottom: '1rem' }}>
          Your free trial has ended
        </h2>
        <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
          Upgrade to Pro to continue solving unlimited puzzles, access all 28 tactical patterns,
          and import your Chess.com games for blunder analysis.
        </p>
        <button
          onClick={() => setShowModal(true)}
          style={{
            backgroundColor: '#4ade80',
            color: '#0f0f1a',
            padding: '0.75rem 2rem',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 'bold',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Upgrade Now
        </button>
      </div>
      {showModal && <UpgradeModal onClose={() => setShowModal(false)} />}
    </>
  );
}