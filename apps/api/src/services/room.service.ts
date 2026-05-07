import { Prisma } from "@prisma/client";
import type { AdminLiveState, Choice, LeaderboardRow } from "@mini-quiz/shared";
import { LOBBY_OPEN_LEAD_MS, computePoints } from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { broadcast } from "../sse/broker.js";

export type JoinResult =
  | { quizId: string; roomPlayerId: string; userId: string }
  | { error: string; code?: "PRE_LOBBY" | "LATE" | "CLOSED" | "BAD_INPUT"; lobbyOpensAt?: string };

// Join is allowed only in the [scheduledStart - LOBBY_OPEN_LEAD_MS, scheduledStart) window.
// On a successful join, the user's membership in any OTHER lobby is auto-removed
// (last-join wins) so a player can never be in two lobbies at once.
//
// displayName is NO LONGER taken at join time — players set it during onboarding
// (see profile.service.ts). If the wallet has no User row yet, we reject with
// NEEDS_ONBOARDING and the client routes to /onboarding.
export type JoinResultExt =
  | JoinResult
  | { error: string; code: "NEEDS_ONBOARDING" };

export async function joinRoom(
  code: string,
  walletAddress: string,
): Promise<JoinResultExt> {
  const addr = walletAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr))
    return { error: "invalid walletAddress", code: "BAD_INPUT" };

  const quiz = await prisma.quiz.findUnique({ where: { code } });
  if (!quiz || quiz.archivedAt)
    return { error: "Quiz not found", code: "CLOSED" };

  const now = Date.now();
  if (quiz.status === "LIVE" || quiz.status === "ENDED") {
    return { error: "Quiz has already started — no late joins", code: "LATE" };
  }
  if (quiz.status === "ARCHIVED")
    return { error: "Quiz closed", code: "CLOSED" };
  if (!quiz.scheduledStart) {
    return { error: "Quiz is not scheduled yet", code: "CLOSED" };
  }
  const startMs = quiz.scheduledStart.getTime();
  const lobbyOpenMs = startMs - LOBBY_OPEN_LEAD_MS;
  if (now < lobbyOpenMs) {
    return {
      error: "Lobby not open yet",
      code: "PRE_LOBBY",
      lobbyOpensAt: new Date(lobbyOpenMs).toISOString(),
    };
  }
  if (now >= startMs) {
    return {
      error: "Lobby has closed — quiz is starting",
      code: "LATE",
    };
  }

  const existing = await prisma.user.findUnique({
    where: { walletAddress: addr },
  });
  if (!existing || !existing.displayName || !existing.username) {
    return {
      error: "Profile incomplete — finish onboarding to join",
      code: "NEEDS_ONBOARDING",
    };
  }
  const user = existing;
  const name = existing.displayName ?? "Player";

  // Auto-leave any other lobby (last-join wins).
  // We only remove the player from quizzes that haven't started yet — a quiz
  // that is already LIVE keeps their record (history of past plays).
  const otherLobbies = await prisma.roomPlayer.findMany({
    where: {
      userId: user.id,
      quizId: { not: quiz.id },
      quiz: { status: "SCHEDULED", archivedAt: null },
    },
    select: { id: true, quizId: true },
  });
  if (otherLobbies.length > 0) {
    await prisma.roomPlayer.deleteMany({
      where: { id: { in: otherLobbies.map((r) => r.id) } },
    });
    for (const o of otherLobbies) {
      broadcast(o.quizId, {
        type: "player_joined", // generic refresh; clients re-fetch playerCount
        userId: user.id,
        displayName: name,
      });
    }
  }

  const roomPlayer = await prisma.roomPlayer.upsert({
    where: { quizId_userId: { quizId: quiz.id, userId: user.id } },
    create: { quizId: quiz.id, userId: user.id },
    update: {},
  });

  broadcast(quiz.id, {
    type: "player_joined",
    userId: user.id,
    displayName: name,
  });

  return { quizId: quiz.id, roomPlayerId: roomPlayer.id, userId: user.id };
}

export async function submitAnswer(
  code: string,
  input: {
    roomPlayerId: string;
    questionId: string;
    choiceId: string;
    timeTakenMs: number;
  },
): Promise<{ isCorrect: boolean; points: number } | { error: string }> {
  const quiz = await prisma.quiz.findUnique({
    where: { code },
    include: { questions: { where: { id: input.questionId } } },
  });
  if (!quiz) return { error: "Quiz not found" };
  if (quiz.status !== "LIVE") return { error: "Quiz is not live" };
  const question = quiz.questions[0];
  if (!question) return { error: "Question not in quiz" };

  const roomPlayer = await prisma.roomPlayer.findUnique({
    where: { id: input.roomPlayerId },
  });
  if (!roomPlayer || roomPlayer.quizId !== quiz.id) {
    return { error: "Invalid roomPlayerId" };
  }

  const isCorrect = input.choiceId === question.correctChoiceId;
  const timeTakenMs = Math.max(0, Math.min(input.timeTakenMs, quiz.questionTimeMs));
  const points = computePoints({
    isCorrect,
    timeTakenMs,
    questionTimeMs: quiz.questionTimeMs,
  });

  try {
    await prisma.$transaction([
      prisma.answer.create({
        data: {
          roomPlayerId: roomPlayer.id,
          questionId: question.id,
          userId: roomPlayer.userId,
          choiceId: input.choiceId,
          timeTakenMs,
          isCorrect,
          points,
        },
      }),
      // Lifetime XP — used for level + the "gems" stat on profile/home.
      // Wrapped in the same tx so XP and Answer can never disagree.
      prisma.user.update({
        where: { id: roomPlayer.userId },
        data: { totalXp: { increment: points } },
      }),
    ]);
  } catch (e) {
    // Unique (roomPlayerId, questionId) collision = duplicate submit → no-op.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Already answered" };
    }
    throw e;
  }

  const user = await prisma.user.findUnique({
    where: { id: roomPlayer.userId },
    select: { displayName: true },
  });
  broadcast(quiz.id, {
    type: "answer_submitted",
    userId: roomPlayer.userId,
    displayName: user?.displayName ?? "Player",
    questionPosition: question.position,
    isCorrect,
  });

  // Recompute + broadcast leaderboard (cheap for ~50 players).
  const rows = await leaderboard(quiz.id);
  broadcast(quiz.id, { type: "leaderboard", rows });

  // Broadcast answer distribution for the current question — admin live monitor
  // listens. Cheap aggregate over ~50 players.
  const distribution = await answerDistributionForQuestion(question.id);
  broadcast(quiz.id, {
    type: "answer_distribution",
    questionId: question.id,
    questionPosition: question.position,
    distribution,
    answeredCount: distribution.reduce((a, b) => a + b.count, 0),
  });

  return { isCorrect, points };
}

async function answerDistributionForQuestion(
  questionId: string,
): Promise<{ choiceId: string; count: number }[]> {
  const grouped = await prisma.answer.groupBy({
    by: ["choiceId"],
    where: { questionId },
    _count: { choiceId: true },
  });
  return grouped.map((g) => ({ choiceId: g.choiceId, count: g._count.choiceId }));
}

// Hydrate the admin live monitor without waiting for an SSE event.
// Returns null if the quiz doesn't exist; otherwise returns full state for
// every quiz status (LIVE has live data; SCHEDULED/ENDED have placeholders).
export async function getLiveState(
  quizId: string,
): Promise<AdminLiveState | null> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: { orderBy: { position: "asc" } },
      _count: { select: { players: true } },
    },
  });
  if (!quiz) return null;

  const totalQuestions = quiz.questions.length;
  const lastAnswer = await prisma.answer.findFirst({
    where: { question: { quizId } },
    orderBy: { submittedAt: "desc" },
    include: { question: true },
  });

  const currentQuestion = lastAnswer
    ? quiz.questions.find((q) => q.position === lastAnswer.question.position) ??
      quiz.questions[0]
    : quiz.questions[0];

  const distribution =
    currentQuestion && quiz.status === "LIVE"
      ? await answerDistributionForQuestion(currentQuestion.id)
      : [];

  const answeredCount = distribution.reduce((a, b) => a + b.count, 0);

  // Rough avg-correct % over all answers in this quiz so far.
  const allAnswers = await prisma.answer.findMany({
    where: { question: { quizId } },
    select: { isCorrect: true },
  });
  const avgCorrectPct =
    allAnswers.length === 0
      ? 0
      : Math.round((allAnswers.filter((a) => a.isCorrect).length / allAnswers.length) * 100);

  const secondsRemaining =
    quiz.status === "LIVE" && quiz.endedAt
      ? Math.max(0, Math.round((quiz.endedAt.getTime() - Date.now()) / 1000))
      : null;

  return {
    quizId: quiz.id,
    status: quiz.status,
    currentQuestionId: currentQuestion?.id ?? null,
    currentQuestionPosition: currentQuestion?.position ?? null,
    currentQuestionPrompt: currentQuestion?.prompt ?? null,
    currentQuestionChoices: (currentQuestion?.choices as Choice[] | undefined) ?? [],
    currentQuestionCorrectChoiceId: currentQuestion?.correctChoiceId ?? null,
    secondsRemaining,
    totalQuestions,
    activePlayers: quiz._count.players,
    distribution,
    answeredCount,
    avgCorrectPct,
    leaderboard: await leaderboard(quiz.id),
  };
}

export async function leaderboard(quizId: string): Promise<LeaderboardRow[]> {
  const rows = await prisma.roomPlayer.findMany({
    where: { quizId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          walletAddress: true,
          avatarEmoji: true,
          avatarColor: true,
        },
      },
      answers: {
        select: { points: true, isCorrect: true, timeTakenMs: true },
      },
    },
  });
  const out: LeaderboardRow[] = rows.map((rp) => {
    let points = 0;
    let correctCount = 0;
    let totalTimeMs = 0;
    for (const a of rp.answers) {
      points += a.points;
      if (a.isCorrect) correctCount += 1;
      totalTimeMs += a.timeTakenMs;
    }
    return {
      userId: rp.user.id,
      roomPlayerId: rp.id,
      displayName: rp.user.displayName ?? "Player",
      walletAddress: rp.user.walletAddress,
      avatarEmoji: rp.user.avatarEmoji,
      avatarColor: rp.user.avatarColor,
      points,
      correctCount,
      answeredCount: rp.answers.length,
      totalTimeMs,
    };
  });
  out.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
    return 0;
  });
  return out;
}
