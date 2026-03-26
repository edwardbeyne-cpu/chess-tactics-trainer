'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    rewardful?: {
      init: (options: { key: string }) => void;
    };
  }
}

export default function RewardfulScript() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_REWARDFUL_API_KEY;
    if (!apiKey) {
      console.warn('Rewardful API key not set');
      return;
    }

    // Check if script already loaded
    if (window.rewardful) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://r.wdfl.co/rw.js';
    script.async = true;
    script.onload = () => {
      window.rewardful?.init({ key: apiKey });
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  return null;
}