import { Prisma } from "../db.js";
import type { AdminLiveState, Choice, LeaderboardRow } from "@mini-quiz/shared";
import { computePoints, playersNeeded } from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { broadcast } from "../sse/broker.js";
import { enqueuePostAnswerBroadcasts } from "./broadcast-queue.js";

export type JoinResult =
  | { quizId: string; roomPlayerId: string; userId: string }
  | { error: string; code?: "PRE_LOBBY" | "LATE" | "CLOSED" | "BAD_INPUT"; lobbyOpensAt?: string };

// Join is allowed from [scheduledStart - lobbyOpenLeadMs] while the quiz
// remains SCHEDULED. If quorum is missing at scheduledStart, the lobby stays
// joinable until enough players arrive and the scheduler flips it LIVE.
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
  const lobbyOpenMs = startMs - quiz.lobbyOpenLeadMs;
  if (now < lobbyOpenMs) {
    return {
      error: "Lobby not open yet",
      code: "PRE_LOBBY",
      lobbyOpensAt: new Date(lobbyOpenMs).toISOString(),
    };
  }

  const existing = await prisma.user.findUnique({
    where: { walletAddress: addr },
  });
  if (!existing || existing.deletedAt || !existing.displayName || !existing.username) {
    // Soft-deleted users can't rejoin under their old wallet — they look like
    // a fresh, un-onboarded user (no displayName/username).
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
      await broadcastLobbyUpdate(o.quizId);
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
  await broadcastLobbyUpdate(quiz.id);

  return { quizId: quiz.id, roomPlayerId: roomPlayer.id, userId: user.id };
}

async function broadcastLobbyUpdate(quizId: string): Promise<void> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      minParticipants: true,
      _count: { select: { players: true } },
    },
  });
  if (!quiz) return;
  const playerCount = quiz._count.players;
  broadcast(quizId, {
    type: "lobby_updated",
    quizId,
    playerCount,
    minParticipants: quiz.minParticipants,
    playersNeeded: playersNeeded(playerCount, quiz.minParticipants),
    quorumMet: playerCount >= quiz.minParticipants,
  });
}

// Grace window beyond questionTimeMs to accept stragglers — covers the
// network round-trip + a small UI-side buffer. Anyone submitting after this
// is rejected as STALE so we can't be tricked into awarding points for a
// question whose time slot is long over.
const ANSWER_DEADLINE_GRACE_MS = 2_000;

export type SubmitError =
  | "QUIZ_NOT_FOUND"
  | "NOT_LIVE"
  | "QUESTION_NOT_IN_QUIZ"
  | "INVALID_ROOM_PLAYER"
  | "WALLET_MISMATCH"
  | "ALREADY_ANSWERED"
  | "STALE";

// Live-quiz answer submission. Lean hot path: validates ownership +
// per-question deadline, persists the Answer + totalXp atomically, returns
// {isCorrect, points} immediately. Side-effects (leaderboard recompute,
// answer-distribution recompute, "Alice answered" broadcast) are enqueued
// into the per-quiz coalesced broadcast queue and fan out on a 250-500ms
// tick instead of inline. Critical for scale: a hot question at 100k players
// would otherwise trigger 100k full leaderboard recomputes.
//
// Security:
//   - walletAddress must match roomPlayer.user.walletAddress (prevents
//     submitting on behalf of another player).
//   - timeTakenMs is clamped server-side to [0, questionTimeMs]; client
//     can't inflate points by lying.
//   - per-question deadline rejects submissions for time-expired questions.
//   - Answer @@unique([roomPlayerId, questionId]) blocks duplicate submits.
export async function submitAnswer(
  code: string,
  input: {
    walletAddress: string;
    roomPlayerId: string;
    questionId: string;
    choiceId: string;
    timeTakenMs: number;
  },
): Promise<
  | { isCorrect: boolean; points: number }
  | { error: string; code: SubmitError }
> {
  const wallet = input.walletAddress.toLowerCase();
  // Single round-trip: pull quiz + only the question we care about + the
  // roomPlayer + the user (for displayName + walletAddress check).
  const quiz = await prisma.quiz.findUnique({
    where: { code },
    select: {
      id: true,
      status: true,
      questionTimeMs: true,
      startedAt: true,
      questions: {
        where: { id: input.questionId },
        select: { id: true, position: true, correctChoiceId: true },
      },
    },
  });
  if (!quiz) return { error: "Quiz not found", code: "QUIZ_NOT_FOUND" };
  if (quiz.status !== "LIVE") return { error: "Quiz is not live", code: "NOT_LIVE" };
  const question = quiz.questions[0];
  if (!question) return { error: "Question not in quiz", code: "QUESTION_NOT_IN_QUIZ" };

  const roomPlayer = await prisma.roomPlayer.findUnique({
    where: { id: input.roomPlayerId },
    select: {
      id: true,
      quizId: true,
      userId: true,
      user: { select: { walletAddress: true, displayName: true } },
    },
  });
  if (!roomPlayer || roomPlayer.quizId !== quiz.id) {
    return { error: "Invalid roomPlayerId", code: "INVALID_ROOM_PLAYER" };
  }
  if ((roomPlayer.user.walletAddress ?? "").toLowerCase() !== wallet) {
    return { error: "Wallet does not own this room player", code: "WALLET_MISMATCH" };
  }

  // Per-question deadline. Each question N occupies the slot
  // [startedAt + N*questionTimeMs, startedAt + (N+1)*questionTimeMs).
  // Plus a grace window for network latency + animation hold.
  if (quiz.startedAt) {
    const deadline =
      quiz.startedAt.getTime() +
      (question.position + 1) * quiz.questionTimeMs +
      ANSWER_DEADLINE_GRACE_MS;
    if (Date.now() > deadline) {
      return { error: "Question deadline has passed", code: "STALE" };
    }
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
      return { error: "Already answered", code: "ALREADY_ANSWERED" };
    }
    throw e;
  }

  // Defer all fan-out work. The user already has their feedback; everyone
  // else can wait the broadcast tick.
  enqueuePostAnswerBroadcasts({
    quizId: quiz.id,
    questionId: question.id,
    questionPosition: question.position,
    userId: roomPlayer.userId,
    displayName: roomPlayer.user.displayName ?? "Player",
    isCorrect,
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
    where: { quizId, user: { deletedAt: null } },
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
