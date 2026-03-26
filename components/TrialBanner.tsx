'use client';

import { getTrialStatus } from '@/lib/trial';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TrialBanner() {
  const [trial, setTrial] = useState<ReturnType<typeof getTrialStatus>>({
    active: false,
    startedAt: null,
    daysRemaining: 0,
    expired: false,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTrial(getTrialStatus());
  }, []);

  if (!mounted || !trial.active) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: '#1e40af',
        color: '#fff',
        padding: '0.75rem 1rem',
        textAlign: 'center',
        fontSize: '0.9rem',
        borderBottom: '1px solid #2563eb',
      }}
    >
      <span>
        You're on day {trial.daysRemaining ? trial.daysRemaining : '?'} of your{' '}
        {process.env.NEXT_PUBLIC_TRIAL_DAYS || 7}-day free trial.{' '}
        <Link
          href="/pricing"
          style={{
            color: '#93c5fd',
            fontWeight: 'bold',
            marginLeft: '0.5rem',
            textDecoration: 'underline',
          }}
        >
          Upgrade to Pro
        </Link>
      </span>
    </div>
  );
}