import { redirect } from "next/navigation";

// Personal edition: no marketing site. Straight into training.
export default function HomePage() {
  redirect("/app/training-plan");
}
