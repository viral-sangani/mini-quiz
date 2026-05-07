import type { LeaderboardRow } from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { broadcast } from "../sse/broker.js";
import { leaderboard } from "./room.service.js";

// Per-quiz coalesced broadcast queue. Multiple `submitAnswer` calls within a
// short window collapse into ONE leaderboard recompute + ONE answer-distribution
// recompute, then a single fan-out per event type. This keeps the per-answer
// hot path fast (~30-80ms) while still feeling live.
//
// Trade-off vs the old "broadcast on every answer" model:
//   Before: 50 players answer Q3 within 2s → 50 leaderboard recomputes
//           (each iterates every roomPlayer + every answer of the quiz) +
//           50 SSE fan-outs to every connected client.
//   After:  same scenario → 1 recompute + 1 fan-out per `FLUSH_INTERVAL_MS`.
//
// Single-replica only. Once the api scales beyond 1 Pod, replace the
// in-process queue with Redis pub/sub (CLAUDE.md house rule #6).

const FLUSH_INTERVAL_MS = 500;
const ANSWER_SUBMITTED_FLUSH_MS = 250; // cosmetic events flush slightly faster

type Pending = {
  // Scheduled flush handle. Null when no flush is in flight.
  leaderboardTimer: NodeJS.Timeout | null;
  distributionTimer: NodeJS.Timeout | null;
  answerSubmittedTimer: NodeJS.Timeout | null;
  // Buffered "Player X answered Q3" events for the current flush window.
  answerSubmittedBuffer: {
    userId: string;
    displayName: string;
    questionPosition: number;
    isCorrect: boolean;
  }[];
  // Tracks which question's distribution to re-aggregate next flush. Stays
  // pinned to the most recently answered question, which is the one admins
  // are currently watching.
  pendingDistributionQuestionId: string | null;
};

const queue = new Map<string, Pending>();

function getOrCreate(quizId: string): Pending {
  let p = queue.get(quizId);
  if (!p) {
    p = {
      leaderboardTimer: null,
      distributionTimer: null,
      answerSubmittedTimer: null,
      answerSubmittedBuffer: [],
      pendingDistributionQuestionId: null,
    };
    queue.set(quizId, p);
  }
  return p;
}

// Enqueue all the post-answer broadcasts. Caller (the answer route) returns to
// the user immediately; this work happens after.
export function enqueuePostAnswerBroadcasts(args: {
  quizId: string;
  questionId: string;
  questionPosition: number;
  userId: string;
  displayName: string;
  isCorrect: boolean;
}): void {
  const p = getOrCreate(args.quizId);

  // 1) "Alice answered Q3 (correct)" — coalesced into a single send per window
  //    to avoid spamming SSE listeners when 50 players answer simultaneously.
  p.answerSubmittedBuffer.push({
    userId: args.userId,
    displayName: args.displayName,
    questionPosition: args.questionPosition,
    isCorrect: args.isCorrect,
  });
  if (!p.answerSubmittedTimer) {
    p.answerSubmittedTimer = setTimeout(
      () => flushAnswerSubmitted(args.quizId),
      ANSWER_SUBMITTED_FLUSH_MS,
    );
  }

  // 2) Leaderboard recompute — debounced.
  if (!p.leaderboardTimer) {
    p.leaderboardTimer = setTimeout(
      () => flushLeaderboard(args.quizId),
      FLUSH_INTERVAL_MS,
    );
  }

  // 3) Answer distribution for the question that was just answered.
  p.pendingDistributionQuestionId = args.questionId;
  if (!p.distributionTimer) {
    p.distributionTimer = setTimeout(
      () => flushDistribution(args.quizId),
      FLUSH_INTERVAL_MS,
    );
  }
}

async function flushAnswerSubmitted(quizId: string): Promise<void> {
  const p = queue.get(quizId);
  if (!p) return;
  p.answerSubmittedTimer = null;
  const events = p.answerSubmittedBuffer.splice(0);
  for (const e of events) {
    broadcast(quizId, {
      type: "answer_submitted",
      userId: e.userId,
      displayName: e.displayName,
      questionPosition: e.questionPosition,
      isCorrect: e.isCorrect,
    });
  }
}

async function flushLeaderboard(quizId: string): Promise<void> {
  const p = queue.get(quizId);
  if (!p) return;
  p.leaderboardTimer = null;
  try {
    const rows: LeaderboardRow[] = await leaderboard(quizId);
    broadcast(quizId, { type: "leaderboard", rows });
  } catch {
    // Best-effort. A failed broadcast won't desync state — the next answer
    // schedules another flush, and clients also poll /rooms/:code/leaderboard
    // as a fallback.
  }
}

async function flushDistribution(quizId: string): Promise<void> {
  const p = queue.get(quizId);
  if (!p) return;
  p.distributionTimer = null;
  const questionId = p.pendingDistributionQuestionId;
  p.pendingDistributionQuestionId = null;
  if (!questionId) return;
  try {
    const grouped = await prisma.answer.groupBy({
      by: ["choiceId"],
      where: { questionId },
      _count: { choiceId: true },
    });
    const distribution = grouped.map((g) => ({
      choiceId: g.choiceId,
      count: g._count.choiceId,
    }));
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: { position: true },
    });
    if (!question) return;
    broadcast(quizId, {
      type: "answer_distribution",
      questionId,
      questionPosition: question.position,
      distribution,
      answeredCount: distribution.reduce((a, b) => a + b.count, 0),
    });
  } catch {
    // Best-effort.
  }
}

// Cleanup hooks for tests + scheduler shutdown.
export function clearBroadcastQueue(quizId: string): void {
  const p = queue.get(quizId);
  if (!p) return;
  if (p.leaderboardTimer) clearTimeout(p.leaderboardTimer);
  if (p.distributionTimer) clearTimeout(p.distributionTimer);
  if (p.answerSubmittedTimer) clearTimeout(p.answerSubmittedTimer);
  queue.delete(quizId);
}
