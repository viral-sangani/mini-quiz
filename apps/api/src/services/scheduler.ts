import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db.js";
import { broadcast } from "../sse/broker.js";
import { evaluateBadgesAfterQuiz } from "./badge.service.js";
import { enqueueAutoPayouts, resumeInFlightPayouts } from "./payout.service.js";

// Single-VPS cron. Ticks every TICK_INTERVAL_MS.
// 1. SCHEDULED quizzes whose scheduledStart has passed → LIVE (broadcast quiz_started)
// 2. LIVE quizzes whose duration elapsed → ENDED (create pending payouts, broadcast quiz_ended)
//
// Idempotent per-tick: if tick() overlaps with itself for some reason, each
// UPDATE filters on the prior status, so nothing double-fires.

// 1s tick — the LIVE flip and ENDED flip are visible to players, so a slower
// tick (5s) showed up as a 3-4s "stuck" gap when the lobby clock hit 0.
// Two cheap findMany queries per tick at our scale.
const TICK_INTERVAL_MS = 1_000;

export type SchedulerHandle = { timer: NodeJS.Timeout | null };

export function startScheduler(log: FastifyBaseLogger): SchedulerHandle {
  const handle: SchedulerHandle = { timer: null };
  log.info("scheduler: starting");
  // Resume any payouts that were mid-flight when the backend last crashed.
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

  // 1. SCHEDULED → LIVE
  const toStart = await prisma.quiz.findMany({
    where: {
      status: "SCHEDULED",
      scheduledStart: { lte: now },
      archivedAt: null,
    },
    select: { id: true, questionTimeMs: true, questions: { select: { id: true } } },
  });
  for (const q of toStart) {
    const durationMs = q.questionTimeMs * q.questions.length + 5_000; // 5s buffer
    const endsAt = new Date(now.getTime() + durationMs);
    const updated = await prisma.quiz.updateMany({
      where: { id: q.id, status: "SCHEDULED" },
      data: { status: "LIVE", startedAt: now, endedAt: endsAt },
    });
    if (updated.count > 0) {
      log.info({ quizId: q.id }, "scheduler: quiz LIVE");
      broadcast(q.id, {
        type: "quiz_started",
        quizId: q.id,
        startedAt: now.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    }
  }

  // 2. LIVE → ENDED (endedAt was set to the scheduled stop time when we went live;
  //    any row where endedAt <= now is done)
  const toEnd = await prisma.quiz.findMany({
    where: { status: "LIVE", endedAt: { lte: now } },
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
      // Auto-disburse: create + broadcast on-chain transfers immediately. No
      // admin approval gate. Idempotent so a manual /end after this is a no-op.
      await enqueueAutoPayouts(q.id);
      // Best-effort: badge evaluation must not block payout creation.
      try {
        await evaluateBadgesAfterQuiz(q.id);
      } catch (e) {
        log.error({ err: e, quizId: q.id }, "scheduler: badge eval failed");
      }
    }
  }
}
