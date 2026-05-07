// Tiny client-only store for the onboarding wizard's in-progress draft.
// Persists across the 3 step pages without dragging in a context provider —
// sessionStorage survives a refresh but doesn't leak across browser sessions.

import type { AvatarColor, AvatarEmoji } from "@mini-quiz/shared";

const KEY = "mq.onboarding.draft.v1";

export type OnboardingDraft = {
  displayName?: string;
  username?: string;
  avatarEmoji?: AvatarEmoji;
  avatarColor?: AvatarColor;
};

export function readDraft(): OnboardingDraft {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return {};
  }
}

export function writeDraft(patch: Partial<OnboardingDraft>): OnboardingDraft {
  const next = { ...readDraft(), ...patch };
  if (typeof window !== "undefined") {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  }
  return next;
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}
