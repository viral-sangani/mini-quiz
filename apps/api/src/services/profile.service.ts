import { Prisma } from "../db.js";
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  type AvatarColor,
  type AvatarEmoji,
  type CheckUsernameResult,
  type MyProfile,
  type PublicUser,
  computeLevel,
} from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { isBlockedUsername } from "./profanity-blocklist.js";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const AVATAR_EMOJI_SET = new Set<string>(AVATAR_EMOJIS);
const AVATAR_COLOR_SET = new Set<string>(AVATAR_COLORS);

export type ProfileError =
  | { error: string; code: "NOT_FOUND" | "BAD_INPUT" | "USERNAME_TAKEN" | "USERNAME_INVALID" | "USERNAME_BLOCKED" };

function isProfileError(x: unknown): x is ProfileError {
  return !!x && typeof x === "object" && "error" in x;
}

function publicUserView(u: {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
}): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarEmoji: (u.avatarEmoji as AvatarEmoji | null) ?? null,
    avatarColor: (u.avatarColor as AvatarColor | null) ?? null,
  };
}

// ---------- username helpers ----------

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function suggestionsFor(value: string): string[] {
  // Strip non-allowed chars then propose ~4 free variants. We don't check
  // availability here; the client can re-check the chosen suggestion.
  const base =
    value
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 16) || "player";
  const stamp = String(new Date().getUTCFullYear() % 100);
  return [
    `${base}_${stamp}`,
    `${base}_pro`,
    `${base}${Math.floor(10 + Math.random() * 89)}`,
    `${base}_quiz`,
  ];
}

export async function checkUsername(value: string): Promise<CheckUsernameResult> {
  const v = normalizeUsername(value);
  if (!USERNAME_RE.test(v)) {
    return {
      available: false,
      reason: "invalid",
      suggestions: suggestionsFor(v),
    };
  }
  if (isBlockedUsername(v)) {
    return {
      available: false,
      reason: "blocked",
      suggestions: suggestionsFor(v),
    };
  }
  // Soft-deleted users free up their username — `findUnique` would still
  // match them (uniqueness is at DB level), so use `findFirst` with the
  // deletedAt filter so a deleted user's handle is reusable.
  const existing = await prisma.user.findFirst({
    where: { username: v, deletedAt: null },
  });
  if (existing) {
    return {
      available: false,
      reason: "taken",
      suggestions: suggestionsFor(v),
    };
  }
  return { available: true, suggestions: [] };
}

// ---------- profile read ----------

// `getMyProfile` is keyed by walletAddress (the player's identity) so the
// player app can fetch /users/me with just their wallet. Creates the user row
// if it doesn't exist yet — first-time wallets get a stub User and are then
// pushed through onboarding (which fills in displayName/username/avatar).
export async function getOrCreatePlayerByWallet(walletAddress: string): Promise<{
  user: PublicUser & { walletAddress: string };
  profile: MyProfile;
  needsOnboarding: boolean;
}> {
  const addr = walletAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) {
    throw new Error("invalid walletAddress");
  }
  const user = await prisma.user.upsert({
    where: { walletAddress: addr },
    create: { walletAddress: addr, role: "USER" },
    update: {},
    include: { badges: true },
  });

  // Stats: quizzes played, top-3 wins, lifetime confirmed USDT, daily wins.
  // Daily wins = count of DailyLeaderboardSnapshot rows where this user was
  // rank 1 (denormalized as winnerUserId).
  const [quizzesPlayed, payoutAgg, top3Wins, dailyWins] = await Promise.all([
    prisma.roomPlayer.count({
      where: { userId: user.id, quiz: { kind: "LIVE" } },
    }),
    prisma.payout.findMany({
      where: { userId: user.id, status: "CONFIRMED" },
      select: { amount: true },
    }),
    prisma.payout.count({
      where: { userId: user.id, rank: { lte: 3 }, status: { not: "FAILED" } },
    }),
    prisma.dailyLeaderboardSnapshot.count({
      where: { winnerUserId: user.id },
    }),
  ]);

  const lifetimeUsdtWon = payoutAgg
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    .toString();

  const lvl = computeLevel(user.totalXp);

  const profile: MyProfile = {
    ...publicUserView(user),
    walletAddress: addr,
    totalXp: user.totalXp,
    level: lvl.level,
    xpInLevel: lvl.xpInLevel,
    xpToNextLevel: lvl.xpToNextLevel,
    quizzesPlayed,
    wins: top3Wins,
    lifetimeUsdtWon,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    dailyWins,
    badges: user.badges.map((b) => ({
      id: b.badgeId,
      awardedAt: b.awardedAt.toISOString(),
    })),
  };

  return {
    user: { ...publicUserView(user), walletAddress: addr },
    profile,
    needsOnboarding: !user.username || !user.displayName || !user.avatarEmoji,
  };
}

export async function getPublicProfile(userId: string): Promise<
  | (PublicUser & {
      level: number;
      totalXp: number;
      quizzesPlayed: number;
      wins: number;
      badges: { id: string; awardedAt: string }[];
    })
  | null
> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { badges: true },
  });
  if (!user) return null;
  const [quizzesPlayed, top3Wins] = await Promise.all([
    prisma.roomPlayer.count({ where: { userId: user.id } }),
    prisma.payout.count({
      where: { userId: user.id, rank: { lte: 3 }, status: { not: "FAILED" } },
    }),
  ]);
  const { level } = computeLevel(user.totalXp);
  return {
    ...publicUserView(user),
    level,
    totalXp: user.totalXp,
    quizzesPlayed,
    wins: top3Wins,
    badges: user.badges.map((b) => ({
      id: b.badgeId,
      awardedAt: b.awardedAt.toISOString(),
    })),
  };
}

// ---------- profile update ----------

export type UpdateProfileInput = {
  walletAddress: string;
  displayName?: string;
  username?: string;
  avatarEmoji?: string;
  avatarColor?: string;
};

// Validates + applies. Username is re-validated/uniqueness-checked here so a
// PATCH body cannot bypass the dedicated /check endpoint.
export async function updateMyProfile(
  input: UpdateProfileInput,
): Promise<MyProfile | ProfileError> {
  const addr = input.walletAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) {
    return { error: "invalid walletAddress", code: "BAD_INPUT" };
  }

  const data: Prisma.UserUpdateInput = {};

  if (input.displayName !== undefined) {
    const name = input.displayName.trim().slice(0, 32);
    if (!name) return { error: "displayName required", code: "BAD_INPUT" };
    data.displayName = name;
  }

  if (input.username !== undefined) {
    const u = normalizeUsername(input.username);
    if (!USERNAME_RE.test(u)) {
      return { error: "Invalid username", code: "USERNAME_INVALID" };
    }
    if (isBlockedUsername(u)) {
      return { error: "Username not allowed", code: "USERNAME_BLOCKED" };
    }
    // Reserve via the DB unique constraint; we still pre-check to give a clean error.
    // Soft-deleted users don't block username reuse.
    const existing = await prisma.user.findFirst({
      where: { username: u, deletedAt: null },
    });
    if (existing && existing.walletAddress !== addr) {
      return { error: "Username taken", code: "USERNAME_TAKEN" };
    }
    data.username = u;
  }

  if (input.avatarEmoji !== undefined) {
    if (!AVATAR_EMOJI_SET.has(input.avatarEmoji)) {
      return { error: "Invalid avatarEmoji", code: "BAD_INPUT" };
    }
    data.avatarEmoji = input.avatarEmoji;
  }

  if (input.avatarColor !== undefined) {
    if (!AVATAR_COLOR_SET.has(input.avatarColor)) {
      return { error: "Invalid avatarColor", code: "BAD_INPUT" };
    }
    data.avatarColor = input.avatarColor;
  }

  // Upsert ensures a never-seen wallet still gets a row.
  await prisma.user.upsert({
    where: { walletAddress: addr },
    create: { walletAddress: addr, role: "USER", ...(data as Prisma.UserCreateInput) },
    update: data,
  });

  const result = await getOrCreatePlayerByWallet(addr);
  return result.profile;
}

export { isProfileError };
