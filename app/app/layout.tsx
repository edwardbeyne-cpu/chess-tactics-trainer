import AppNav from "@/components/AppNav";
import TrialBanner from "@/components/TrialBanner";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f0f1a" }}>
      <AppNav />
      <TrialBanner />
      {/* 
        TODO Sprint 3: Add auth check here.
        For now, localStorage-based sessions only.
        Replace with Auth0/Supabase session check:
        - if (!session) redirect('/login')
      */}
      <main style={{ padding: "2rem" }}>
        {children}
      </main>
    </div>
  );
}
