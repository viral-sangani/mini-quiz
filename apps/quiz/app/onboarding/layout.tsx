"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader } from "@/components/Loader";
import { MiniPayGate } from "@/components/MiniPayGate";
import { ProfileErrorScreen } from "@/components/ProfileErrorScreen";
import { useProfile } from "@/lib/profile-context";

// Onboarding shell. No tab bar; redirects out if the player already has a
// complete profile (so /onboarding doesn't become a back-button trap).
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const { state, refresh } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "ready") {
      router.replace("/");
    }
  }, [state, router]);

  if (state.status === "profile-error") {
    return (
      <ProfileErrorScreen
        message={state.message}
        onRetry={() => void refresh()}
      />
    );
  }

  if (state.status === "loading" || state.status === "ready") {
    return (
      <main
        className="mq-screen"
        style={{
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader label="Getting things ready..." sub="Connecting to MiniPay" />
      </main>
    );
  }

  if (state.status === "no-wallet") {
    const targetUrl = typeof window !== "undefined" ? window.location.href : "";
    return <MiniPayGate targetUrl={targetUrl} />;
  }

  return <main className="mq-screen" style={{ minHeight: "100dvh" }}>{children}</main>;
}
