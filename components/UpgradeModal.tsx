'use client';

import { useState } from 'react';

interface UpgradeModalProps {
  onClose: () => void;
}

type Plan = 'monthly' | 'annual';

export default function UpgradeModal({ onClose }: UpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthlyPrice = 9.99;
  const annualPrice = 69.99; // ~$5.83/month equivalent

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      const message = error instanceof Error ? error.message : 'Payment system is currently unavailable. Please try later.';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0f0f1a',
          borderRadius: '16px',
          border: '1px solid #2e3a5c',
          padding: '2rem',
          maxWidth: '500px',
          width: '90%',
          color: '#e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Upgrade to Pro</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <div
            style={{
              flex: 1,
              border: selectedPlan === 'monthly' ? '2px solid #4ade80' : '1px solid #2e3a5c',
              borderRadius: '8px',
              padding: '1rem',
              cursor: 'pointer',
              backgroundColor: selectedPlan === 'monthly' ? '#1a2c1e' : 'transparent',
            }}
            onClick={() => setSelectedPlan('monthly')}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Monthly</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>${monthlyPrice}<span style={{ fontSize: '1rem', color: '#94a3b8' }}>/month</span></div>
            <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '0.5rem' }}>Cancel anytime</div>
          </div>
          <div
            style={{
              flex: 1,
              border: selectedPlan === 'annual' ? '2px solid #4ade80' : '1px solid #2e3a5c',
              borderRadius: '8px',
              padding: '1rem',
              cursor: 'pointer',
              backgroundColor: selectedPlan === 'annual' ? '#1a2c1e' : 'transparent',
              position: 'relative',
            }}
            onClick={() => setSelectedPlan('annual')}
          >
            <div style={{ position: 'absolute', top: '-8px', right: '-8px', backgroundColor: '#4ade80', color: '#0f0f1a', fontSize: '0.75rem', fontWeight: 'bold', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
              SAVE 42%
            </div>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Annual</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>${annualPrice}<span style={{ fontSize: '1rem', color: '#94a3b8' }}>/year</span></div>
            <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '0.5rem' }}>${(annualPrice / 12).toFixed(2)}/month</div>
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Everything in Pro:</h3>
          <ul style={{ color: '#94a3b8', fontSize: '0.9rem', paddingLeft: '1.25rem', lineHeight: '1.5' }}>
            <li>Unlimited puzzles per day</li>
            <li>All 28 tactical patterns across 3 tiers</li>
            <li>Chess.com game import & blunder analysis</li>
            <li>Full SRS with custom intervals</li>
            <li>Pattern analytics & weakness heatmap</li>
            <li>Puzzle rating & milestone tracking</li>
            <li>Priority support & early access</li>
          </ul>
        </div>

        {error && (
          <div style={{ backgroundColor: '#2a1a1a', border: '1px solid #ef4444', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#ef4444', fontSize: '0.9rem' }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={loading}
          style={{
            width: '100%',
            backgroundColor: loading ? '#2e3a5c' : '#4ade80',
            color: loading ? '#94a3b8' : '#0f0f1a',
            padding: '1rem',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 'bold',
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Redirecting to checkout...' : `Continue with ${selectedPlan === 'monthly' ? 'Monthly' : 'Annual'} Plan`}
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '1rem' }}>
          Secure payment powered by Stripe. Cancel anytime.
        </p>
      </div>
    </div>
  );
}