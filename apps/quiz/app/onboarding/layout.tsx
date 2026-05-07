"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useProfile } from "@/lib/profile-context";

// Onboarding shell. No tab bar; redirects out if the player already has a
// complete profile (so /onboarding doesn't become a back-button trap).
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const { state } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "ready") {
      router.replace("/");
    }
  }, [state, router]);

  return <main className="mq-screen" style={{ minHeight: "100dvh" }}>{children}</main>;
}
