"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The app-shell layout's PersonalBootstrap gate handles first-run seeding;
// this route just forwards to the training plan.
export default function AppRoot() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app/training-plan");
  }, [router]);

  return null;
}
