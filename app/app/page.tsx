"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ensurePersonalBootstrap } from "@/lib/personal";

export default function AppRoot() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    ensurePersonalBootstrap().finally(() => {
      if (!cancelled) router.replace("/app/training-plan");
    });
    return () => { cancelled = true; };
  }, [router]);

  return null;
}
