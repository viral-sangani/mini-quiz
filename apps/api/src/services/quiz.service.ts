import type { Difficulty, Prisma, QuizStatus } from "@prisma/client";
import type {
  AdminQuestion,
  AdminQuiz,
  PublicQuestion,
  PublicQuiz,
} from "@mini-quiz/shared";
import { lobbyOpensAtIso } from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { newRoomCode } from "./room-code.js";

// A scheduled quiz "occupies" the time window from its scheduledStart through
// the moment all questions could complete (questionTimeMs * questionCount + buffer).
// Two quizzes overlap if their windows intersect.
function quizEndEstimate(
  scheduledStart: Date,
  questionTimeMs: number,
  questionCount: number,
): Date {
  const durationMs = questionTimeMs * questionCount + 5_000;
  return new Date(scheduledStart.getTime() + durationMs);
}

// Reject overlapping schedules at create/edit time.
// Excludes archived quizzes and (optionally) the quiz being edited.
async function assertNoScheduleOverlap(args: {
  scheduledStart: Date;
  questionTimeMs: number;
  questionCount: number;
  excludeQuizId?: string;
}): Promise<void> {
  const start = args.scheduledStart;
  const end = quizEndEstimate(start, args.questionTimeMs, args.questionCount);

  // Find any non-archived SCHEDULED or LIVE quizzes whose [scheduledStart, endedAt|estimate]
  // window overlaps [start, end]. We compare on scheduledStart only and reject if
  // the other quiz's start is within OUR window OR our start is within theirs.
  const others = await prisma.quiz.findMany({
    where: {
      kind: "LIVE",
      archivedAt: null,
      status: { in: ["SCHEDULED", "LIVE"] },
      ...(args.excludeQuizId ? { NOT: { id: args.excludeQuizId } } : {}),
      scheduledStart: { not: null },
    },
    select: {
      id: true,
      title: true,
      scheduledStart: true,
      endedAt: true,
      questionTimeMs: true,
      _count: { select: { questions: true } },
    },
  });

  for (const o of others) {
    if (!o.scheduledStart) continue;
    const oStart = o.scheduledStart;
    const oEnd =
      o.endedAt ?? quizEndEstimate(oStart, o.questionTimeMs, o._count.questions);
    // Standard interval overlap: a.start < b.end AND b.start < a.end
    if (start < oEnd && oStart < end) {
      const e = new Error(
        `Schedule conflict with quiz "${o.title}" (${o.scheduledStart.toISOString()}). ` +
          `Pick a different start time.`,
      ) as Error & { code?: string };
      e.code = "SCHEDULE_CONFLICT";
      throw e;
    }
  }
}

export type CreateQuizInput = {
  title: string;
  description?: string | null;
  scheduledStart: Date | null;
  questionTimeMs: number;
  prizeAmounts: string[];
  difficulty?: Difficulty;
  coverColor?: string;
  questions: {
    prompt: string;
    choices: { id: string; label: string }[];
    correctChoiceId: string;
  }[];
};

function serializeAdminQuiz(
  q: Prisma.QuizGetPayload<{ include: { _count: { select: { questions: true; players: true } } } }>,
): AdminQuiz {
  const scheduledStart = q.scheduledStart?.toISOString() ?? null;
  return {
    id: q.id,
    code: q.code,
    title: q.title,
    description: q.description,
    status: q.status,
    scheduledStart,
    startedAt: q.startedAt?.toISOString() ?? null,
    endedAt: q.endedAt?.toISOString() ?? null,
    questionTimeMs: q.questionTimeMs,
    prizeAmounts: q.prizeAmounts,
    difficulty: q.difficulty,
    coverColor: q.coverColor,
    questionCount: q._count.questions,
    playerCount: q._count.players,
    lobbyOpensAt: lobbyOpensAtIso(scheduledStart),
    archivedAt: q.archivedAt?.toISOString() ?? null,
    createdById: q.createdById,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

function serializePublicQuiz(
  q: Prisma.QuizGetPayload<{ include: { _count: { select: { questions: true; players: true } } } }>,
): PublicQuiz {
  const scheduledStart = q.scheduledStart?.toISOString() ?? null;
  return {
    id: q.id,
    code: q.code,
    title: q.title,
    description: q.description,
    status: q.status,
    scheduledStart,
    startedAt: q.startedAt?.toISOString() ?? null,
    endedAt: q.endedAt?.toISOString() ?? null,
    questionTimeMs: q.questionTimeMs,
    prizeAmounts: q.prizeAmounts,
    difficulty: q.difficulty,
    coverColor: q.coverColor,
    questionCount: q._count.questions,
    playerCount: q._count.players,
    lobbyOpensAt: lobbyOpensAtIso(scheduledStart),
  };
}

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newRoomCode();
    const exists = await prisma.quiz.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("Could not allocate room code");
}

export async function createQuiz(
  adminUserId: string,
  input: CreateQuizInput,
): Promise<AdminQuiz> {
  if (input.scheduledStart) {
    await assertNoScheduleOverlap({
      scheduledStart: input.scheduledStart,
      questionTimeMs: input.questionTimeMs,
      questionCount: input.questions.length,
    });
  }
  const code = await generateUniqueCode();
  const status: QuizStatus = input.scheduledStart ? "SCHEDULED" : "DRAFT";
  const quiz = await prisma.quiz.create({
    data: {
      code,
      title: input.title,
      description: input.description ?? null,
      scheduledStart: input.scheduledStart,
      status,
      questionTimeMs: input.questionTimeMs,
      prizeAmounts: input.prizeAmounts,
      difficulty: input.difficulty,
      coverColor: input.coverColor,
      createdById: adminUserId,
      questions: {
        create: input.questions.map((q, idx) => ({
          position: idx,
          prompt: q.prompt,
          choices: q.choices,
          correctChoiceId: q.correctChoiceId,
        })),
      },
    },
    include: { _count: { select: { questions: true, players: true } } },
  });
  return serializeAdminQuiz(quiz);
}

export type UpdateQuizInput = Partial<
  Pick<
    CreateQuizInput,
    | "title"
    | "description"
    | "scheduledStart"
    | "questionTimeMs"
    | "prizeAmounts"
    | "difficulty"
    | "coverColor"
  >
> & {
  questions?: CreateQuizInput["questions"];
};

export async function updateQuiz(
  quizId: string,
  input: UpdateQuizInput,
): Promise<AdminQuiz> {
  const existing = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!existing) throw new Error("Quiz not found");
  if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
    throw new Error(`Cannot edit quiz with status ${existing.status}`);
  }

  const nextStatus: QuizStatus =
    input.scheduledStart === null
      ? "DRAFT"
      : input.scheduledStart !== undefined
        ? "SCHEDULED"
        : existing.status;

  // If we're scheduling (or rescheduling) this quiz, check for conflicts.
  const effectiveStart =
    input.scheduledStart !== undefined ? input.scheduledStart : existing.scheduledStart;
  if (effectiveStart) {
    const questionCount =
      input.questions?.length ??
      (await prisma.question.count({ where: { quizId } }));
    await assertNoScheduleOverlap({
      scheduledStart: effectiveStart,
      questionTimeMs: input.questionTimeMs ?? existing.questionTimeMs,
      questionCount,
      excludeQuizId: quizId,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.questions) {
      await tx.question.deleteMany({ where: { quizId } });
      await tx.question.createMany({
        data: input.questions.map((q, idx) => ({
          quizId,
          position: idx,
          prompt: q.prompt,
          choices: q.choices,
          correctChoiceId: q.correctChoiceId,
        })),
      });
    }
    return tx.quiz.update({
      where: { id: quizId },
      data: {
        title: input.title,
        description: input.description,
        scheduledStart: input.scheduledStart,
        questionTimeMs: input.questionTimeMs,
        prizeAmounts: input.prizeAmounts,
        difficulty: input.difficulty,
        coverColor: input.coverColor,
        status: nextStatus,
      },
      include: { _count: { select: { questions: true, players: true } } },
    });
  });
  return serializeAdminQuiz(updated);
}

export async function archiveQuiz(quizId: string): Promise<void> {
  const existing = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!existing) throw new Error("Quiz not found");
  if (existing.status === "DRAFT") {
    // Never-run drafts are safe to hard-delete.
    await prisma.quiz.delete({ where: { id: quizId } });
    return;
  }
  await prisma.quiz.update({
    where: { id: quizId },
    data: { archivedAt: new Date(), status: "ARCHIVED" },
  });
}

export async function listAdminQuizzes(filter: {
  status?: QuizStatus | "ALL";
  includeArchived?: boolean;
}): Promise<AdminQuiz[]> {
  const where: Prisma.QuizWhereInput = { kind: "LIVE" };
  if (filter.status && filter.status !== "ALL") where.status = filter.status;
  if (!filter.includeArchived) where.archivedAt = null;
  const quizzes = await prisma.quiz.findMany({
    where,
    include: { _count: { select: { questions: true, players: true } } },
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
  });
  return quizzes.map(serializeAdminQuiz);
}

// Returns every non-archived quiz that's still relevant to a player:
//  - SCHEDULED with a future scheduledStart (pre-lobby, lobby-open, or about-to-start)
//  - LIVE quizzes (visible but not joinable; cannot late-join)
// Sorted by scheduledStart ascending.
export async function listUpcomingPublicQuizzes(): Promise<PublicQuiz[]> {
  const now = new Date();
  const quizzes = await prisma.quiz.findMany({
    where: {
      kind: "LIVE",
      archivedAt: null,
      OR: [
        { status: "SCHEDULED", scheduledStart: { gte: now } },
        { status: "LIVE" },
      ],
    },
    include: { _count: { select: { questions: true, players: true } } },
    orderBy: { scheduledStart: "asc" },
  });
  return quizzes.map(serializePublicQuiz);
}

export async function getPublicQuizByCode(code: string): Promise<
  | {
      quiz: PublicQuiz;
      questions: PublicQuestion[];
    }
  | null
> {
  const q = await prisma.quiz.findUnique({
    where: { code },
    include: {
      _count: { select: { questions: true, players: true } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  // Public quiz lookup never exposes DAILY quizzes — those are only reachable
  // via /daily routes.
  if (!q || q.archivedAt || q.kind !== "LIVE") return null;
  return {
    quiz: serializePublicQuiz(q),
    // Correct answer intentionally stripped from the public payload.
    questions: q.questions.map((qq) => ({
      id: qq.id,
      position: qq.position,
      prompt: qq.prompt,
      choices: qq.choices as { id: string; label: string }[],
    })),
  };
}

export async function getAdminQuiz(
  quizId: string,
): Promise<{ quiz: AdminQuiz; questions: AdminQuestion[] } | null> {
  const q = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      _count: { select: { questions: true, players: true } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  if (!q) return null;
  return {
    quiz: serializeAdminQuiz(q),
    questions: q.questions.map((qq) => ({
      id: qq.id,
      position: qq.position,
      prompt: qq.prompt,
      choices: qq.choices as { id: string; label: string }[],
      correctChoiceId: qq.correctChoiceId,
    })),
  };
}
