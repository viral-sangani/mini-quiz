// Domain types shared between apps/web (frontend) and apps/api (backend).
// Kept in plain TS so the frontend does not need to import Prisma.
// Types here intentionally mirror the Prisma schema — keep them in sync.

export type Role = "USER" | "ADMIN";

export type QuizStatus = "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED" | "ARCHIVED";

export type PayoutStatus =
  | "PENDING"
  | "APPROVED"
  | "BROADCAST"
  | "CONFIRMED"
  | "FAILED";

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

// Quiz cover colors. Stored as design tokens; mapped to CSS vars at render
// time on both player and admin apps. Single source of truth for the palette
// shared between backend default + frontend swatches.
export const COVER_COLORS = [
  "primary",
  "berry",
  "sky",
  "accent",
  "ink",
] as const;
export type CoverColor = (typeof COVER_COLORS)[number];

export type Choice = { id: string; label: string };

export type PublicQuestion = {
  id: string;
  position: number;
  prompt: string;
  choices: Choice[];
};

export type PublicQuiz = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  scheduledStart: string | null; // ISO UTC
  startedAt: string | null;
  endedAt: string | null;
  questionTimeMs: number;
  prizeAmounts: string[];
  difficulty: Difficulty;
  coverColor: string; // CoverColor token; loose typed for forward-compat
  questionCount: number;
  playerCount: number;
  // Joining is only allowed in the [lobbyOpensAt, scheduledStart) window.
  // Null when the quiz has no scheduled start (e.g. DRAFT).
  lobbyOpensAt: string | null;
};

export type AdminQuestion = PublicQuestion & { correctChoiceId: string };

export type AdminQuiz = PublicQuiz & {
  archivedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type LeaderboardRow = {
  userId: string;
  roomPlayerId: string;
  displayName: string;
  walletAddress: string | null;
  // Player avatar — the lobby grid + per-quiz leaderboards render this so
  // each player shows up with the look they picked at onboarding. Older rows
  // (pre-onboarding users) leave both null and the UI falls back to initials.
  avatarEmoji: string | null;
  avatarColor: string | null;
  points: number;
  correctCount: number;
  answeredCount: number;
  totalTimeMs: number;
};

export type PublicPayout = {
  id: string;
  rank: number;
  amount: string;
  tokenAddress: string;
  status: PayoutStatus;
  txHash: string | null;
  confirmedAt: string | null;
  userId: string;
  displayName: string;
  walletAddress: string | null;
};

export type AdminPayout = PublicPayout & {
  quizId: string;
  approvedById: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  walletAddress: string | null;
  displayName: string | null;
  username: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
  role: Role;
  flagged: boolean;
  flagReason: string | null;
  flaggedAt: string | null;
  totalXp: number;
  createdAt: string;
};

// Admin overview dashboard payload — see /admin/stats. All money values are
// USDT decimal strings to avoid float drift. UTC-day boundaries.
export type AdminStats = {
  todaysGames: {
    quizId: string;
    title: string;
    status: QuizStatus;
    scheduledStart: string | null;
    playerCount: number;
    prizeTotalUsdt: string;
    payoutsState: "none" | "auto-paid" | "partial" | "failed";
  }[];
  liveQuiz: {
    quizId: string;
    title: string;
    currentQuestion: number;
    totalQuestions: number;
    activePlayers: number;
    secondsRemaining: number;
  } | null;
  kpis: {
    playersToday: number;
    playersTodayDelta: number;
    gamesRunToday: number;
    gamesScheduledToday: number;
    poolUsdtToday: string;
    paidUsdtToday: string;
    failedPayoutsToday: number;
    failedUsdtToday: string;
    avgPayoutSeconds: number | null;
    paidUsdtThisMonth: string;
  };
  playersTrend: { day: string; count: number }[]; // ISO date (YYYY-MM-DD UTC), 7 entries
  attention: {
    failedPayouts: { count: number; sumUsdt: string };
    flaggedUsers: number;
  };
};

// Admin live monitor — hydrated from /admin/quizzes/:id/live-state, kept
// in sync via SSE answer_distribution + leaderboard events.
export type AdminLiveState = {
  quizId: string;
  status: QuizStatus;
  currentQuestionId: string | null;
  currentQuestionPosition: number | null;
  currentQuestionPrompt: string | null;
  currentQuestionChoices: Choice[];
  currentQuestionCorrectChoiceId: string | null;
  secondsRemaining: number | null;
  totalQuestions: number;
  activePlayers: number;
  distribution: { choiceId: string; count: number }[];
  answeredCount: number;
  avgCorrectPct: number; // 0-100 across all questions answered so far
  leaderboard: LeaderboardRow[];
};

// ---------------------------------------------------------------------------
// Player profile / avatar / leaderboard
// ---------------------------------------------------------------------------

// 12-emoji curated set. Players pick one at onboarding; renders inside a
// solid colour disc with the chosen avatarColor as background.
export const AVATAR_EMOJIS = [
  "🐒",
  "🦁",
  "🐼",
  "🦊",
  "🐨",
  "🦜",
  "🦅",
  "🐵",
  "🐝",
  "🐠",
  "🐢",
  "🐘",
] as const;
export type AvatarEmoji = (typeof AVATAR_EMOJIS)[number];

// 9 background colours from the design's tropical palette. Stored as the
// token name; the frontend maps "berry" → CSS var "--berry" etc.
export const AVATAR_COLORS = [
  "primary",
  "berry",
  "sky",
  "accent",
  "berry-shade",
  "sky-shade",
  "accent-shade",
  "violet",
  "gold",
] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

// Public-safe view of any user — used in leaderboards, lobby player lists,
// peer profile pages. Never includes wallet address.
export type PublicUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarEmoji: AvatarEmoji | null;
  avatarColor: AvatarColor | null;
};

// The signed-in viewer's own profile. Includes private bits (walletAddress,
// totalXp) and computed stats (level, lifetime USDT). Returned by GET /users/me.
export type MyProfile = PublicUser & {
  walletAddress: string;
  totalXp: number;
  level: number;
  // XP earned within the current level (0..xpToNextLevel-1).
  xpInLevel: number;
  // XP needed to advance from current level to the next.
  xpToNextLevel: number;
  quizzesPlayed: number;
  wins: number; // top-3 finishes
  lifetimeUsdtWon: string;
  badges: { id: string; awardedAt: string }[];
};

export type GlobalLeaderboardPeriod = "today" | "week" | "all";

export type GlobalLeaderboardRow = {
  rank: number;
  user: PublicUser;
  points: number;
  level: number;
};

export type CheckUsernameResult = {
  available: boolean;
  reason?: "taken" | "invalid" | "blocked";
  suggestions: string[];
};

// ---------------------------------------------------------------------------
// SSE events
// ---------------------------------------------------------------------------

export type RoomEvent =
  | { type: "quiz_scheduled"; quizId: string; scheduledStart: string }
  | { type: "quiz_started"; quizId: string; startedAt: string; endsAt: string }
  | { type: "quiz_ended"; quizId: string; endedAt: string }
  | { type: "player_joined"; userId: string; displayName: string }
  | {
      type: "answer_submitted";
      userId: string;
      displayName: string;
      questionPosition: number;
      isCorrect: boolean;
    }
  | { type: "leaderboard"; rows: LeaderboardRow[] }
  | {
      type: "answer_distribution";
      questionId: string;
      questionPosition: number;
      distribution: { choiceId: string; count: number }[];
      answeredCount: number;
    }
  | {
      type: "payout_pending";
      payoutId: string;
      rank: number;
      userId: string;
      amount: string;
    }
  | {
      type: "payout_approved";
      payoutId: string;
      rank: number;
      userId: string;
      amount: string;
      txHash: string;
    }
  | {
      type: "payout_confirmed";
      payoutId: string;
      rank: number;
      userId: string;
      amount: string;
      txHash: string;
    }
  | {
      type: "payout_failed";
      payoutId: string;
      rank: number;
      userId: string;
      amount: string;
      reason: string;
    };
