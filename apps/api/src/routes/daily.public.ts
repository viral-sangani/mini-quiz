import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  dailyLeaderboardForDate,
  finishDailyPlay,
  getDailyToday,
  startDailyPlay,
  submitDailyAnswer,
} from "../services/daily.service.js";

const walletSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "invalid walletAddress");

const startSchema = z.object({ walletAddress: walletSchema });
const answerSchema = z.object({
  walletAddress: walletSchema,
  questionId: z.string().min(1),
  choiceId: z.string().min(1),
  timeTakenMs: z.number().int().min(0).max(120_000),
});
const finishSchema = z.object({ walletAddress: walletSchema });
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export async function dailyPublicRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { walletAddress?: string } }>(
    "/daily/today",
    async (req) => {
      const wallet = req.query.walletAddress;
      const result = await getDailyToday(new Date(), wallet);
      return result;
    },
  );

  app.post("/daily/start", async (req, reply) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await startDailyPlay(parsed.data.walletAddress);
    if (result.kind === "error") {
      const status =
        result.code === "BAD_INPUT"
          ? 400
          : result.code === "NEEDS_ONBOARDING"
            ? 401
            : result.code === "FINISHED"
              ? 409
              : 410;
      return reply.code(status).send({ error: result.error, code: result.code });
    }
    return result;
  });

  app.post("/daily/answer", async (req, reply) => {
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await submitDailyAnswer(parsed.data.walletAddress, {
      questionId: parsed.data.questionId,
      choiceId: parsed.data.choiceId,
      timeTakenMs: parsed.data.timeTakenMs,
    });
    if (result.kind === "expired") {
      return reply.code(410).send({ error: "Daily session expired", code: "EXPIRED" });
    }
    if (result.kind === "error") {
      return reply.code(400).send({ error: result.error });
    }
    return { isCorrect: result.isCorrect, points: result.points };
  });

  app.post("/daily/finish", async (req, reply) => {
    const parsed = finishSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await finishDailyPlay(parsed.data.walletAddress);
    if ("error" in result) {
      return reply.code(400).send({ error: result.error });
    }
    return result;
  });

  app.get<{ Querystring: { date?: string } }>(
    "/daily/leaderboard",
    async (req, reply) => {
      const dateInput = req.query.date;
      let dateStr: string;
      if (dateInput) {
        const parsed = dateSchema.safeParse(dateInput);
        if (!parsed.success) {
          return reply.code(400).send({ error: parsed.error.flatten() });
        }
        dateStr = parsed.data;
      } else {
        const now = new Date();
        dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
      }
      const result = await dailyLeaderboardForDate(dateStr);
      if (!result) return reply.code(404).send({ error: "No daily for that date" });
      return result;
    },
  );
}
