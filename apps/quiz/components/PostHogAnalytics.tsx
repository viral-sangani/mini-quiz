"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useProfile } from "@/lib/profile-context";
import {
  capturePlayerEvent,
  identifyPlayer,
  initPostHog,
  isPostHogReady,
} from "@/lib/posthog-client";

export function PostHogAnalytics({ children }: { children: React.ReactNode }) {
  initPostHog();
  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </>
  );
}

export function PostHogProfileIdentity() {
  const { state } = useProfile();

  useEffect(() => {
    initPostHog();
    if (!isPostHogReady()) return;

    if (state.status === "ready" || state.status === "needs-onboarding") {
      identifyPlayer(state.walletAddress, {
        user_id: state.user.id,
        wallet_address: state.walletAddress.toLowerCase(),
        username: state.user.username,
        display_name: state.user.displayName,
        level: state.profile.level,
        needs_onboarding: state.status === "needs-onboarding",
      });
      capturePlayerEvent("player identified", {
        user_id: state.user.id,
        needs_onboarding: state.status === "needs-onboarding",
      });
    } else if (state.status === "no-wallet") {
      capturePlayerEvent("wallet unavailable");
    } else if (state.status === "profile-error") {
      capturePlayerEvent("profile load failed", {
        wallet_address: state.walletAddress.toLowerCase(),
        message: state.message,
      });
    }
  }, [state]);

  return null;
}

function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    initPostHog();
    if (!isPostHogReady() || typeof window === "undefined") return;
    capturePlayerEvent("$pageview", {
      $current_url: window.location.href,
      pathname,
      search: searchParams.toString(),
    });
  }, [pathname, searchParams]);

  return null;
}
