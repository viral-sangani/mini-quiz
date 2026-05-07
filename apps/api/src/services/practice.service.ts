import type { Choice } from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { awardBadge } from "./badge.service.js";

export const PRACTICE_QUESTIONS_PER_PLAY = 10;

// Public-safe shape of a practice topic (no admin-only fields like createdById).
export type PublicPracticeTopic = {
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

export async function listPublishedTopics(): Promise<PublicPracticeTopic[]> {
  const topics = await prisma.practiceTopic.findMany({
    where: { published: true },
    include: { _count: { select: { questions: true } } },
    orderBy: { createdAt: "asc" },
  });
  return topics
    .filter((t) => t._count.questions >= PRACTICE_QUESTIONS_PER_PLAY)
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
      description: t.description,
      iconName: t.iconName,
      coverColor: t.coverColor,
      questionCount: t._count.questions,
    }));
}

export type StartPracticeResult =
  | {
      kind: "ok";
      playId: string;
      topicId: string;
      title: string;
      questions: PublicPracticeQuestion[];
    }
  | { kind: "error"; error: string; code: "NOT_FOUND" | "TOO_FEW" | "BAD_INPUT" | "NEEDS_ONBOARDING" };

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
    select: { id: true, displayName: true, username: true },
  });
  if (!user || !user.displayName || !user.username) {
    return {
      kind: "error",
      error: "Profile incomplete — finish onboarding first",
      code: "NEEDS_ONBOARDING",
    };
  }
  const topic = await prisma.practiceTopic.findUnique({
    where: { slug },
    include: { questions: true },
  });
  if (!topic || !topic.published) {
    return { kind: "error", error: "Topic not found", code: "NOT_FOUND" };
  }
  if (topic.questions.length < PRACTICE_QUESTIONS_PER_PLAY) {
    return {
      kind: "error",
      error: "Topic has too few questions to play",
      code: "TOO_FEW",
    };
  }
  // Sample 10 random questions (Fisher-Yates partial shuffle).
  const ids = topic.questions.map((q) => q.id);
  for (let i = 0; i < PRACTICE_QUESTIONS_PER_PLAY; i++) {
    const j = i + Math.floor(Math.random() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  const picked = ids.slice(0, PRACTICE_QUESTIONS_PER_PLAY);
  const byId = new Map(topic.questions.map((q) => [q.id, q]));
  const play = await prisma.practicePlay.create({
    data: {
      topicId: topic.id,
      userId: user.id,
      questionIds: picked,
      scoreTotal: PRACTICE_QUESTIONS_PER_PLAY,
    },
  });
  return {
    kind: "ok",
    playId: play.id,
    topicId: topic.id,
    title: topic.title,
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
  //   practice_explorer: tried 5 distinct topics
  //   practice_scholar:  completed 50 plays
  // Both are computed from finished plays only (so abandons don't count).
  const finished = await prisma.practicePlay.findMany({
    where: { userId: user.id, finishedAt: { not: null } },
    select: { topicId: true },
  });
  const distinctTopics = new Set(finished.map((p) => p.topicId)).size;

  const newBadges: string[] = [];
  if (distinctTopics >= 5) {
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

export type AdminPracticeTopic = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconName: string;
  coverColor: string;
  published: boolean;
  questionCount: number;
  // Distinct-user count of plays (started or finished — we count anyone who
  // entered the topic). Surfaces as "head count" in the admin grid.
  headCount: number;
  createdAt: string;
  updatedAt: string;
};

export async function listAdminTopics(): Promise<AdminPracticeTopic[]> {
  const topics = await prisma.practiceTopic.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { createdAt: "desc" },
  });
  // Per-topic distinct user count via groupBy.
  const grouped = await prisma.practicePlay.groupBy({
    by: ["topicId", "userId"],
    _count: { _all: true },
  });
  const byTopic = new Map<string, Set<string>>();
  for (const g of grouped) {
    if (!byTopic.has(g.topicId)) byTopic.set(g.topicId, new Set());
    byTopic.get(g.topicId)!.add(g.userId);
  }
  return topics.map((t) => ({
    id: t.id,
    slug: t.slug,
    title: t.title,
    description: t.description,
    iconName: t.iconName,
    coverColor: t.coverColor,
    published: t.published,
    questionCount: t._count.questions,
    headCount: byTopic.get(t.id)?.size ?? 0,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

export type AdminPracticeQuestion = {
  id: string;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string | null;
  createdAt: string;
};

export async function getAdminTopicDetail(topicId: string): Promise<
  | (AdminPracticeTopic & { questions: AdminPracticeQuestion[] })
  | null
> {
  const topic = await prisma.practiceTopic.findUnique({
    where: { id: topicId },
    include: {
      questions: { orderBy: { createdAt: "asc" } },
      _count: { select: { questions: true } },
    },
  });
  if (!topic) return null;
  const distinct = await prisma.practicePlay.findMany({
    where: { topicId },
    select: { userId: true },
    distinct: ["userId"],
  });
  return {
    id: topic.id,
    slug: topic.slug,
    title: topic.title,
    description: topic.description,
    iconName: topic.iconName,
    coverColor: topic.coverColor,
    published: topic.published,
    questionCount: topic._count.questions,
    headCount: distinct.length,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
    questions: topic.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices as Choice[],
      correctChoiceId: q.correctChoiceId,
      explanation: q.explanation,
      createdAt: q.createdAt.toISOString(),
    })),
  };
}

export type CreateTopicInput = {
  slug: string;
  title: string;
  description?: string | null;
  iconName?: string;
  coverColor?: string;
  published?: boolean;
};

export async function createTopic(
  createdById: string,
  input: CreateTopicInput,
): Promise<AdminPracticeTopic> {
  const t = await prisma.practiceTopic.create({
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
    id: t.id,
    slug: t.slug,
    title: t.title,
    description: t.description,
    iconName: t.iconName,
    coverColor: t.coverColor,
    published: t.published,
    questionCount: 0,
    headCount: 0,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function updateTopic(
  id: string,
  patch: Partial<CreateTopicInput>,
): Promise<void> {
  await prisma.practiceTopic.update({
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

export async function deleteTopic(id: string): Promise<void> {
  await prisma.practiceTopic.delete({ where: { id } });
}

export type WriteQuestionInput = {
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation?: string | null;
};

export async function bulkAddQuestions(
  topicId: string,
  questions: WriteQuestionInput[],
): Promise<{ count: number }> {
  if (questions.length === 0) return { count: 0 };
  await prisma.practiceQuestion.createMany({
    data: questions.map((q) => ({
      topicId,
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
