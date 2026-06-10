"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader } from "@/components/Loader";
import { MiniPayGate } from "@/components/MiniPayGate";
import { ProfileErrorScreen } from "@/components/ProfileErrorScreen";
import { TabBar } from "@/components/TabBar";
import { useProfile } from "@/lib/profile-context";

// Wraps the player-facing tabs (Home / Leaderboard / Profile). All three
// require a wallet + a complete profile; this layout enforces both gates.

export default function OnboardedLayout({ children }: { children: ReactNode }) {
  const { state, refresh } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === "needs-onboarding" && pathname !== "/profile") {
      router.replace("/profile?complete=1");
    }
  }, [state.status, pathname, router]);

  if (state.status === "loading") {
    return <BootingScreen />;
  }

  if (state.status === "no-wallet") {
    const targetUrl = typeof window !== "undefined" ? window.location.href : "";
    return <MiniPayGate targetUrl={targetUrl} />;
  }

  if (state.status === "profile-error") {
    return (
      <ProfileErrorScreen
        message={state.message}
        onRetry={() => void refresh()}
      />
    );
  }

  if (state.status === "needs-onboarding" && pathname !== "/profile") {
    return <BootingScreen />;
  }

  return (
    <main
      className="mq-screen mq-screen-with-tabbar"
      style={{ minHeight: "100dvh" }}
    >
      {children}
      <TabBar />
    </main>
  );
}

function BootingScreen() {
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
