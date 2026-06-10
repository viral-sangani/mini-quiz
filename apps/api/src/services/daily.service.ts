import type { Choice, LeaderboardRow, PublicQuestion } from "@mini-quiz/shared";
import { computePoints } from "@mini-quiz/shared";
import { Prisma, prisma } from "../db.js";
import { awardBadge } from "./badge.service.js";

// Daily quiz constants. Per-play session is 10 questions x 20s each = 200s
// total. Server enforces the 200s window from `RoomPlayer.dailyStartedAt`;
// the client computes remaining time from the same anchor so a refresh stays
// consistent. Per-question scoring uses DAILY_QUESTION_TIME_MS as the
// nominal time so we share `computePoints` with live quizzes.
export const DAILY_QUESTION_COUNT = 10;
export const DAILY_QUESTION_TIME_MS = 20_000;
export const DAILY_SESSION_MS = DAILY_QUESTION_COUNT * DAILY_QUESTION_TIME_MS;

// Build today's UTC date as a YYYY-MM-DD Date pinned to UTC midnight.
// Postgres DATE columns are timezone-naive; Prisma round-trips them as
// UTC-midnight Date objects, so we generate them the same way to match.
export function todayUtcDate(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// Last instant of an UTC date (23:59:59.999 UTC) — used to gate "can a play
// still start today?".
function endOfUtcDate(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export type DailyTodayResult =
  | {
      kind: "active";
      quizId: string;
      title: string;
      description: string | null;
      dailyDate: string;
      questionCount: number;
      sessionMs: number;
      questionTimeMs: number;
      // Caller's progress, if walletAddress was provided + recognized.
      progress: DailyProgress | null;
    }
  | { kind: "none" };

export type DailyProgress = {
  startedAt: string | null;
  expiresAt: string | null;
  finished: boolean;
  answeredCount: number;
  scoreCorrect: number;
  scoreTotal: number;
};

export async function getActiveDaily(now: Date = new Date()): Promise<{
  quiz: Awaited<ReturnType<typeof loadActiveDailyRow>> | null;
}> {
  const quiz = await loadActiveDailyRow(now);
  return { quiz };
}

async function loadActiveDailyRow(now: Date) {
  const today = todayUtcDate(now);
  return prisma.quiz.findFirst({
    where: { kind: "DAILY", dailyDate: today, status: "LIVE" },
    include: { questions: { orderBy: { position: "asc" } } },
  });
}

export async function getDailyToday(
  now: Date,
  walletAddress?: string,
): Promise<DailyTodayResult> {
  const quiz = await loadActiveDailyRow(now);
  if (!quiz) return { kind: "none" };

  let progress: DailyProgress | null = null;
  if (walletAddress) {
    const addr = walletAddress.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { walletAddress: addr, deletedAt: null },
      select: { id: true },
    });
    if (user) {
      const rp = await prisma.roomPlayer.findUnique({
        where: { quizId_userId: { quizId: quiz.id, userId: user.id } },
        include: { answers: true },
      });
      if (rp) {
        const expiresAt = rp.dailyStartedAt
          ? new Date(rp.dailyStartedAt.getTime() + DAILY_SESSION_MS)
          : null;
        const finished = rp.answers.length >= DAILY_QUESTION_COUNT;
        progress = {
          startedAt: rp.dailyStartedAt?.toISOString() ?? null,
          expiresAt: expiresAt?.toISOString() ?? null,
          finished,
          answeredCount: rp.answers.length,
          scoreCorrect: rp.answers.filter((a) => a.isCorrect).length,
          scoreTotal: rp.answers.reduce((acc, a) => acc + a.points, 0),
        };
      }
    }
  }

  return {
    kind: "active",
    quizId: quiz.id,
    title: quiz.title,
    description: quiz.description,
    dailyDate: quiz.dailyDate!.toISOString().slice(0, 10),
    questionCount: quiz.questions.length,
    sessionMs: DAILY_SESSION_MS,
    questionTimeMs: DAILY_QUESTION_TIME_MS,
    progress,
  };
}

export type StartDailyResult =
  | {
      kind: "ok";
      roomPlayerId: string;
      quizId: string;
      startedAt: string;
      expiresAt: string;
      questions: PublicQuestion[];
      answeredQuestionIds: string[];
    }
  | { kind: "error"; error: string; code: "NO_DAILY" | "DAY_OVER" | "FINISHED" | "NEEDS_ONBOARDING" | "BAD_INPUT" };

export async function startDailyPlay(
  walletAddress: string,
  now: Date = new Date(),
): Promise<StartDailyResult> {
  const addr = walletAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) {
    return { kind: "error", error: "invalid walletAddress", code: "BAD_INPUT" };
  }
  const user = await prisma.user.findFirst({
    where: { walletAddress: addr, deletedAt: null },
    select: {
      id: true,
      displayName: true,
      username: true,
      avatarEmoji: true,
      avatarColor: true,
    },
  });
  if (
    !user ||
    !user.displayName ||
    !user.username ||
    !user.avatarEmoji ||
    !user.avatarColor
  ) {
    return {
      kind: "error",
      error: "Profile incomplete — finish onboarding first",
      code: "NEEDS_ONBOARDING",
    };
  }

  const quiz = await loadActiveDailyRow(now);
  if (!quiz) return { kind: "error", error: "No daily quiz today", code: "NO_DAILY" };
  if (now > endOfUtcDate(quiz.dailyDate!)) {
    return { kind: "error", error: "Today's daily window has closed", code: "DAY_OVER" };
  }

  // Resume if a row already exists.
  const existing = await prisma.roomPlayer.findUnique({
    where: { quizId_userId: { quizId: quiz.id, userId: user.id } },
    include: { answers: { select: { questionId: true } } },
  });

  if (existing && existing.dailyStartedAt) {
    const expires = new Date(existing.dailyStartedAt.getTime() + DAILY_SESSION_MS);
    const finished = existing.answers.length >= DAILY_QUESTION_COUNT;
    if (finished) {
      return { kind: "error", error: "You've already played today", code: "FINISHED" };
    }
    return {
      kind: "ok",
      quizId: quiz.id,
      roomPlayerId: existing.id,
      startedAt: existing.dailyStartedAt.toISOString(),
      expiresAt: expires.toISOString(),
      questions: orderedPublicQuestions(quiz.questions, existing.dailyQuestionOrder),
      answeredQuestionIds: existing.answers.map((a) => a.questionId),
    };
  }

  // First time today — assign a shuffled order and stamp startedAt.
  const order = shuffle(quiz.questions.map((q) => q.id));
  const rp = await prisma.roomPlayer.upsert({
    where: { quizId_userId: { quizId: quiz.id, userId: user.id } },
    create: {
      quizId: quiz.id,
      userId: user.id,
      dailyStartedAt: now,
      dailyQuestionOrder: order,
    },
    update: {
      dailyStartedAt: now,
      dailyQuestionOrder: order,
    },
    include: { answers: { select: { questionId: true } } },
  });

  return {
    kind: "ok",
    quizId: quiz.id,
    roomPlayerId: rp.id,
    startedAt: rp.dailyStartedAt!.toISOString(),
    expiresAt: new Date(rp.dailyStartedAt!.getTime() + DAILY_SESSION_MS).toISOString(),
    questions: orderedPublicQuestions(quiz.questions, rp.dailyQuestionOrder),
    answeredQuestionIds: rp.answers.map((a) => a.questionId),
  };
}

function orderedPublicQuestions(
  questions: { id: string; position: number; prompt: string; choices: unknown }[],
  order: string[],
): PublicQuestion[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return order
    .map((id) => byId.get(id))
    .filter((q): q is (typeof questions)[number] => Boolean(q))
    .map((q, i) => ({
      id: q.id,
      position: i + 1,
      prompt: q.prompt,
      choices: q.choices as Choice[],
    }));
}

export type SubmitDailyResult =
  | { kind: "ok"; isCorrect: boolean; points: number }
  | { kind: "expired" }
  | { kind: "error"; error: string };

export async function submitDailyAnswer(
  walletAddress: string,
  input: { questionId: string; choiceId: string; timeTakenMs: number },
  now: Date = new Date(),
): Promise<SubmitDailyResult> {
  const addr = walletAddress.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { walletAddress: addr, deletedAt: null },
    select: { id: true },
  });
  if (!user) return { kind: "error", error: "User not found" };

  const quiz = await loadActiveDailyRow(now);
  if (!quiz) return { kind: "error", error: "No daily quiz today" };

  const rp = await prisma.roomPlayer.findUnique({
    where: { quizId_userId: { quizId: quiz.id, userId: user.id } },
  });
  if (!rp || !rp.dailyStartedAt) {
    return { kind: "error", error: "No play in progress — start the daily first" };
  }
  const deadline = rp.dailyStartedAt.getTime() + DAILY_SESSION_MS;
  if (now.getTime() > deadline) return { kind: "expired" };

  const question = quiz.questions.find((q) => q.id === input.questionId);
  if (!question) return { kind: "error", error: "Question not in today's daily" };

  const isCorrect = input.choiceId === question.correctChoiceId;
  const timeTakenMs = Math.max(
    0,
    Math.min(input.timeTakenMs, DAILY_QUESTION_TIME_MS),
  );
  const points = computePoints({
    isCorrect,
    timeTakenMs,
    questionTimeMs: DAILY_QUESTION_TIME_MS,
  });

  try {
    await prisma.answer.create({
      data: {
        roomPlayerId: rp.id,
        questionId: question.id,
        quizId: quiz.id,
        userId: user.id,
        choiceId: input.choiceId,
        timeTakenMs,
        isCorrect,
        points,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { kind: "error", error: "Already answered" };
    }
    throw e;
  }

  // NOTE: deliberately do NOT mutate User.totalXp — daily XP is a separate
  // pool that aggregates only over today's daily Quiz.

  return { kind: "ok", isCorrect, points };
}

export type FinishDailyResult = {
  scoreCorrect: number;
  scoreTotal: number;
  rank: number | null;
  answeredCount: number;
  questionCount: number;
  newBadges: string[];
};

export async function finishDailyPlay(
  walletAddress: string,
  now: Date = new Date(),
): Promise<FinishDailyResult | { error: string }> {
  const addr = walletAddress.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { walletAddress: addr, deletedAt: null },
    select: {
      id: true,
      currentStreak: true,
      longestStreak: true,
      lastDailyPlayedAt: true,
    },
  });
  if (!user) return { error: "User not found" };

  const quiz = await loadActiveDailyRow(now);
  if (!quiz) return { error: "No daily quiz today" };

  const rp = await prisma.roomPlayer.findUnique({
    where: { quizId_userId: { quizId: quiz.id, userId: user.id } },
    include: { answers: true },
  });
  if (!rp || !rp.dailyStartedAt) return { error: "No play in progress" };

  // Fill any unanswered questions with 0-point wrong answers so the
  // leaderboard math is consistent. Idempotent — a unique on
  // (roomPlayerId, questionId) skips already-answered questions.
  const answeredIds = new Set(rp.answers.map((a) => a.questionId));
  const missing = quiz.questions.filter((q) => !answeredIds.has(q.id));
  if (missing.length > 0) {
    await prisma.answer.createMany({
      data: missing.map((q) => ({
        roomPlayerId: rp.id,
        questionId: q.id,
        quizId: quiz.id,
        userId: user.id,
        choiceId: "",
        timeTakenMs: DAILY_QUESTION_TIME_MS,
        isCorrect: false,
        points: 0,
      })),
      skipDuplicates: true,
    });
  }

  const all = await prisma.answer.findMany({
    where: { roomPlayerId: rp.id },
  });
  const scoreCorrect = all.filter((a) => a.isCorrect).length;
  const scoreTotal = all.reduce((acc, a) => acc + a.points, 0);
  const answeredCount = all.length;

  // Streak update — idempotent: re-finishing the same day is a no-op.
  const today = todayUtcDate(now);
  const last = user.lastDailyPlayedAt
    ? todayUtcDate(user.lastDailyPlayedAt)
    : null;
  let nextCurrent = user.currentStreak;
  if (!last || last.getTime() < today.getTime()) {
    if (last && last.getTime() === today.getTime() - 86_400_000) {
      nextCurrent = user.currentStreak + 1;
    } else {
      nextCurrent = 1;
    }
  }
  const nextLongest = Math.max(user.longestStreak, nextCurrent);
  if (
    nextCurrent !== user.currentStreak ||
    nextLongest !== user.longestStreak ||
    !last ||
    last.getTime() !== today.getTime()
  ) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        currentStreak: nextCurrent,
        longestStreak: nextLongest,
        lastDailyPlayedAt: today,
      },
    });
  }

  // Award badges.
  const newBadges: string[] = [];
  if (await awardBadge(user.id, "daily_first_play")) newBadges.push("daily_first_play");
  if (
    answeredCount >= DAILY_QUESTION_COUNT &&
    scoreCorrect === DAILY_QUESTION_COUNT
  ) {
    if (await awardBadge(user.id, "daily_perfect")) newBadges.push("daily_perfect");
  }
  if (nextCurrent >= 3) {
    if (await awardBadge(user.id, "streak_3")) newBadges.push("streak_3");
  }
  if (nextCurrent >= 7) {
    if (await awardBadge(user.id, "streak_7")) newBadges.push("streak_7");
  }
  if (nextCurrent >= 30) {
    if (await awardBadge(user.id, "streak_30")) newBadges.push("streak_30");
  }

  // Compute this finisher's rank without materializing the whole board:
  // count players ranked strictly ahead (points DESC, totalTimeMs ASC) + 1.
  const rank = await dailyRankForUser(quiz.id, user.id);
  return {
    scoreCorrect,
    scoreTotal,
    rank,
    answeredCount,
    questionCount: quiz.questions.length,
    newBadges,
  };
}

type DailyLeaderboardDbRow = {
  userId: string;
  roomPlayerId: string;
  displayName: string | null;
  walletAddress: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
  points: number;
  correctCount: number;
  answeredCount: number;
  totalTimeMs: number;
};

// Rank for a single player in a live daily. Returns null if the player has no
// answers (i.e. not on the board). Mirrors dailyLeaderboardLive ordering:
// points DESC, then totalTimeMs ASC. Computed as 1 + (# players strictly
// ahead) so we never build the full board just to read one rank.
export async function dailyRankForUser(
  quizId: string,
  userId: string,
): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ rank: number }[]>`
    WITH scores AS (
      SELECT
        rp."userId" AS "userId",
        COALESCE(SUM(a.points), 0)::int AS "points",
        COALESCE(SUM(a."timeTakenMs"), 0)::int AS "totalTimeMs",
        COUNT(a.id)::int AS "answeredCount"
      FROM "RoomPlayer" rp
      JOIN "User" u ON u.id = rp."userId" AND u."deletedAt" IS NULL
      LEFT JOIN "Answer" a ON a."roomPlayerId" = rp.id
      WHERE rp."quizId" = ${quizId}
      GROUP BY rp."userId"
      HAVING COUNT(a.id) > 0
    ),
    me AS (
      SELECT "points", "totalTimeMs" FROM scores WHERE "userId" = ${userId}
    )
    SELECT (
      (SELECT COUNT(*) FROM scores s, me
        WHERE s."points" > me."points"
           OR (s."points" = me."points" AND s."totalTimeMs" < me."totalTimeMs"))
      + 1
    )::int AS "rank"
    FROM me
  `;
  const rank = rows[0]?.rank;
  return rank == null ? null : Number(rank);
}

export async function dailyLeaderboardLive(
  quizId: string,
): Promise<LeaderboardRow[]> {
  // Single SQL SUM/GROUP BY/ORDER instead of loading every answer into Node.
  // Mirrors rankedLeaderboardRows in room.service.ts: group per RoomPlayer,
  // drop players with no answers, order by points DESC then totalTimeMs ASC.
  const rows = await prisma.$queryRaw<DailyLeaderboardDbRow[]>`
    SELECT
      u.id AS "userId",
      rp.id AS "roomPlayerId",
      u."displayName" AS "displayName",
      u."walletAddress" AS "walletAddress",
      u."avatarEmoji" AS "avatarEmoji",
      u."avatarColor" AS "avatarColor",
      COALESCE(SUM(a.points), 0)::int AS "points",
      COALESCE(SUM(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END), 0)::int AS "correctCount",
      COUNT(a.id)::int AS "answeredCount",
      COALESCE(SUM(a."timeTakenMs"), 0)::int AS "totalTimeMs"
    FROM "RoomPlayer" rp
    JOIN "User" u ON u.id = rp."userId" AND u."deletedAt" IS NULL
    LEFT JOIN "Answer" a ON a."roomPlayerId" = rp.id
    WHERE rp."quizId" = ${quizId}
    GROUP BY rp.id, u.id
    HAVING COUNT(a.id) > 0
    ORDER BY "points" DESC, "totalTimeMs" ASC
  `;
  return rows.map((r) => ({
    userId: r.userId,
    roomPlayerId: r.roomPlayerId,
    displayName: r.displayName ?? "Player",
    walletAddress: r.walletAddress,
    avatarEmoji: r.avatarEmoji,
    avatarColor: r.avatarColor,
    points: Number(r.points),
    correctCount: Number(r.correctCount),
    answeredCount: Number(r.answeredCount),
    totalTimeMs: Number(r.totalTimeMs),
  }));
}

// Read leaderboard for a date. "Today" = live aggregation; past days = frozen
// snapshot. Returns null if the date had no daily.
export async function dailyLeaderboardForDate(
  date: string, // YYYY-MM-DD
  now: Date = new Date(),
): Promise<{ rows: LeaderboardRow[]; date: string; finalized: boolean } | null> {
  const targetDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(targetDate.getTime())) return null;

  const today = todayUtcDate(now);
  if (targetDate.getTime() === today.getTime()) {
    const quiz = await loadActiveDailyRow(now);
    if (!quiz) return null;
    return {
      rows: await dailyLeaderboardLive(quiz.id),
      date,
      finalized: false,
    };
  }

  const snapshot = await prisma.dailyLeaderboardSnapshot.findUnique({
    where: { date: targetDate },
  });
  if (!snapshot) return null;
  return {
    rows: snapshot.rows as unknown as LeaderboardRow[],
    date,
    finalized: true,
  };
}

// Used by the housekeeping job in the scheduler. Builds the leaderboard,
// writes a snapshot, awards daily_first_win to the rank-1 user, and flips
// the quiz to ENDED. Idempotent: snapshot has @unique on quizId.
export async function finalizePastDaily(
  quizId: string,
): Promise<{ winnerUserId: string | null }> {
  const rows = await dailyLeaderboardLive(quizId);
  const winner = rows[0]?.userId ?? null;
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz || quiz.kind !== "DAILY" || !quiz.dailyDate) {
    return { winnerUserId: winner };
  }
  // Snapshot.
  await prisma.dailyLeaderboardSnapshot.upsert({
    where: { quizId },
    create: {
      quizId,
      date: quiz.dailyDate,
      rows: rows as unknown as Prisma.InputJsonValue,
      winnerUserId: winner,
    },
    update: {
      rows: rows as unknown as Prisma.InputJsonValue,
      winnerUserId: winner,
    },
  });
  if (winner) {
    await awardBadge(winner, "daily_first_win");
  }
  // Flip status to ENDED if still LIVE.
  await prisma.quiz.updateMany({
    where: { id: quizId, status: "LIVE" },
    data: { status: "ENDED", endedAt: new Date() },
  });
  return { winnerUserId: winner };
}
