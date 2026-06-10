import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import {
  AiGenerationDisabledError,
  generateQuestions,
  suggestTopics,
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

const suggestTopicsBodySchema = z.object({
  mode: z.enum(["live", "daily", "practice"]),
  count: z.number().int().min(1).max(12).default(6),
  seed: z.string().max(200).optional(),
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
          .send({
            error: "AI generation not configured (OPENROUTER_API_KEY missing)",
          });
      }
      req.log.error({ err: e }, "AI generation failed");
      return reply.code(502).send({
        error: e instanceof Error ? e.message : "AI generation failed",
      });
    }
  });

  app.post("/admin/ai/suggest-topics", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = suggestTopicsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const topics = await suggestTopics(parsed.data);
      return { topics };
    } catch (e) {
      if (e instanceof AiGenerationDisabledError) {
        return reply
          .code(503)
          .send({
            error: "AI generation not configured (OPENROUTER_API_KEY missing)",
          });
      }
      req.log.error({ err: e }, "AI topic suggestion failed");
      return reply.code(502).send({
        error: e instanceof Error ? e.message : "AI topic suggestion failed",
      });
    }
  });
}
