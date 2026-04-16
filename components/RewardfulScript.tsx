"use client";

import { useEffect } from "react";

export default function RewardfulScript() {
  const apiKey = process.env.NEXT_PUBLIC_REWARDFUL_API_KEY || "976154";

  useEffect(() => {
    // Rewardful queue shim
    const shim = document.createElement("script");
    shim.text = "(function(w,r){w._rwq=w[r]=w[r]||[];function q(){(w[r].q=w[r].q||[]).push(arguments)}w[r]=w[r]||q})(window,'rewardful');";
    document.head.appendChild(shim);

    // Rewardful tracking pixel
    const tracker = document.createElement("script");
    tracker.src = "https://r.wdfl.co/rw.js";
    tracker.setAttribute("data-rewardful", apiKey);
    tracker.async = true;
    document.head.appendChild(tracker);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
