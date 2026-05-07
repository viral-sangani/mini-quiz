import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import { Prisma, prisma } from "../db.js";
import {
  dailyLeaderboardForDate,
  dailyLeaderboardLive,
  todayUtcDate,
} from "../services/daily.service.js";
import { newRoomCode } from "../services/room-code.js";

const choiceSchema = z.object({
  id: z.string().min(1).max(4),
  label: z.string().min(1).max(200),
});
const questionSchema = z.object({
  prompt: z.string().min(1).max(500),
  choices: z.array(choiceSchema).length(4),
  correctChoiceId: z.string().min(1),
  // Optional explanation surfaced to the player on the post-quiz finish screen.
  // Practice carries this field too; daily lets us reuse the AI generator.
  explanation: z.string().max(800).optional().nullable(),
});

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const createSchema = z.object({
  date: dateSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  questions: z.array(questionSchema).length(10),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  questions: z.array(questionSchema).length(10).optional(),
});

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

async function generateUniqueDailyCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newRoomCode();
    const exists = await prisma.quiz.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("Could not allocate room code");
}

export async function dailyAdminRoutes(app: FastifyInstance) {
  // List: next 14 days + the most recent past 14 days.
  app.get("/admin/daily", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const today = todayUtcDate();
    const upcoming = await prisma.quiz.findMany({
      where: { kind: "DAILY", dailyDate: { gte: today } },
      include: { _count: { select: { questions: true, players: true } } },
      orderBy: { dailyDate: "asc" },
    });
    const past = await prisma.quiz.findMany({
      where: { kind: "DAILY", dailyDate: { lt: today } },
      include: {
        _count: { select: { questions: true, players: true } },
        dailySnapshot: { select: { winnerUserId: true } },
      },
      orderBy: { dailyDate: "desc" },
      take: 30,
    });
    return {
      upcoming: upcoming.map(serializeRow),
      past: past.map((q) => ({
        ...serializeRow(q),
        winnerUserId: q.dailySnapshot?.winnerUserId ?? null,
      })),
    };
  });

  app.get<{ Params: { id: string } }>(
    "/admin/daily/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const q = await prisma.quiz.findFirst({
        where: { id: req.params.id, kind: "DAILY" },
        include: {
          questions: { orderBy: { position: "asc" } },
          _count: { select: { players: true } },
        },
      });
      if (!q) return reply.code(404).send({ error: "Daily not found" });
      return {
        id: q.id,
        title: q.title,
        description: q.description,
        status: q.status,
        date: q.dailyDate?.toISOString().slice(0, 10) ?? null,
        playerCount: q._count.players,
        questions: q.questions.map((qq) => ({
          id: qq.id,
          position: qq.position,
          prompt: qq.prompt,
          choices: qq.choices,
          correctChoiceId: qq.correctChoiceId,
        })),
      };
    },
  );

  app.post("/admin/daily", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = createSchema.safeParse(req.body);
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

    const date = parseDate(parsed.data.date);
    if (Number.isNaN(date.getTime())) {
      return reply.code(400).send({ error: "Invalid date" });
    }
    if (date < todayUtcDate()) {
      return reply.code(400).send({ error: "Cannot schedule daily in the past" });
    }

    const today = todayUtcDate();
    const status = date.getTime() === today.getTime() ? "LIVE" : "SCHEDULED";

    try {
      const code = await generateUniqueDailyCode();
      const created = await prisma.quiz.create({
        data: {
          code,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          status,
          startedAt: status === "LIVE" ? new Date() : null,
          questionTimeMs: 20_000,
          prizeAmounts: [],
          kind: "DAILY",
          dailyDate: date,
          createdById: admin.userId,
          questions: {
            create: parsed.data.questions.map((q, idx) => ({
              position: idx,
              prompt: q.prompt,
              choices: q.choices,
              correctChoiceId: q.correctChoiceId,
            })),
          },
        },
      });
      return { id: created.id };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return reply
          .code(409)
          .send({ error: "A daily quiz already exists for that date" });
      }
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>(
    "/admin/daily/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const existing = await prisma.quiz.findFirst({
        where: { id: req.params.id, kind: "DAILY" },
      });
      if (!existing) return reply.code(404).send({ error: "Daily not found" });
      if (existing.status === "LIVE" || existing.status === "ENDED") {
        return reply
          .code(400)
          .send({ error: "Cannot edit a daily that has already started" });
      }
      if (parsed.data.questions) {
        for (let i = 0; i < parsed.data.questions.length; i++) {
          const q = parsed.data.questions[i]!;
          const ids = new Set(q.choices.map((c) => c.id));
          if (!ids.has(q.correctChoiceId)) {
            return reply.code(400).send({
              error: `Question ${i + 1}: correctChoiceId does not match any choice id`,
            });
          }
        }
      }
      await prisma.$transaction(async (tx) => {
        if (parsed.data.questions) {
          await tx.question.deleteMany({ where: { quizId: existing.id } });
          await tx.question.createMany({
            data: parsed.data.questions.map((q, idx) => ({
              quizId: existing.id,
              position: idx,
              prompt: q.prompt,
              choices: q.choices,
              correctChoiceId: q.correctChoiceId,
            })),
          });
        }
        await tx.quiz.update({
          where: { id: existing.id },
          data: {
            title: parsed.data.title,
            description: parsed.data.description,
          },
        });
      });
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/admin/daily/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const existing = await prisma.quiz.findFirst({
        where: { id: req.params.id, kind: "DAILY" },
      });
      if (!existing) return reply.code(404).send({ error: "Daily not found" });
      if (existing.status === "LIVE" || existing.status === "ENDED") {
        return reply
          .code(400)
          .send({ error: "Cannot delete a daily that has already started" });
      }
      await prisma.quiz.delete({ where: { id: existing.id } });
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/admin/daily/:id/leaderboard",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const q = await prisma.quiz.findFirst({
        where: { id: req.params.id, kind: "DAILY" },
        select: { id: true, dailyDate: true, status: true },
      });
      if (!q) return reply.code(404).send({ error: "Daily not found" });
      if (q.status === "LIVE") {
        return { rows: await dailyLeaderboardLive(q.id), finalized: false };
      }
      const date = q.dailyDate?.toISOString().slice(0, 10);
      if (!date) return { rows: [], finalized: false };
      const result = await dailyLeaderboardForDate(date);
      return result ?? { rows: [], finalized: true };
    },
  );
}

function serializeRow(q: {
  id: string;
  title: string;
  status: string;
  dailyDate: Date | null;
  description: string | null;
  _count: { questions: number; players: number };
}) {
  return {
    id: q.id,
    title: q.title,
    description: q.description,
    status: q.status,
    date: q.dailyDate?.toISOString().slice(0, 10) ?? null,
    questionCount: q._count.questions,
    playerCount: q._count.players,
  };
}
