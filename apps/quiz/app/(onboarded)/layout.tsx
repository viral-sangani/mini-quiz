"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Mango } from "@/components/Mango";
import { MiniPayGate } from "@/components/MiniPayGate";
import { TabBar } from "@/components/TabBar";
import { useProfile } from "@/lib/profile-context";

// Wraps the player-facing tabs (Home / Leaderboard / Profile). All three
// require a wallet + a complete profile; this layout enforces both gates.

export default function OnboardedLayout({ children }: { children: ReactNode }) {
  const { state } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "needs-onboarding") {
      router.replace("/onboarding");
    }
  }, [state.status, router]);

  if (state.status === "loading") {
    return <BootingScreen />;
  }

  if (state.status === "no-wallet") {
    const targetUrl = typeof window !== "undefined" ? window.location.href : "";
    return <MiniPayGate targetUrl={targetUrl} />;
  }

  if (state.status === "needs-onboarding") {
    return <BootingScreen />;
  }

  return (
    <main
      className="mq-screen"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
    >
      <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
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
        gap: 12,
      }}
    >
      <Mango pose="think" size={120} />
      <p className="mq-body" style={{ fontSize: 14 }}>Getting things ready…</p>
    </main>
  );
}
