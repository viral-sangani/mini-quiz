// XP → level computation. Single source of truth shared by backend
// (profile.service.ts when serializing MyProfile) and frontend (Profile page
// progress bar). XP equals the lifetime sum of all `Answer.points`.
//
// Levels 1-10 use hand-tuned thresholds; beyond level 10, each level needs
// 15,000 more XP than the previous. `computeLevel` returns the level number
// plus how far into it the user is.

const FIXED_THRESHOLDS = [
  0, // L1 starts at 0
  1_000, // L2
  3_000, // L3
  6_000, // L4
  10_000, // L5
  15_000, // L6
  22_000, // L7
  30_000, // L8
  40_000, // L9
  55_000, // L10
] as const;

const POST_L10_PER_LEVEL = 15_000;

export type LevelInfo = {
  level: number;
  xpInLevel: number;
  xpToNextLevel: number;
};

export function computeLevel(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  const lastIdx = FIXED_THRESHOLDS.length - 1;
  const lastThreshold = FIXED_THRESHOLDS[lastIdx]!;

  // Past level 10: extrapolate at POST_L10_PER_LEVEL per level.
  if (xp >= lastThreshold) {
    const xpPastLast = xp - lastThreshold;
    const levelsPastLast = Math.floor(xpPastLast / POST_L10_PER_LEVEL);
    return {
      level: FIXED_THRESHOLDS.length + levelsPastLast,
      xpInLevel: xpPastLast - levelsPastLast * POST_L10_PER_LEVEL,
      xpToNextLevel: POST_L10_PER_LEVEL,
    };
  }

  // Walk fixed thresholds (xp < lastThreshold guarantees i+1 exists in range).
  for (let i = lastIdx - 1; i >= 0; i--) {
    const start = FIXED_THRESHOLDS[i]!;
    if (xp < start) continue;
    const next = FIXED_THRESHOLDS[i + 1]!;
    return {
      level: i + 1,
      xpInLevel: xp - start,
      xpToNextLevel: next - start,
    };
  }

  // Unreachable (xp >= 0 always matches FIXED_THRESHOLDS[0] = 0).
  return { level: 1, xpInLevel: 0, xpToNextLevel: FIXED_THRESHOLDS[1]! };
}
