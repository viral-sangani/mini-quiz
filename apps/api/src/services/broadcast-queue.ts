import type { LeaderboardResponse } from "@mini-quiz/shared";
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

type Pending = {
  // Scheduled flush handle. Null when no flush is in flight.
  leaderboardTimer: NodeJS.Timeout | null;
  distributionTimer: NodeJS.Timeout | null;
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
}): void {
  const p = getOrCreate(args.quizId);

  // 1) Leaderboard recompute — debounced and capped.
  if (!p.leaderboardTimer) {
    p.leaderboardTimer = setTimeout(
      () => flushLeaderboard(args.quizId),
      FLUSH_INTERVAL_MS,
    );
  }

  // 2) Answer distribution for the question that was just answered.
  p.pendingDistributionQuestionId = args.questionId;
  if (!p.distributionTimer) {
    p.distributionTimer = setTimeout(
      () => flushDistribution(args.quizId),
      FLUSH_INTERVAL_MS,
    );
  }
}

async function flushLeaderboard(quizId: string): Promise<void> {
  const p = queue.get(quizId);
  if (!p) return;
  p.leaderboardTimer = null;
  try {
    const payload: LeaderboardResponse = await leaderboard(quizId);
    broadcast(quizId, {
      type: "leaderboard",
      rows: payload.rows,
      totalPlayers: payload.totalPlayers,
      limit: payload.limit,
      partial: payload.partial,
    });
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
  queue.delete(quizId);
}
