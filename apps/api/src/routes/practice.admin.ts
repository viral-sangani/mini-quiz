import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import {
  bulkAddQuestions,
  createTopic,
  deleteQuestion,
  deleteTopic,
  getAdminTopicDetail,
  listAdminTopics,
  updateQuestion,
  updateTopic,
} from "../services/practice.service.js";

const choiceSchema = z.object({
  id: z.string().min(1).max(4),
  label: z.string().min(1).max(200),
});
const questionSchema = z.object({
  prompt: z.string().min(1).max(500),
  choices: z.array(choiceSchema).length(4),
  correctChoiceId: z.string().min(1),
  explanation: z.string().max(800).optional().nullable(),
});

const slugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/, "slug must be lowercase, numbers, hyphens");

const createTopicSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(120),
  description: z.string().max(800).optional().nullable(),
  iconName: z.string().max(40).optional(),
  coverColor: z.string().max(40).optional(),
  published: z.boolean().optional(),
});
const updateTopicSchema = createTopicSchema.partial();

export async function practiceAdminRoutes(app: FastifyInstance) {
  app.get("/admin/practice/topics", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const topics = await listAdminTopics();
    return { topics };
  });

  app.get<{ Params: { id: string } }>(
    "/admin/practice/topics/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const detail = await getAdminTopicDetail(req.params.id);
      if (!detail) return reply.code(404).send({ error: "Topic not found" });
      return detail;
    },
  );

  app.post("/admin/practice/topics", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = createTopicSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const topic = await createTopic(admin.userId, parsed.data);
      return { topic };
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.message?.includes("Unique") || (err as { code?: string }).code === "P2002") {
        return reply.code(409).send({ error: "Slug already in use" });
      }
      return reply.code(400).send({ error: err.message ?? "Create failed" });
    }
  });

  app.patch<{ Params: { id: string } }>(
    "/admin/practice/topics/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const parsed = updateTopicSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      try {
        await updateTopic(req.params.id, parsed.data);
        return { ok: true };
      } catch (e) {
        return reply
          .code(400)
          .send({ error: e instanceof Error ? e.message : "Update failed" });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/admin/practice/topics/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      try {
        await deleteTopic(req.params.id);
        return { ok: true };
      } catch (e) {
        return reply
          .code(400)
          .send({ error: e instanceof Error ? e.message : "Delete failed" });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/admin/practice/topics/:id/questions",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const parsed = z
        .object({ questions: z.array(questionSchema).min(1).max(50) })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      // Cross-field check: every correctChoiceId references an actual choice.
      for (let i = 0; i < parsed.data.questions.length; i++) {
        const q = parsed.data.questions[i]!;
        const ids = new Set(q.choices.map((c) => c.id));
        if (!ids.has(q.correctChoiceId)) {
          return reply.code(400).send({
            error: `Question ${i + 1}: correctChoiceId does not match any choice id`,
          });
        }
      }
      const result = await bulkAddQuestions(req.params.id, parsed.data.questions);
      return result;
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/admin/practice/questions/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const parsed = questionSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      if (parsed.data.choices && parsed.data.correctChoiceId) {
        const ids = new Set(parsed.data.choices.map((c) => c.id));
        if (!ids.has(parsed.data.correctChoiceId)) {
          return reply
            .code(400)
            .send({ error: "correctChoiceId does not match any choice id" });
        }
      }
      try {
        await updateQuestion(req.params.id, parsed.data);
        return { ok: true };
      } catch (e) {
        return reply
          .code(400)
          .send({ error: e instanceof Error ? e.message : "Update failed" });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/admin/practice/questions/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      try {
        await deleteQuestion(req.params.id);
        return { ok: true };
      } catch (e) {
        return reply
          .code(400)
          .send({ error: e instanceof Error ? e.message : "Delete failed" });
      }
    },
  );
}
