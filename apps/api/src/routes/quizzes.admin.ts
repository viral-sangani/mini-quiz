import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { QuizStatus } from "@prisma/client";
import { COVER_COLORS } from "@mini-quiz/shared";
import { requireAdmin } from "../auth.js";
import { prisma } from "../db.js";
import { broadcast } from "../sse/broker.js";
import {
  archiveQuiz,
  createQuiz,
  getAdminQuiz,
  listAdminQuizzes,
  updateQuiz,
} from "../services/quiz.service.js";
import { getLiveState } from "../services/room.service.js";
import { enqueueAutoPayouts } from "../services/payout.service.js";
import { evaluateBadgesAfterQuiz } from "../services/badge.service.js";
import { getTreasurySummary } from "../services/treasury.service.js";
import { expireLiveScores } from "../services/live-score.service.js";
import { publishWorkerCommand } from "../services/worker-commands.js";

const choiceSchema = z.object({ id: z.string().min(1), label: z.string().min(1) });
const questionSchema = z.object({
  prompt: z.string().min(1),
  choices: z.array(choiceSchema).min(2).max(6),
  correctChoiceId: z.string().min(1),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  scheduledStart: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  questionTimeMs: z.number().int().min(5_000).max(120_000),
  prizeAmounts: z.array(z.string()).min(1),
  minParticipants: z.number().int().min(1).max(100_000).optional(),
  lobbyOpenLeadMs: z.number().int().min(60_000).max(60 * 60_000).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  coverColor: z.enum(COVER_COLORS).optional(),
  payoutToken: z.enum(["CELO", "USDC", "USDT"]).optional(),
  questions: z.array(questionSchema).min(1).max(50),
});

const updateSchema = createSchema.partial();

// Sum the prize-amount strings as Number — same scale-tolerance as the
// rest of the treasury math.
function sumPrize(amounts: string[]): number {
  let total = 0;
  for (const s of amounts) {
    const n = Number(s);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

// Refuse to create / edit a quiz that overcommits treasury balance.
// Only enforced when the quiz is actually scheduled (not DRAFT) — drafts
// don't lock funds yet. Returns an error envelope on failure or null on
// success.
async function assertSufficientTreasury(args: {
  payoutToken: "CELO" | "USDC" | "USDT";
  prizeAmounts: string[];
  scheduledStart: Date | null;
  excludeQuizId?: string;
}): Promise<
  | null
  | {
      code: "INSUFFICIENT_TREASURY";
      message: string;
      required: string;
      available: string;
      token: "CELO" | "USDC" | "USDT";
      treasuryAddress: string;
    }
> {
  // Drafts don't lock funds — only enforce when there's a real schedule.
  if (!args.scheduledStart) return null;
  const required = sumPrize(args.prizeAmounts);
  if (required <= 0) return null;
  const summary = await getTreasurySummary({
    refresh: true,
    excludeQuizId: args.excludeQuizId,
  });
  // The treasury summary's "locked" includes scheduled/live quiz pools and
  // in-flight payouts. For edits, exclude the quiz being edited so its
  // existing locked amount can be replaced by the new effective prize pool.
  const available = Number(summary.available[args.payoutToken]);
  if (!Number.isFinite(available) || available < required) {
    return {
      code: "INSUFFICIENT_TREASURY",
      message: `Need ${required} ${args.payoutToken}, treasury has ${available} available.`,
      required: String(required),
      available: String(available),
      token: args.payoutToken,
      treasuryAddress: summary.address,
    };
  }
  return null;
}

export async function adminQuizRoutes(app: FastifyInstance) {
  app.post("/admin/quizzes", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const payoutToken = parsed.data.payoutToken ?? "USDT";
    const scheduledStart = parsed.data.scheduledStart
      ? new Date(parsed.data.scheduledStart)
      : null;
    const insufficient = await assertSufficientTreasury({
      payoutToken,
      prizeAmounts: parsed.data.prizeAmounts,
      scheduledStart,
    });
    if (insufficient) {
      return reply.code(400).send(insufficient);
    }
    try {
      const quiz = await createQuiz(admin.userId, {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        scheduledStart,
        questionTimeMs: parsed.data.questionTimeMs,
        prizeAmounts: parsed.data.prizeAmounts,
        minParticipants: parsed.data.minParticipants,
        lobbyOpenLeadMs: parsed.data.lobbyOpenLeadMs,
        difficulty: parsed.data.difficulty,
        coverColor: parsed.data.coverColor,
        payoutToken,
        questions: parsed.data.questions,
      });
      return { quiz };
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "SCHEDULE_CONFLICT") {
        return reply.code(409).send({ error: err.message, code: "SCHEDULE_CONFLICT" });
      }
      return reply.code(400).send({ error: err.message ?? "Create failed" });
    }
  });

  app.patch<{ Params: { id: string } }>("/admin/quizzes/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const existing = await prisma.quiz.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          status: true,
          scheduledStart: true,
          prizeAmounts: true,
          payoutToken: true,
        },
      });
      if (!existing) return reply.code(404).send({ error: "Quiz not found" });
      if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
        return reply
          .code(400)
          .send({ error: `Cannot edit quiz with status ${existing.status}` });
      }
      const scheduledStart =
        parsed.data.scheduledStart !== undefined
          ? parsed.data.scheduledStart
            ? new Date(parsed.data.scheduledStart)
            : null
          : existing.scheduledStart;
      const insufficient = await assertSufficientTreasury({
        payoutToken: parsed.data.payoutToken ?? existing.payoutToken,
        prizeAmounts: parsed.data.prizeAmounts ?? existing.prizeAmounts,
        scheduledStart,
        excludeQuizId: existing.id,
      });
      if (insufficient) {
        return reply.code(400).send(insufficient);
      }
      const quiz = await updateQuiz(req.params.id, {
        title: parsed.data.title,
        description: parsed.data.description,
        scheduledStart:
          parsed.data.scheduledStart !== undefined ? scheduledStart : undefined,
        questionTimeMs: parsed.data.questionTimeMs,
        prizeAmounts: parsed.data.prizeAmounts,
        minParticipants: parsed.data.minParticipants,
        lobbyOpenLeadMs: parsed.data.lobbyOpenLeadMs,
        difficulty: parsed.data.difficulty,
        coverColor: parsed.data.coverColor,
        payoutToken: parsed.data.payoutToken,
        questions: parsed.data.questions,
      });
      return { quiz };
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "SCHEDULE_CONFLICT") {
        return reply.code(409).send({ error: err.message, code: "SCHEDULE_CONFLICT" });
      }
      return reply.code(400).send({ error: err.message ?? "Update failed" });
    }
  });

  app.delete<{ Params: { id: string } }>("/admin/quizzes/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    try {
      await archiveQuiz(req.params.id);
      return { ok: true };
    } catch (e) {
      return reply
        .code(400)
        .send({ error: e instanceof Error ? e.message : "Archive failed" });
    }
  });

  app.get<{ Querystring: { status?: string; archived?: string } }>(
    "/admin/quizzes",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const status = req.query.status as QuizStatus | "ALL" | undefined;
      const includeArchived = req.query.archived === "true";
      const quizzes = await listAdminQuizzes({ status, includeArchived });
      return { quizzes };
    },
  );

  app.get<{ Params: { id: string } }>("/admin/quizzes/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const result = await getAdminQuiz(req.params.id);
    if (!result) return reply.code(404).send({ error: "Quiz not found" });
    return result;
  });

  // Live-state hydrate for the admin live monitor. Returns current question +
  // answer distribution + leaderboard so the page renders without waiting for
  // the first SSE event.
  app.get<{ Params: { id: string } }>(
    "/admin/quizzes/:id/live-state",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const state = await getLiveState(req.params.id);
      if (!state) return reply.code(404).send({ error: "Quiz not found" });
      return state;
    },
  );

  // Manual override: end a LIVE quiz immediately and trigger auto-payouts.
  // Idempotent — safe to call after the scheduler has already done it.
  app.post<{ Params: { id: string } }>(
    "/admin/quizzes/:id/end",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id } });
      if (!quiz) return reply.code(404).send({ error: "Quiz not found" });
      if (quiz.status === "ENDED" || quiz.status === "ARCHIVED") {
        return { ok: true, alreadyEnded: true };
      }
      if (quiz.status !== "LIVE" && quiz.status !== "SCHEDULED") {
        return reply
          .code(400)
          .send({ error: `Cannot end quiz with status ${quiz.status}` });
      }
      const now = new Date();
      const updated = await prisma.quiz.updateMany({
        where: { id: quiz.id, status: { in: ["LIVE", "SCHEDULED"] } },
        data: { status: "ENDED", endedAt: now },
      });
      if (updated.count > 0) {
        broadcast(quiz.id, {
          type: "quiz_ended",
          quizId: quiz.id,
          endedAt: now.toISOString(),
        });
        await expireLiveScores(quiz.id);
        const queued = await publishWorkerCommand({
          type: "process_quiz_end",
          quizId: quiz.id,
        });
        if (!queued) {
          await enqueueAutoPayouts(quiz.id);
          try {
            await evaluateBadgesAfterQuiz(quiz.id);
          } catch (e) {
            req.log.error({ err: e, quizId: quiz.id }, "manual /end: badge eval failed");
          }
        }
      }
      return { ok: true };
    },
  );
}
