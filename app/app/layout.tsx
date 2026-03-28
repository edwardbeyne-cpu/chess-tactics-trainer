import AppNav from "@/components/AppNav";
import TrialBanner from "@/components/TrialBanner";
import FeedbackButton from "@/components/FeedbackButton";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f0f1a" }}>
      <AppNav />
      <TrialBanner />
      <main style={{ padding: "2rem" }}>
        {children}
      </main>
      {/* Sprint 5: Persistent feedback button */}
      <FeedbackButton />
    </div>
  );
}
