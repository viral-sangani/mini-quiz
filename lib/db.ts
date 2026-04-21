import { Redis } from "@upstash/redis";
import { SEED_QUESTIONS } from "./seed-questions";
import { newRoomCode } from "./room-code";

// Upstash Redis — shared across every Vercel instance. Vercel's Upstash
// integration auto-provisions KV_REST_API_URL and KV_REST_API_TOKEN.
let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Missing KV_REST_API_URL / KV_REST_API_TOKEN env vars — is the Upstash Vercel integration installed?"
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// Key namespace (change prefix to wipe all state between events if needed)
const NS = process.env.REDIS_NAMESPACE ?? "mq:v1";
const K = {
  room: (id: string) => `${NS}:room:${id}`,
  questions: (roomId: string) => `${NS}:questions:${roomId}`,
  question: (qid: number) => `${NS}:question:${qid}`,
  questionSeq: () => `${NS}:seq:question`,
  answerSeq: () => `${NS}:seq:answer`,
  players: (roomId: string) => `${NS}:players:${roomId}`, // list of player ids
  player: (pid: string) => `${NS}:player:${pid}`,
  answers: (roomId: string) => `${NS}:answers:${roomId}`, // list of answer ids
  answer: (aid: number) => `${NS}:answer:${aid}`,
  answerLock: (pid: string, qid: number) => `${NS}:alock:${pid}:${qid}`,
  payouts: (roomId: string) => `${NS}:payouts:${roomId}`, // list of ranks
  payout: (roomId: string, rank: number) => `${NS}:payout:${roomId}:${rank}`,
};

// TTL for all keys — 2 hours is plenty for any live event, keeps Redis tidy.
const TTL_SECONDS = 60 * 60 * 2;

export type Room = {
  id: string;
  status: "lobby" | "live" | "ended";
  startedAt: number | null;
  endsAt: number | null;
  durationMs: number;
  questionTimeMs: number;
  prizeAmounts: string[];
  createdAt: number;
};

export type Question = {
  id: number;
  roomId: string;
  position: number;
  prompt: string;
  choices: { id: string; label: string }[];
  correctChoiceId: string;
};

export type Player = {
  id: string;
  roomId: string;
  name: string;
  address: string | null;
  joinedAt: number;
};

export type Answer = {
  id: number;
  playerId: string;
  questionId: number;
  choiceId: string;
  submittedAt: number;
  timeTakenMs: number;
  isCorrect: boolean;
  points: number;
};

export type Payout = {
  roomId: string;
  playerId: string;
  rank: number;
  amount: string;
  txHash: string;
  confirmedAt: number | null;
};

// Upstash's JS client auto-serializes objects to JSON, but returns them parsed
// in some versions and as strings in others. Normalize with a helper.
function parse<T>(v: unknown): T | null {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

// ---------------------------------------------------------------------------
// Rooms + Questions

export async function createRoom(args: {
  durationMs: number;
  questionTimeMs: number;
  prizeAmounts: string[];
}): Promise<Room> {
  const r = redis();
  const now = Date.now();
  const id = newRoomCode();
  const room: Room = {
    id,
    status: "lobby",
    startedAt: null,
    endsAt: null,
    durationMs: args.durationMs,
    questionTimeMs: args.questionTimeMs,
    prizeAmounts: args.prizeAmounts,
    createdAt: now,
  };

  const pipe = r.pipeline();
  pipe.set(K.room(id), JSON.stringify(room), { ex: TTL_SECONDS });

  const qids: number[] = [];
  for (let i = 0; i < SEED_QUESTIONS.length; i++) {
    const qid = await r.incr(K.questionSeq());
    qids.push(qid);
    const q: Question = {
      id: qid,
      roomId: id,
      position: i,
      prompt: SEED_QUESTIONS[i].prompt,
      choices: SEED_QUESTIONS[i].choices,
      correctChoiceId: SEED_QUESTIONS[i].correctChoiceId,
    };
    pipe.set(K.question(qid), JSON.stringify(q), { ex: TTL_SECONDS });
  }
  pipe.rpush(K.questions(id), ...qids.map(String));
  pipe.expire(K.questions(id), TTL_SECONDS);
  await pipe.exec();

  return room;
}

export async function getRoom(id: string): Promise<Room | null> {
  const raw = await redis().get(K.room(id));
  return parse<Room>(raw);
}

export async function updateRoom(id: string, patch: Partial<Room>): Promise<void> {
  const r = redis();
  const current = await getRoom(id);
  if (!current) return;
  const merged: Room = { ...current, ...patch };
  await r.set(K.room(id), JSON.stringify(merged), { ex: TTL_SECONDS });
}

export async function questionsInRoom(roomId: string): Promise<Question[]> {
  const r = redis();
  const qids = (await r.lrange(K.questions(roomId), 0, -1)) as string[];
  if (!qids.length) return [];
  const keys = qids.map((id) => K.question(Number(id)));
  const raws = await r.mget(...keys);
  return raws
    .map((v) => parse<Question>(v))
    .filter((q): q is Question => q != null)
    .sort((a, b) => a.position - b.position);
}

export async function getQuestion(id: number): Promise<Question | null> {
  return parse<Question>(await redis().get(K.question(id)));
}

// ---------------------------------------------------------------------------
// Players

export async function addPlayer(p: Player): Promise<void> {
  const r = redis();
  const pipe = r.pipeline();
  pipe.set(K.player(p.id), JSON.stringify(p), { ex: TTL_SECONDS });
  pipe.rpush(K.players(p.roomId), p.id);
  pipe.expire(K.players(p.roomId), TTL_SECONDS);
  await pipe.exec();
}

export async function getPlayer(id: string): Promise<Player | null> {
  return parse<Player>(await redis().get(K.player(id)));
}

export async function playersInRoom(roomId: string): Promise<Player[]> {
  const r = redis();
  const ids = (await r.lrange(K.players(roomId), 0, -1)) as string[];
  if (!ids.length) return [];
  const raws = await r.mget(...ids.map(K.player));
  return raws
    .map((v) => parse<Player>(v))
    .filter((p): p is Player => p != null);
}

// ---------------------------------------------------------------------------
// Answers

export async function insertAnswer(a: Omit<Answer, "id">): Promise<Answer | null> {
  const r = redis();
  // Atomic guard: setnx answerLock(playerId, questionId). Only the first
  // writer succeeds — stops duplicate answers across concurrent requests.
  const lockKey = K.answerLock(a.playerId, a.questionId);
  const acquired = await r.set(lockKey, "1", { nx: true, ex: TTL_SECONDS });
  if (acquired !== "OK") return null;

  const id = (await r.incr(K.answerSeq())) as number;
  const answer: Answer = { ...a, id };
  const pipe = r.pipeline();
  pipe.set(K.answer(id), JSON.stringify(answer), { ex: TTL_SECONDS });
  pipe.rpush(K.answers(a.playerId), String(id));
  pipe.expire(K.answers(a.playerId), TTL_SECONDS);
  await pipe.exec();
  return answer;
}

export async function answersForPlayer(playerId: string): Promise<Answer[]> {
  const r = redis();
  const ids = (await r.lrange(K.answers(playerId), 0, -1)) as string[];
  if (!ids.length) return [];
  const raws = await r.mget(...ids.map((id) => K.answer(Number(id))));
  return raws
    .map((v) => parse<Answer>(v))
    .filter((a): a is Answer => a != null);
}

// ---------------------------------------------------------------------------
// Payouts

export async function upsertPayout(p: Payout): Promise<void> {
  const r = redis();
  const key = K.payout(p.roomId, p.rank);
  const existing = parse<Payout>(await r.get(key));
  const merged: Payout = existing
    ? { ...existing, ...p, confirmedAt: p.confirmedAt ?? existing.confirmedAt }
    : p;
  const pipe = r.pipeline();
  pipe.set(key, JSON.stringify(merged), { ex: TTL_SECONDS });
  pipe.sadd(K.payouts(p.roomId), String(p.rank));
  pipe.expire(K.payouts(p.roomId), TTL_SECONDS);
  await pipe.exec();
}

export async function payoutsForRoom(roomId: string): Promise<Payout[]> {
  const r = redis();
  const ranks = (await r.smembers(K.payouts(roomId))) as string[];
  if (!ranks.length) return [];
  const keys = ranks.map((rk) => K.payout(roomId, Number(rk)));
  const raws = await r.mget(...keys);
  return raws
    .map((v) => parse<Payout>(v))
    .filter((p): p is Payout => p != null)
    .sort((a, b) => a.rank - b.rank);
}
