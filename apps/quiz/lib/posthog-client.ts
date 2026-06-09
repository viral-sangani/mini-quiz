"use client";

import posthog from "posthog-js";

const POSTHOG_TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

export function initPostHog() {
  if (initialized || !POSTHOG_TOKEN || typeof window === "undefined") return;
  posthog.init(POSTHOG_TOKEN, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    defaults: "2026-01-30",
    autocapture: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: ".ph-mask",
      blockSelector: ".ph-no-capture",
    },
    loaded: (client) => {
      client.startExceptionAutocapture({
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
      });
      if (process.env.NODE_ENV === "development") client.debug();
    },
  });
  initialized = true;
}

export function isPostHogReady(): boolean {
  return initialized;
}

export function capturePlayerEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  initPostHog();
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function identifyPlayer(
  walletAddress: string,
  properties: Record<string, unknown>,
) {
  initPostHog();
  if (!initialized) return;
  posthog.identify(walletAddress.toLowerCase(), properties);
}
