import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import {
  AiGenerationDisabledError,
  generateQuestions,
} from "../services/ai-generation.service.js";

const bodySchema = z.object({
  topic: z.string().min(2).max(200),
  count: z.number().int().min(1).max(20),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  style: z.enum(["FACT", "CONCEPTUAL", "MIXED"]).optional(),
  language: z.string().max(40).optional(),
  notes: z.string().max(800).optional(),
  withExplanations: z.boolean().default(true),
});

export async function aiGenAdminRoutes(app: FastifyInstance) {
  app.post("/admin/ai/generate-questions", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const questions = await generateQuestions(parsed.data);
      return { questions };
    } catch (e) {
      if (e instanceof AiGenerationDisabledError) {
        return reply
          .code(503)
          .send({ error: "AI generation not configured (MOONSHOT_API_KEY missing)" });
      }
      req.log.error({ err: e }, "AI generation failed");
      return reply.code(502).send({
        error: e instanceof Error ? e.message : "AI generation failed",
      });
    }
  });
}
