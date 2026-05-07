import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RoomEvent } from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { joinRoom, leaderboard, submitAnswer } from "../services/room.service.js";
import { listPayoutsForQuiz } from "../services/payout.service.js";
import { subscribe } from "../sse/broker.js";

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
      return result;
    },
  );

  app.get<{ Params: { code: string } }>(
    "/rooms/:code/leaderboard",
    async (req, reply) => {
      const quiz = await prisma.quiz.findUnique({
        where: { code: req.params.code.toUpperCase() },
        select: { id: true },
      });
      if (!quiz) return reply.code(404).send({ error: "Quiz not found" });
      return { rows: await leaderboard(quiz.id) };
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

  // SSE endpoint.
  app.get<{ Params: { code: string } }>(
    "/rooms/:code/events",
    async (req, reply) => {
      const quiz = await prisma.quiz.findUnique({
        where: { code: req.params.code.toUpperCase() },
        select: { id: true },
      });
      if (!quiz) return reply.code(404).send({ error: "Quiz not found" });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(": connected\n\n");
      reply.raw.write("retry: 3000\n\n");

      // Send initial leaderboard snapshot immediately.
      const rows = await leaderboard(quiz.id);
      const initial: RoomEvent = { type: "leaderboard", rows };
      reply.raw.write(`data: ${JSON.stringify(initial)}\n\n`);

      const unsub = subscribe(quiz.id, {
        id: `${quiz.id}-${Date.now()}-${Math.random()}`,
        send: (event) => {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        },
      });

      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(": heartbeat\n\n");
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      req.raw.on("close", () => {
        clearInterval(heartbeat);
        unsub();
      });

      // Keep the handler pending — Fastify will not close the stream.
      return reply;
    },
  );
}
