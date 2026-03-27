import Script from 'next/script';

export default function RewardfulScript() {
  const apiKey = process.env.NEXT_PUBLIC_REWARDFUL_API_KEY || '976154';

  return (
    <>
      <Script
        src="https://r.wdfl.co/rw.js"
        data-rewardful={apiKey}
        strategy="beforeInteractive"
      />
      <Script id="rewardful-queue" strategy="beforeInteractive">{`
        (function(w,r){w._rwq=w[r]=w[r]||[];function(){(w[r].q=w[r].q||[]).push(arguments)}})(window,'rewardful');
      `}</Script>
    </>
  );
}
