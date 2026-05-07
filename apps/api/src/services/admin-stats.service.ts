import type { AdminStats } from "@mini-quiz/shared";
import { prisma } from "../db.js";

// Returns the dashboard payload for the admin Overview screen.
// All money values are USDT decimal strings (sum of decimal-string Quiz.prizeAmounts
// or Payout.amount, summed as Number for v1 — fine at our scale).

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcStartOfDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumUsdtStrings(values: string[]): string {
  let total = 0;
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) total += n;
  }
  // Trim trailing zeros while preserving up to 6 dp.
  return Number(total.toFixed(6)).toString();
}

export async function getAdminStats(): Promise<AdminStats> {
  const todayStart = utcStartOfDay();
  const tomorrowStart = new Date(todayStart.getTime() + MS_PER_DAY);
  const yesterdayStart = new Date(todayStart.getTime() - MS_PER_DAY);
  const sevenDaysAgo = new Date(todayStart.getTime() - 6 * MS_PER_DAY);
  const monthStart = new Date(
    Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1),
  );

  // Today's games — anything starting today (UTC).
  const games = await prisma.quiz.findMany({
    where: {
      archivedAt: null,
      OR: [
        { scheduledStart: { gte: todayStart, lt: tomorrowStart } },
        { startedAt: { gte: todayStart, lt: tomorrowStart } },
      ],
    },
    include: {
      _count: { select: { players: true } },
      payouts: { select: { status: true } },
      questions: { select: { id: true } },
    },
    orderBy: { scheduledStart: "asc" },
  });

  const todaysGames: AdminStats["todaysGames"] = games.map((q) => {
    const total = q.payouts.length;
    const failed = q.payouts.filter((p) => p.status === "FAILED").length;
    const paid = q.payouts.filter((p) => p.status === "CONFIRMED").length;
    let payoutsState: AdminStats["todaysGames"][number]["payoutsState"] = "none";
    if (total > 0) {
      if (failed > 0) payoutsState = "failed";
      else if (paid === total) payoutsState = "auto-paid";
      else payoutsState = "partial";
    }
    return {
      quizId: q.id,
      title: q.title,
      status: q.status,
      scheduledStart: q.scheduledStart?.toISOString() ?? null,
      playerCount: q._count.players,
      prizeTotalUsdt: sumUsdtStrings(q.prizeAmounts),
      payoutsState,
    };
  });

  // Live quiz (one at a time in our scheduler).
  const live = games.find((g) => g.status === "LIVE") ?? null;
  let liveQuiz: AdminStats["liveQuiz"] = null;
  if (live) {
    // Current question position = highest answered question position so far + 1,
    // capped at totalQuestions. If no answer yet, we're on Q1.
    const lastAnswer = await prisma.answer.findFirst({
      where: { question: { quizId: live.id } },
      orderBy: { submittedAt: "desc" },
      include: { question: { select: { position: true } } },
    });
    const totalQ = live.questions.length;
    const currentQuestion = Math.min(
      totalQ,
      lastAnswer ? lastAnswer.question.position + 1 : 1,
    );
    const secondsRemaining = live.endedAt
      ? Math.max(0, Math.round((live.endedAt.getTime() - Date.now()) / 1000))
      : 0;
    liveQuiz = {
      quizId: live.id,
      title: live.title,
      currentQuestion,
      totalQuestions: totalQ,
      activePlayers: live._count.players,
      secondsRemaining,
    };
  }

  // KPIs
  const [
    playersTodayRows,
    playersYesterdayRows,
    gamesEndedToday,
    gamesScheduledToday,
    confirmedToday,
    failedToday,
    confirmedThisMonth,
  ] = await Promise.all([
    prisma.answer.findMany({
      where: {
        submittedAt: { gte: todayStart, lt: tomorrowStart },
        user: { deletedAt: null },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.answer.findMany({
      where: {
        submittedAt: { gte: yesterdayStart, lt: todayStart },
        user: { deletedAt: null },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.quiz.count({
      where: { status: "ENDED", endedAt: { gte: todayStart, lt: tomorrowStart } },
    }),
    prisma.quiz.count({
      where: {
        status: "SCHEDULED",
        scheduledStart: { gte: todayStart, lt: tomorrowStart },
      },
    }),
    prisma.payout.findMany({
      where: {
        status: "CONFIRMED",
        confirmedAt: { gte: todayStart, lt: tomorrowStart },
      },
      select: { amount: true, createdAt: true, confirmedAt: true },
    }),
    prisma.payout.findMany({
      where: { status: "FAILED", updatedAt: { gte: todayStart, lt: tomorrowStart } },
      select: { amount: true },
    }),
    prisma.payout.findMany({
      where: { status: "CONFIRMED", confirmedAt: { gte: monthStart } },
      select: { amount: true },
    }),
  ]);

  const playersToday = playersTodayRows.length;
  const playersTodayDelta = playersToday - playersYesterdayRows.length;

  const poolUsdtToday = sumUsdtStrings(games.flatMap((g) => g.prizeAmounts));
  const paidUsdtToday = sumUsdtStrings(confirmedToday.map((p) => p.amount));
  const failedUsdtToday = sumUsdtStrings(failedToday.map((p) => p.amount));
  const paidUsdtThisMonth = sumUsdtStrings(confirmedThisMonth.map((p) => p.amount));

  const payoutDurationsSec = confirmedToday
    .filter((p): p is typeof p & { confirmedAt: Date } => p.confirmedAt !== null)
    .map((p) => (p.confirmedAt.getTime() - p.createdAt.getTime()) / 1000);
  const avgPayoutSeconds =
    payoutDurationsSec.length === 0
      ? null
      : Math.round(
          (payoutDurationsSec.reduce((a, b) => a + b, 0) / payoutDurationsSec.length) *
            10,
        ) / 10;

  // 7-day players trend
  const trendRows = await prisma.answer.findMany({
    where: { submittedAt: { gte: sevenDaysAgo, lt: tomorrowStart } },
    select: { userId: true, submittedAt: true },
  });
  const trendBuckets = new Map<string, Set<string>>();
  for (let i = 0; i < 7; i++) {
    const day = new Date(sevenDaysAgo.getTime() + i * MS_PER_DAY);
    trendBuckets.set(utcDateKey(day), new Set());
  }
  for (const r of trendRows) {
    const key = utcDateKey(utcStartOfDay(r.submittedAt));
    const bucket = trendBuckets.get(key);
    if (bucket) bucket.add(r.userId);
  }
  const playersTrend = Array.from(trendBuckets.entries()).map(([day, set]) => ({
    day,
    count: set.size,
  }));

  // Attention queue
  const [failedPayouts, flaggedUsers] = await Promise.all([
    prisma.payout.findMany({
      where: { status: "FAILED" },
      select: { amount: true },
    }),
    prisma.user.count({ where: { flagged: true, deletedAt: null } }),
  ]);

  return {
    todaysGames,
    liveQuiz,
    kpis: {
      playersToday,
      playersTodayDelta,
      gamesRunToday: gamesEndedToday,
      gamesScheduledToday,
      poolUsdtToday,
      paidUsdtToday,
      failedPayoutsToday: failedToday.length,
      failedUsdtToday,
      avgPayoutSeconds,
      paidUsdtThisMonth,
    },
    playersTrend,
    attention: {
      failedPayouts: {
        count: failedPayouts.length,
        sumUsdt: sumUsdtStrings(failedPayouts.map((p) => p.amount)),
      },
      flaggedUsers,
    },
  };
}
