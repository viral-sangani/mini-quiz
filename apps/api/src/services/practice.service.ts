import type { Choice } from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { awardBadge } from "./badge.service.js";

export const PRACTICE_QUESTIONS_PER_PLAY = 10;

// Public-safe shape of a practice quiz (no admin-only fields like createdById).
export type PublicPracticeQuiz = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconName: string;
  coverColor: string;
  questionCount: number;
};

// Practice question without the correct answer or explanation.
export type PublicPracticeQuestion = {
  id: string;
  prompt: string;
  choices: Choice[];
};

export async function listPublishedPracticeQuizzes(): Promise<
  PublicPracticeQuiz[]
> {
  const quizzes = await prisma.practiceQuiz.findMany({
    where: { published: true },
    include: { _count: { select: { questions: true } } },
    orderBy: { createdAt: "asc" },
  });
  return quizzes
    .filter((q) => q._count.questions >= PRACTICE_QUESTIONS_PER_PLAY)
    .map((q) => ({
      id: q.id,
      slug: q.slug,
      title: q.title,
      description: q.description,
      iconName: q.iconName,
      coverColor: q.coverColor,
      questionCount: q._count.questions,
    }));
}

export type StartPracticeResult =
  | {
      kind: "ok";
      playId: string;
      quizId: string;
      title: string;
      questions: PublicPracticeQuestion[];
    }
  | {
      kind: "error";
      error: string;
      code: "NOT_FOUND" | "TOO_FEW" | "BAD_INPUT" | "NEEDS_ONBOARDING";
    };

export async function startPracticeSession(
  walletAddress: string,
  slug: string,
): Promise<StartPracticeResult> {
  const addr = walletAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) {
    return { kind: "error", error: "invalid walletAddress", code: "BAD_INPUT" };
  }
  const user = await prisma.user.findFirst({
    where: { walletAddress: addr, deletedAt: null },
    select: {
      id: true,
      displayName: true,
      username: true,
      avatarEmoji: true,
      avatarColor: true,
    },
  });
  if (
    !user ||
    !user.displayName ||
    !user.username ||
    !user.avatarEmoji ||
    !user.avatarColor
  ) {
    return {
      kind: "error",
      error: "Profile incomplete — finish onboarding first",
      code: "NEEDS_ONBOARDING",
    };
  }
  const quiz = await prisma.practiceQuiz.findUnique({
    where: { slug },
    include: { questions: true },
  });
  if (!quiz || !quiz.published) {
    return { kind: "error", error: "Practice quiz not found", code: "NOT_FOUND" };
  }
  if (quiz.questions.length < PRACTICE_QUESTIONS_PER_PLAY) {
    return {
      kind: "error",
      error: "Practice quiz has too few questions to play",
      code: "TOO_FEW",
    };
  }
  // Sample 10 random questions (Fisher-Yates partial shuffle).
  const ids = quiz.questions.map((q) => q.id);
  for (let i = 0; i < PRACTICE_QUESTIONS_PER_PLAY; i++) {
    const j = i + Math.floor(Math.random() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  const picked = ids.slice(0, PRACTICE_QUESTIONS_PER_PLAY);
  const byId = new Map(quiz.questions.map((q) => [q.id, q]));
  const play = await prisma.practicePlay.create({
    data: {
      quizId: quiz.id,
      userId: user.id,
      questionIds: picked,
      scoreTotal: PRACTICE_QUESTIONS_PER_PLAY,
    },
  });
  return {
    kind: "ok",
    playId: play.id,
    quizId: quiz.id,
    title: quiz.title,
    questions: picked.map((id) => {
      const q = byId.get(id)!;
      return {
        id: q.id,
        prompt: q.prompt,
        choices: q.choices as Choice[],
      };
    }),
  };
}

export type SubmitPracticeResult =
  | {
      kind: "ok";
      isCorrect: boolean;
      correctChoiceId: string;
      explanation: string | null;
    }
  | { kind: "error"; error: string };

export async function submitPracticeAnswer(
  walletAddress: string,
  input: { playId: string; questionId: string; choiceId: string },
): Promise<SubmitPracticeResult> {
  const addr = walletAddress.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { walletAddress: addr, deletedAt: null },
    select: { id: true },
  });
  if (!user) return { kind: "error", error: "User not found" };
  const play = await prisma.practicePlay.findUnique({
    where: { id: input.playId },
  });
  if (!play || play.userId !== user.id) {
    return { kind: "error", error: "Play not found" };
  }
  if (!play.questionIds.includes(input.questionId)) {
    return { kind: "error", error: "Question not part of this play" };
  }
  const q = await prisma.practiceQuestion.findUnique({
    where: { id: input.questionId },
  });
  if (!q) return { kind: "error", error: "Question not found" };
  const isCorrect = input.choiceId === q.correctChoiceId;
  if (isCorrect && !play.finishedAt) {
    // Increment scoreCorrect; cap at scoreTotal in case of double-submit
    // (though we don't enforce per-question idempotency in practice).
    await prisma.practicePlay.update({
      where: { id: play.id },
      data: { scoreCorrect: Math.min(play.scoreCorrect + 1, play.scoreTotal) },
    });
  }
  return {
    kind: "ok",
    isCorrect,
    correctChoiceId: q.correctChoiceId,
    explanation: q.explanation,
  };
}

export type FinishPracticeResult = {
  scoreCorrect: number;
  scoreTotal: number;
  newBadges: string[];
};

export async function finishPracticeSession(
  walletAddress: string,
  playId: string,
): Promise<FinishPracticeResult | { error: string }> {
  const addr = walletAddress.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { walletAddress: addr, deletedAt: null },
    select: { id: true },
  });
  if (!user) return { error: "User not found" };
  const play = await prisma.practicePlay.findUnique({ where: { id: playId } });
  if (!play || play.userId !== user.id) return { error: "Play not found" };

  if (!play.finishedAt) {
    await prisma.practicePlay.update({
      where: { id: playId },
      data: { finishedAt: new Date() },
    });
  }

  // Practice badges:
  //   practice_explorer: tried 5 distinct practice quizzes
  //   practice_scholar:  completed 50 plays
  // Both are computed from finished plays only (so abandons don't count).
  const finished = await prisma.practicePlay.findMany({
    where: { userId: user.id, finishedAt: { not: null } },
    select: { quizId: true },
  });
  const distinctQuizzes = new Set(finished.map((p) => p.quizId)).size;

  const newBadges: string[] = [];
  if (distinctQuizzes >= 5) {
    if (await awardBadge(user.id, "practice_explorer")) {
      newBadges.push("practice_explorer");
    }
  }
  if (finished.length >= 50) {
    if (await awardBadge(user.id, "practice_scholar")) {
      newBadges.push("practice_scholar");
    }
  }

  return {
    scoreCorrect: play.scoreCorrect,
    scoreTotal: play.scoreTotal,
    newBadges,
  };
}

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

export type AdminPracticeQuiz = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconName: string;
  coverColor: string;
  published: boolean;
  questionCount: number;
  // Distinct-user count of plays (started or finished — we count anyone who
  // entered the quiz).
  headCount: number;
  // Total finished plays across all users (drives the admin sort).
  playCount: number;
  // Average score % over finished plays. 0 when there are no plays yet.
  avgScorePct: number;
  // ISO timestamp of the most recent finished play, or null.
  lastPlayedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listAdminPracticeQuizzes(): Promise<AdminPracticeQuiz[]> {
  const quizzes = await prisma.practiceQuiz.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { createdAt: "desc" },
  });
  // Distinct user count + per-quiz aggregates in one DB read each.
  const grouped = await prisma.practicePlay.groupBy({
    by: ["quizId", "userId"],
    _count: { _all: true },
  });
  const byQuiz = new Map<string, Set<string>>();
  for (const g of grouped) {
    if (!byQuiz.has(g.quizId)) byQuiz.set(g.quizId, new Set());
    byQuiz.get(g.quizId)!.add(g.userId);
  }

  // Finished-play stats (count, score totals, last play). Only finished
  // plays count toward "plays" — abandons are noise.
  const finished = await prisma.practicePlay.findMany({
    where: { finishedAt: { not: null } },
    select: {
      quizId: true,
      scoreCorrect: true,
      scoreTotal: true,
      finishedAt: true,
    },
  });
  type Stats = {
    plays: number;
    correctSum: number;
    totalSum: number;
    last: Date | null;
  };
  const statsByQuiz = new Map<string, Stats>();
  for (const p of finished) {
    let s = statsByQuiz.get(p.quizId);
    if (!s) {
      s = { plays: 0, correctSum: 0, totalSum: 0, last: null };
      statsByQuiz.set(p.quizId, s);
    }
    s.plays += 1;
    s.correctSum += p.scoreCorrect;
    s.totalSum += p.scoreTotal;
    if (p.finishedAt && (!s.last || p.finishedAt > s.last)) {
      s.last = p.finishedAt;
    }
  }

  return quizzes.map((q) => {
    const s = statsByQuiz.get(q.id);
    const playCount = s?.plays ?? 0;
    const avgScorePct =
      s && s.totalSum > 0
        ? Math.round((s.correctSum / s.totalSum) * 100)
        : 0;
    return {
      id: q.id,
      slug: q.slug,
      title: q.title,
      description: q.description,
      iconName: q.iconName,
      coverColor: q.coverColor,
      published: q.published,
      questionCount: q._count.questions,
      headCount: byQuiz.get(q.id)?.size ?? 0,
      playCount,
      avgScorePct,
      lastPlayedAt: s?.last?.toISOString() ?? null,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    };
  });
}

export type AdminPracticeQuestion = {
  id: string;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string | null;
  createdAt: string;
};

export async function getAdminPracticeQuizDetail(
  quizId: string,
): Promise<(AdminPracticeQuiz & { questions: AdminPracticeQuestion[] }) | null> {
  const quiz = await prisma.practiceQuiz.findUnique({
    where: { id: quizId },
    include: {
      questions: { orderBy: { createdAt: "asc" } },
      _count: { select: { questions: true } },
    },
  });
  if (!quiz) return null;
  const distinct = await prisma.practicePlay.findMany({
    where: { quizId },
    select: { userId: true },
    distinct: ["userId"],
  });
  return {
    id: quiz.id,
    slug: quiz.slug,
    title: quiz.title,
    description: quiz.description,
    iconName: quiz.iconName,
    coverColor: quiz.coverColor,
    published: quiz.published,
    questionCount: quiz._count.questions,
    headCount: distinct.length,
    // Detail page doesn't display these stats, but the type contract
    // demands them. Compute on demand if we ever need them here.
    playCount: 0,
    avgScorePct: 0,
    lastPlayedAt: null,
    createdAt: quiz.createdAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
    questions: quiz.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices as Choice[],
      correctChoiceId: q.correctChoiceId,
      explanation: q.explanation,
      createdAt: q.createdAt.toISOString(),
    })),
  };
}

export type CreatePracticeQuizInput = {
  slug: string;
  title: string;
  description?: string | null;
  iconName?: string;
  coverColor?: string;
  published?: boolean;
};

export async function createPracticeQuiz(
  createdById: string,
  input: CreatePracticeQuizInput,
): Promise<AdminPracticeQuiz> {
  const q = await prisma.practiceQuiz.create({
    data: {
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      iconName: input.iconName ?? "book",
      coverColor: input.coverColor ?? "primary",
      published: input.published ?? false,
      createdById,
    },
  });
  return {
    id: q.id,
    slug: q.slug,
    title: q.title,
    description: q.description,
    iconName: q.iconName,
    coverColor: q.coverColor,
    published: q.published,
    questionCount: 0,
    headCount: 0,
    playCount: 0,
    avgScorePct: 0,
    lastPlayedAt: null,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

export async function updatePracticeQuiz(
  id: string,
  patch: Partial<CreatePracticeQuizInput>,
): Promise<void> {
  await prisma.practiceQuiz.update({
    where: { id },
    data: {
      slug: patch.slug,
      title: patch.title,
      description: patch.description,
      iconName: patch.iconName,
      coverColor: patch.coverColor,
      published: patch.published,
    },
  });
}

export async function deletePracticeQuiz(id: string): Promise<void> {
  await prisma.practiceQuiz.delete({ where: { id } });
}

export type WriteQuestionInput = {
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation?: string | null;
};

export async function bulkAddQuestions(
  quizId: string,
  questions: WriteQuestionInput[],
): Promise<{ count: number }> {
  if (questions.length === 0) return { count: 0 };
  await prisma.practiceQuestion.createMany({
    data: questions.map((q) => ({
      quizId,
      prompt: q.prompt,
      choices: q.choices as unknown as object,
      correctChoiceId: q.correctChoiceId,
      explanation: q.explanation ?? null,
    })),
  });
  return { count: questions.length };
}

export async function updateQuestion(
  id: string,
  patch: Partial<WriteQuestionInput>,
): Promise<void> {
  await prisma.practiceQuestion.update({
    where: { id },
    data: {
      prompt: patch.prompt,
      choices: patch.choices as unknown as object | undefined,
      correctChoiceId: patch.correctChoiceId,
      explanation: patch.explanation,
    },
  });
}

export async function deleteQuestion(id: string): Promise<void> {
  await prisma.practiceQuestion.delete({ where: { id } });
}
