import { redirect } from "next/navigation";

// Achievements have moved to the Dashboard
export default function AchievementsPage() {
  redirect("/app/dashboard");
}
