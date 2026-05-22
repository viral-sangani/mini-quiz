import type {
  LeaderboardResponse,
  LeaderboardRow,
  LeaderboardViewerRow,
} from "@mini-quiz/shared";
import { prisma } from "../db.js";
import { createRedisClient, readyRedis } from "./redis.js";

const SCORE_MULTIPLIER = 1_000_000_000;
const MAX_TIME_COMPONENT = 999_999_999;
const SCORE_TTL_SECONDS = 2 * 24 * 60 * 60;

const redis = createRedisClient("live-score");

function scoresKey(quizId: string): string {
  return `room:${quizId}:scores`;
}

function rowsKey(quizId: string): string {
  return `room:${quizId}:rows`;
}

function encodeScore(points: number, totalTimeMs: number): number {
  return points * SCORE_MULTIPLIER + (MAX_TIME_COMPONENT - Math.min(totalTimeMs, MAX_TIME_COMPONENT));
}

function rowFromJson(value: string | null): LeaderboardRow | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as LeaderboardRow;
  } catch {
    return null;
  }
}

async function writeRows(quizId: string, rows: LeaderboardRow[]): Promise<void> {
  const client = await readyRedis(redis);
  if (!client || rows.length === 0) return;
  const scoreKey = scoresKey(quizId);
  const rowKey = rowsKey(quizId);
  const pipeline = client.pipeline();
  for (const row of rows) {
    pipeline.zadd(scoreKey, encodeScore(row.points, row.totalTimeMs), row.userId);
    pipeline.hset(rowKey, row.userId, JSON.stringify(row));
  }
  pipeline.expire(scoreKey, SCORE_TTL_SECONDS);
  pipeline.expire(rowKey, SCORE_TTL_SECONDS);
  await pipeline.exec();
}

export async function seedLiveScoresFromRows(
  quizId: string,
  rows: LeaderboardRow[],
): Promise<void> {
  await writeRows(quizId, rows);
}

export async function refreshLiveScoreForPlayer(
  quizId: string,
  roomPlayerId: string,
): Promise<void> {
  const roomPlayer = await prisma.roomPlayer.findUnique({
    where: { id: roomPlayerId },
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
  if (!roomPlayer || roomPlayer.quizId !== quizId) return;
  const row: LeaderboardRow = {
    userId: roomPlayer.user.id,
    roomPlayerId: roomPlayer.id,
    displayName: roomPlayer.user.displayName ?? "Player",
    walletAddress: roomPlayer.user.walletAddress,
    avatarEmoji: roomPlayer.user.avatarEmoji,
    avatarColor: roomPlayer.user.avatarColor,
    points: roomPlayer.answers.reduce((sum, answer) => sum + answer.points, 0),
    correctCount: roomPlayer.answers.filter((answer) => answer.isCorrect).length,
    answeredCount: roomPlayer.answers.length,
    totalTimeMs: roomPlayer.answers.reduce(
      (sum, answer) => sum + answer.timeTakenMs,
      0,
    ),
  };
  await writeRows(quizId, [row]);
}

export async function getLiveLeaderboardFromRedis(args: {
  quizId: string;
  limit: number;
  viewerUserId?: string | null;
}): Promise<LeaderboardResponse | null> {
  const client = await readyRedis(redis);
  if (!client) return null;
  const scoreKey = scoresKey(args.quizId);
  const rowKey = rowsKey(args.quizId);
  const totalPlayers = await client.zcard(scoreKey);
  if (totalPlayers === 0) return null;

  const ids = await client.zrevrange(scoreKey, 0, args.limit - 1);
  const rowValues = ids.length > 0 ? await client.hmget(rowKey, ...ids) : [];
  const rows = rowValues
    .map(rowFromJson)
    .filter((row): row is LeaderboardRow => row !== null);

  let viewer: LeaderboardViewerRow | null = null;
  if (args.viewerUserId && !ids.includes(args.viewerUserId)) {
    const rank = await client.zrevrank(scoreKey, args.viewerUserId);
    if (rank !== null) {
      const value = await client.hget(rowKey, args.viewerUserId);
      const row = rowFromJson(value);
      if (row) viewer = { ...row, rank: rank + 1 };
    }
  }

  return {
    rows,
    totalPlayers,
    limit: args.limit,
    partial: totalPlayers > rows.length,
    viewer,
  };
}

export async function expireLiveScores(quizId: string): Promise<void> {
  const client = await readyRedis(redis);
  if (!client) return;
  await client
    .pipeline()
    .expire(scoresKey(quizId), SCORE_TTL_SECONDS)
    .expire(rowsKey(quizId), SCORE_TTL_SECONDS)
    .exec();
}
