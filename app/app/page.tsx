"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AppRoot() {
  const router = useRouter();

  useEffect(() => {
    try {
      if (localStorage.getItem("ctt_calibration_complete") === "true") {
        router.replace("/app/training-plan");
      } else {
        router.replace("/app/calibration");
      }
    } catch {
      router.replace("/app/calibration");
    }
  }, [router]);

  return null;
}
