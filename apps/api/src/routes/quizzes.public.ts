import type { FastifyInstance } from "fastify";
import { getPublicQuizByCode, listUpcomingPublicQuizzes } from "../services/quiz.service.js";

export async function publicQuizRoutes(app: FastifyInstance) {
  app.get("/quizzes/upcoming", async () => {
    const quizzes = await listUpcomingPublicQuizzes();
    return { quizzes };
  });

  app.get<{ Params: { code: string } }>("/quizzes/:code", async (req, reply) => {
    const result = await getPublicQuizByCode(req.params.code.toUpperCase());
    if (!result) return reply.code(404).send({ error: "Quiz not found" });
    return result;
  });
}
