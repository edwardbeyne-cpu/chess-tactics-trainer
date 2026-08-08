import AppNav from "@/components/AppNav";
import PersonalBootstrap from "@/components/PersonalBootstrap";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f0f1a" }}>
      <PersonalBootstrap />
      <AppNav />
      <main style={{ padding: "clamp(0.5rem, 4vw, 2rem)" }}>
        {children}
      </main>
    </div>
  );
}
