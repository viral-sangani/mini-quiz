import { Prisma } from "@prisma/client";
import { type BadgeId } from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { leaderboard } from "./room.service.js";

// Idempotent — if a badge already exists for the user, the upsert is a no-op.
// Returns true when a new badge was awarded (so callers can broadcast/notify).
export async function awardBadge(
  userId: string,
  badgeId: BadgeId,
): Promise<boolean> {
  try {
    await prisma.userBadge.create({ data: { userId, badgeId } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return false;
    }
    throw e;
  }
}

// Run when a quiz transitions LIVE → ENDED. Walks each player and awards any
// badges they newly qualify for. Cheap reads; this fires ~once per quiz per
// player (a few dozen rows max).
export async function evaluateBadgesAfterQuiz(quizId: string): Promise<void> {
  const rows = await leaderboard(quizId);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const userId = row.userId;
    const finalRank = i + 1;

    const [quizzesPlayed, payoutsPlaced, hasFirstWin] = await Promise.all([
      prisma.roomPlayer.count({ where: { userId } }),
      prisma.payout.count({
        where: { userId, rank: { lte: 3 }, status: { not: "FAILED" } },
      }),
      prisma.userBadge.findUnique({
        where: { userId_badgeId: { userId, badgeId: "first_win" } },
      }),
    ]);

    // first_quiz — they just played one, so they have ≥1.
    if (quizzesPlayed >= 1) await awardBadge(userId, "first_quiz");

    if (finalRank <= 3) {
      await awardBadge(userId, "top_3");
      // first_win triggers only on the first podium finish ever.
      if (!hasFirstWin && payoutsPlaced >= 1) {
        await awardBadge(userId, "first_win");
      } else if (!hasFirstWin) {
        // Edge: top-3 in leaderboard but no payout yet (e.g., quiz had fewer
        // prize amounts than 3 winners). Still award first_win on rank.
        await awardBadge(userId, "first_win");
      }
    }

    if (row.answeredCount > 0 && row.correctCount === row.answeredCount) {
      await awardBadge(userId, "perfect_10");
    }

    if (row.answeredCount > 0) {
      const avgTimeMs = row.totalTimeMs / row.answeredCount;
      const accuracy = row.correctCount / row.answeredCount;
      if (avgTimeMs < 3_000 && accuracy >= 0.8) {
        await awardBadge(userId, "speedy");
      }
    }

    if (quizzesPlayed >= 10) await awardBadge(userId, "ten_quizzes");
    if (quizzesPlayed >= 50) await awardBadge(userId, "fifty_quizzes");
  }
}
