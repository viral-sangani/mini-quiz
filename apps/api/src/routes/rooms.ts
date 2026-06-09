import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  joinRoom,
  leaderboard,
  normalizeLeaderboardLimit,
  submitAnswer,
} from "../services/room.service.js";
import { listPayoutsForQuiz } from "../services/payout.service.js";
import { captureBackendEvent } from "../services/posthog.js";

const joinSchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const answerSchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  roomPlayerId: z.string().min(1),
  questionId: z.string().min(1),
  choiceId: z.string().min(1),
  timeTakenMs: z.number().int().nonnegative(),
});

const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  viewerUserId: z.string().min(1).optional(),
});

export async function roomRoutes(app: FastifyInstance) {
  app.post<{ Params: { code: string } }>(
    "/rooms/:code/join",
    async (req, reply) => {
      const parsed = joinSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const result = await joinRoom(
        req.params.code.toUpperCase(),
        parsed.data.walletAddress,
      );
      if ("error" in result) {
        const status =
          result.code === "PRE_LOBBY"
            ? 409
            : result.code === "LATE"
              ? 410
              : result.code === "CLOSED"
                ? 404
                : result.code === "NEEDS_ONBOARDING"
                  ? 409
                  : 400;
        return reply.code(status).send(result);
      }
      captureBackendEvent("live quiz joined", {
        distinctId: parsed.data.walletAddress,
        properties: {
          quiz_code: req.params.code.toUpperCase(),
          quiz_id: result.quizId,
          room_player_id: result.roomPlayerId,
          user_id: result.userId,
        },
      });
      return result;
    },
  );

  app.post<{ Params: { code: string } }>(
    "/rooms/:code/answer",
    async (req, reply) => {
      const parsed = answerSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const result = await submitAnswer(req.params.code.toUpperCase(), parsed.data);
      if ("error" in result) {
        // 401 for wallet/identity failures (security), 410 for expired
        // questions, 409 for duplicate-answer races, 404 for not-found,
        // 400 otherwise.
        const status =
          result.code === "WALLET_MISMATCH"
            ? 401
            : result.code === "STALE"
              ? 410
              : result.code === "ALREADY_ANSWERED"
                ? 409
                : result.code === "QUIZ_NOT_FOUND"
                  ? 404
                  : 400;
        return reply.code(status).send(result);
      }
      captureBackendEvent("live answer submitted", {
        distinctId: parsed.data.walletAddress,
        properties: {
          quiz_code: req.params.code.toUpperCase(),
          room_player_id: parsed.data.roomPlayerId,
          question_id: parsed.data.questionId,
          choice_id: parsed.data.choiceId,
          time_taken_ms: parsed.data.timeTakenMs,
          is_correct: result.isCorrect,
          points: result.points,
        },
      });
      return result;
    },
  );

  app.get<{ Params: { code: string } }>(
    "/rooms/:code/leaderboard",
    async (req, reply) => {
      const parsed = leaderboardQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const quiz = await prisma.quiz.findUnique({
        where: { code: req.params.code.toUpperCase() },
        select: { id: true },
      });
      if (!quiz) return reply.code(404).send({ error: "Quiz not found" });
      return leaderboard(quiz.id, {
        limit: normalizeLeaderboardLimit(parsed.data.limit),
        viewerUserId: parsed.data.viewerUserId ?? null,
      });
    },
  );

  app.get<{ Params: { code: string } }>(
    "/rooms/:code/payouts",
    async (req, reply) => {
      const quiz = await prisma.quiz.findUnique({
        where: { code: req.params.code.toUpperCase() },
        select: { id: true },
      });
      if (!quiz) return reply.code(404).send({ error: "Quiz not found" });
      return { payouts: await listPayoutsForQuiz(quiz.id) };
    },
  );

}
