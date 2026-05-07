import {
  type AvatarColor,
  type AvatarEmoji,
  type GlobalLeaderboardPeriod,
  type GlobalLeaderboardRow,
  type PublicUser,
  computeLevel,
} from "@mini-quiz/shared";
import { prisma } from "../db.js";

const TOP_N = 50;

function startOfPeriod(period: GlobalLeaderboardPeriod): Date | null {
  const now = new Date();
  if (period === "all") return null;
  if (period === "today") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  // week — last 7 UTC days starting at midnight UTC 7d ago.
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function publicUser(u: {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
}): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarEmoji: u.avatarEmoji as AvatarEmoji | null,
    avatarColor: u.avatarColor as AvatarColor | null,
  };
}

export async function globalLeaderboard(
  period: GlobalLeaderboardPeriod,
  viewerUserId?: string | null,
): Promise<{ rows: GlobalLeaderboardRow[]; viewer: GlobalLeaderboardRow | null }> {
  const start = startOfPeriod(period);

  // Aggregate sum(points) per userId in the period.
  const grouped = await prisma.answer.groupBy({
    by: ["userId"],
    where: start ? { submittedAt: { gte: start } } : undefined,
    _sum: { points: true },
    orderBy: { _sum: { points: "desc" } },
    take: TOP_N,
  });

  const userIds = grouped.map((g) => g.userId);
  // Pull user details (need totalXp for level on All-time; for periodic boards
  // we still show the user's lifetime level since "level" is a property of the
  // person, not the period).
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarEmoji: true,
      avatarColor: true,
      totalXp: true,
    },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows: GlobalLeaderboardRow[] = grouped.map((g, i) => {
    const u = userById.get(g.userId);
    return {
      rank: i + 1,
      user: u
        ? publicUser(u)
        : {
            id: g.userId,
            username: null,
            displayName: null,
            avatarEmoji: null,
            avatarColor: null,
          },
      points: g._sum.points ?? 0,
      level: u ? computeLevel(u.totalXp).level : 1,
    };
  });

  // Viewer row: if not in top N, compute their period-scoped points + rank.
  let viewer: GlobalLeaderboardRow | null = null;
  if (viewerUserId) {
    const inTop = rows.find((r) => r.user.id === viewerUserId);
    if (inTop) {
      viewer = inTop;
    } else {
      const sumRow = await prisma.answer.aggregate({
        where: {
          userId: viewerUserId,
          ...(start ? { submittedAt: { gte: start } } : {}),
        },
        _sum: { points: true },
      });
      const points = sumRow._sum.points ?? 0;

      // Rank = 1 + (# of distinct users with strictly more points in this period).
      // groupBy + filter is the cheapest read path in Prisma.
      const ahead = await prisma.answer.groupBy({
        by: ["userId"],
        where: {
          userId: { not: viewerUserId },
          ...(start ? { submittedAt: { gte: start } } : {}),
        },
        _sum: { points: true },
        having: { points: { _sum: { gt: points } } },
      });

      const me = await prisma.user.findUnique({
        where: { id: viewerUserId },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarEmoji: true,
          avatarColor: true,
          totalXp: true,
        },
      });
      if (me) {
        viewer = {
          rank: ahead.length + 1,
          user: publicUser(me),
          points,
          level: computeLevel(me.totalXp).level,
        };
      }
    }
  }

  return { rows, viewer };
}
