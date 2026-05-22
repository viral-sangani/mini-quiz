import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db.js";
import { broadcast } from "../sse/broker.js";
import { evaluateBadgesAfterQuiz } from "./badge.service.js";
import { finalizePastDaily, todayUtcDate } from "./daily.service.js";
import { expireLiveScores, seedLiveScoresFromRows } from "./live-score.service.js";
import { enqueueAutoPayouts, resumeInFlightPayouts } from "./payout.service.js";
import { fullLeaderboardRows } from "./room.service.js";

// Single-VPS cron. Ticks every TICK_INTERVAL_MS.
// 1. (Once per UTC date) Daily housekeeping — finalize yesterday's DAILY,
//    flip today's SCHEDULED DAILY to LIVE.
// 2. SCHEDULED LIVE quizzes whose scheduledStart has passed → LIVE.
// 3. LIVE quizzes whose duration elapsed → ENDED (auto-payouts + badges
//    for kind=LIVE only; kind=DAILY is finalized by step 1).
//
// Idempotent per-tick: if tick() overlaps with itself, each UPDATE filters
// on the prior status so nothing double-fires.

const TICK_INTERVAL_MS = 1_000;

export type SchedulerHandle = { timer: NodeJS.Timeout | null };

// Module-local: the YYYY-MM-DD UTC key we last ran daily housekeeping for.
// Single-replica only — if api ever scales beyond 1 pod, move this to a
// leader-elected guard (or a DB row + advisory lock).
let lastDailyHousekeepingDateKey: string | null = null;

function utcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function startScheduler(log: FastifyBaseLogger): SchedulerHandle {
  const handle: SchedulerHandle = { timer: null };
  log.info("scheduler: starting");
  void resumeInFlightPayouts();

  const run = async () => {
    try {
      await tick(log);
    } catch (e) {
      log.error({ err: e }, "scheduler tick failed");
    } finally {
      handle.timer = setTimeout(run, TICK_INTERVAL_MS);
    }
  };
  handle.timer = setTimeout(run, TICK_INTERVAL_MS);
  return handle;
}

export function stopScheduler(handle: SchedulerHandle): void {
  if (handle.timer) clearTimeout(handle.timer);
  handle.timer = null;
}

async function tick(log: FastifyBaseLogger): Promise<void> {
  const now = new Date();

  // 0. Daily housekeeping — once per UTC date.
  const dateKey = utcDateKey(now);
  if (dateKey !== lastDailyHousekeepingDateKey) {
    try {
      await runDailyHousekeeping(now, log);
    } catch (e) {
      log.error({ err: e }, "scheduler: daily housekeeping failed");
    }
    lastDailyHousekeepingDateKey = dateKey;
  }

  // 1. SCHEDULED → LIVE for the existing live multiplayer quizzes.
  const toStart = await prisma.quiz.findMany({
    where: {
      kind: "LIVE",
      status: "SCHEDULED",
      scheduledStart: { lte: now },
      archivedAt: null,
    },
    select: {
      id: true,
      questionTimeMs: true,
      minParticipants: true,
      _count: { select: { questions: true, players: true } },
    },
  });
  for (const q of toStart) {
    if (q._count.players < q.minParticipants) {
      continue;
    }
    const durationMs = q.questionTimeMs * q._count.questions + 5_000;
    const endsAt = new Date(now.getTime() + durationMs);
    const updated = await prisma.quiz.updateMany({
      where: { id: q.id, status: "SCHEDULED" },
      data: { status: "LIVE", startedAt: now, endedAt: endsAt },
    });
    if (updated.count > 0) {
      await seedLiveScoresFromRows(q.id, await fullLeaderboardRows(q.id));
      log.info({ quizId: q.id }, "scheduler: quiz LIVE");
      broadcast(q.id, {
        type: "quiz_started",
        quizId: q.id,
        startedAt: now.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    }
  }

  // 2. LIVE → ENDED (live multiplayer only; daily quizzes are ended by
  //    runDailyHousekeeping at the next UTC midnight).
  const toEnd = await prisma.quiz.findMany({
    where: { kind: "LIVE", status: "LIVE", endedAt: { lte: now } },
    select: { id: true },
  });
  for (const q of toEnd) {
    const updated = await prisma.quiz.updateMany({
      where: { id: q.id, status: "LIVE" },
      data: { status: "ENDED", endedAt: now },
    });
    if (updated.count > 0) {
      log.info({ quizId: q.id }, "scheduler: quiz ENDED");
      broadcast(q.id, { type: "quiz_ended", quizId: q.id, endedAt: now.toISOString() });
      await expireLiveScores(q.id);
      await enqueueAutoPayouts(q.id);
      try {
        await evaluateBadgesAfterQuiz(q.id);
      } catch (e) {
        log.error({ err: e, quizId: q.id }, "scheduler: badge eval failed");
      }
    }
  }
}

// Run at every UTC-date boundary (in practice once per day, on first tick
// after midnight UTC). Two jobs:
//   1. For yesterday's DAILY (or any prior LIVE DAILY without a snapshot yet),
//      build the leaderboard, write a snapshot, award daily_first_win, mark
//      ENDED.
//   2. For today's SCHEDULED DAILY (if one exists), flip it to LIVE.
async function runDailyHousekeeping(
  now: Date,
  log: FastifyBaseLogger,
): Promise<void> {
  const today = todayUtcDate(now);

  // Finalize any LIVE DAILY whose dailyDate is in the past.
  const toFinalize = await prisma.quiz.findMany({
    where: {
      kind: "DAILY",
      status: "LIVE",
      dailyDate: { lt: today },
    },
    select: { id: true, dailyDate: true },
  });
  for (const q of toFinalize) {
    try {
      const { winnerUserId } = await finalizePastDaily(q.id);
      log.info(
        { quizId: q.id, dailyDate: q.dailyDate, winnerUserId },
        "scheduler: daily finalized",
      );
    } catch (e) {
      log.error({ err: e, quizId: q.id }, "scheduler: finalize daily failed");
    }
  }

  // Activate today's daily.
  const todays = await prisma.quiz.findMany({
    where: {
      kind: "DAILY",
      status: { in: ["DRAFT", "SCHEDULED"] },
      dailyDate: today,
    },
    select: { id: true },
  });
  for (const q of todays) {
    const updated = await prisma.quiz.updateMany({
      where: { id: q.id, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "LIVE", startedAt: now },
    });
    if (updated.count > 0) {
      log.info({ quizId: q.id }, "scheduler: daily LIVE");
    }
  }
}
