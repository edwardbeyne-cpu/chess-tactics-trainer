import { redirect } from "next/navigation";

export const metadata = {
  title: "Review — ChessTrainer",
};

export default function ReviewPage() {
  // Review functionality has been rolled into the Training section's mastery system
  // and Drill Tactics handles individual pattern review. Redirect to Training Plan.
  redirect("/app/training-plan");
}
