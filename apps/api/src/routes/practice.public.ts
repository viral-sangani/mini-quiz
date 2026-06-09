import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  finishPracticeSession,
  listPublishedPracticeQuizzes,
  startPracticeSession,
  submitPracticeAnswer,
} from "../services/practice.service.js";
import { captureBackendEvent } from "../services/posthog.js";

const wallet = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "invalid walletAddress");

const startSchema = z.object({
  walletAddress: wallet,
  slug: z.string().min(1),
});
const answerSchema = z.object({
  walletAddress: wallet,
  playId: z.string().min(1),
  questionId: z.string().min(1),
  choiceId: z.string().min(1),
});
const finishSchema = z.object({
  walletAddress: wallet,
  playId: z.string().min(1),
});

export async function practicePublicRoutes(app: FastifyInstance) {
  app.get("/practice/quizzes", async () => {
    const quizzes = await listPublishedPracticeQuizzes();
    return { quizzes };
  });

  app.post("/practice/start", async (req, reply) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await startPracticeSession(
      parsed.data.walletAddress,
      parsed.data.slug,
    );
    if (result.kind === "error") {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "NEEDS_ONBOARDING"
            ? 401
            : 400;
      return reply.code(status).send({ error: result.error, code: result.code });
    }
    captureBackendEvent("practice play started", {
      distinctId: parsed.data.walletAddress,
      properties: {
        quiz_id: result.quizId,
        play_id: result.playId,
        slug: parsed.data.slug,
        title: result.title,
        question_count: result.questions.length,
      },
    });
    return result;
  });

  app.post("/practice/answer", async (req, reply) => {
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await submitPracticeAnswer(parsed.data.walletAddress, {
      playId: parsed.data.playId,
      questionId: parsed.data.questionId,
      choiceId: parsed.data.choiceId,
    });
    if (result.kind === "error") {
      return reply.code(400).send({ error: result.error });
    }
    captureBackendEvent("practice answer submitted", {
      distinctId: parsed.data.walletAddress,
      properties: {
        play_id: parsed.data.playId,
        question_id: parsed.data.questionId,
        choice_id: parsed.data.choiceId,
        is_correct: result.isCorrect,
      },
    });
    return {
      isCorrect: result.isCorrect,
      correctChoiceId: result.correctChoiceId,
      explanation: result.explanation,
    };
  });

  app.post("/practice/finish", async (req, reply) => {
    const parsed = finishSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await finishPracticeSession(
      parsed.data.walletAddress,
      parsed.data.playId,
    );
    if ("error" in result) {
      return reply.code(400).send({ error: result.error });
    }
    captureBackendEvent("practice play finished", {
      distinctId: parsed.data.walletAddress,
      properties: {
        play_id: parsed.data.playId,
        score_correct: result.scoreCorrect,
        score_total: result.scoreTotal,
        new_badges: result.newBadges,
      },
    });
    return result;
  });
}
