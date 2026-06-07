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
  if (period === "all") {
    return allTimeLeaderboard(viewerUserId);
  }
  return periodicLeaderboard(period, viewerUserId);
}

// All-time board reads the precomputed lifetime points off User.totalXp
// instead of aggregating the whole Answer table. totalXp is incremented in
// the same transaction as each LIVE answer (see submitAnswer in
// room.service.ts) and deliberately excludes daily answers, so the all-time
// board mirrors that lifetime-LIVE-points pool.
async function allTimeLeaderboard(
  viewerUserId?: string | null,
): Promise<{ rows: GlobalLeaderboardRow[]; viewer: GlobalLeaderboardRow | null }> {
  const top = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarEmoji: true,
      avatarColor: true,
      totalXp: true,
    },
    orderBy: { totalXp: "desc" },
    take: TOP_N,
  });

  const rows: GlobalLeaderboardRow[] = top.map((u, i) => ({
    rank: i + 1,
    user: publicUser(u),
    points: u.totalXp,
    level: computeLevel(u.totalXp).level,
  }));

  let viewer: GlobalLeaderboardRow | null = null;
  if (viewerUserId) {
    const inTop = rows.find((r) => r.user.id === viewerUserId);
    if (inTop) {
      viewer = inTop;
    } else {
      const me = await prisma.user.findFirst({
        where: { id: viewerUserId, deletedAt: null },
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
        // Rank = 1 + (# of non-deleted users with strictly more totalXp).
        const ahead = await prisma.user.count({
          where: { deletedAt: null, totalXp: { gt: me.totalXp } },
        });
        viewer = {
          rank: ahead + 1,
          user: publicUser(me),
          points: me.totalXp,
          level: computeLevel(me.totalXp).level,
        };
      }
    }
  }

  return { rows, viewer };
}

// Periodic boards (today/week) aggregate Answer filtered by submittedAt so
// they hit the covering @@index([submittedAt, userId, points]).
async function periodicLeaderboard(
  period: GlobalLeaderboardPeriod,
  viewerUserId?: string | null,
): Promise<{ rows: GlobalLeaderboardRow[]; viewer: GlobalLeaderboardRow | null }> {
  const start = startOfPeriod(period);

  // Aggregate sum(points) per userId in the period. Filter out answers
  // belonging to soft-deleted users so they vanish from leaderboards.
  const grouped = await prisma.answer.groupBy({
    by: ["userId"],
    where: {
      ...(start ? { submittedAt: { gte: start } } : {}),
      user: { deletedAt: null },
    },
    _sum: { points: true },
    orderBy: { _sum: { points: "desc" } },
    take: TOP_N,
  });

  const userIds = grouped.map((g) => g.userId);
  // Pull user details (need totalXp for level on All-time; for periodic boards
  // we still show the user's lifetime level since "level" is a property of the
  // person, not the period).
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, deletedAt: null },
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
          user: { deletedAt: null },
        },
        _sum: { points: true },
        having: { points: { _sum: { gt: points } } },
      });

      const me = await prisma.user.findFirst({
        where: { id: viewerUserId, deletedAt: null },
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
