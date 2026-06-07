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
// Per-roomPlayer refresh lock. refreshLiveScoreForPlayer reads all answers,
// sums them, then writes the Redis row; the NATS consumer pulls many answer
// events concurrently across pods, so two refreshes for the same roomPlayer
// can interleave and a stale total can clobber a fresh one. We serialize the
// read+write under a short Redis lock keyed by roomPlayerId. Postgres stays
// authoritative, so any missed refresh is corrected by the next answer's
// refresh re-reading the full answer set.
const REFRESH_LOCK_TTL_MS = 5_000;
const REFRESH_LOCK_RETRY_DELAY_MS = 25;
const REFRESH_LOCK_MAX_WAIT_MS = 2_000;

const redis = createRedisClient("live-score");
const lockRedis = createRedisClient("live-score-lock");

// Release only if we still own the lock (token match), so a lock that already
// expired and was re-taken by another refresh is not released out from under it.
const RELEASE_LOCK_LUA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

function scoresKey(quizId: string): string {
  return `room:${quizId}:scores`;
}

function rowsKey(quizId: string): string {
  return `room:${quizId}:rows`;
}

function refreshLockKey(roomPlayerId: string): string {
  return `room-player:${roomPlayerId}:refresh-lock`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

type RefreshLock =
  // Redis unavailable: proceed unserialized (single-pod/dev behavior).
  | { status: "no-redis" }
  // Lock held by another in-flight refresh; caller should skip.
  | { status: "contended" }
  // We own the lock; caller must call release() when done.
  | { status: "acquired"; release: () => Promise<void> };

// Acquire a short per-roomPlayer lock around the read-sum-write.
async function acquireRefreshLock(roomPlayerId: string): Promise<RefreshLock> {
  const client = await readyRedis(lockRedis);
  if (!client) return { status: "no-redis" };
  const key = refreshLockKey(roomPlayerId);
  const token = `${process.pid}-${Date.now()}-${Math.random()}`;
  const deadline = Date.now() + REFRESH_LOCK_MAX_WAIT_MS;
  for (;;) {
    const ok = await client.set(key, token, "PX", REFRESH_LOCK_TTL_MS, "NX");
    if (ok === "OK") {
      return {
        status: "acquired",
        release: async () => {
          try {
            await client.eval(RELEASE_LOCK_LUA, 1, key, token);
          } catch {
            // lock will expire on its own
          }
        },
      };
    }
    if (Date.now() >= deadline) return { status: "contended" };
    await delay(REFRESH_LOCK_RETRY_DELAY_MS);
  }
}

export async function refreshLiveScoreForPlayer(
  quizId: string,
  roomPlayerId: string,
): Promise<void> {
  // Serialize the read-sum-write for this roomPlayer so concurrent refreshes
  // (across pods) cannot clobber each other with a stale total. If the lock is
  // contended we skip rather than risk an out-of-order write — Postgres is
  // authoritative and the next answer's refresh re-reads the full answer set.
  const lock = await acquireRefreshLock(roomPlayerId);
  if (lock.status === "contended") return;
  try {
    await runRefresh(quizId, roomPlayerId);
  } finally {
    if (lock.status === "acquired") await lock.release();
  }
}

async function runRefresh(
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
