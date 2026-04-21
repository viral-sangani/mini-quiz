import { SEED_QUESTIONS } from "./seed-questions";
import { newRoomCode } from "./room-code";

// In-memory data store. Vercel's Fluid Compute reuses function instances
// across requests, so a warm instance retains state for the session. Cold
// starts wipe everything — acceptable for a one-event-per-deploy app.

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

type Store = {
  rooms: Map<string, Room>;
  questions: Map<number, Question>;
  players: Map<string, Player>;
  answers: Map<number, Answer>;
  payouts: Map<string, Payout>; // key: `${roomId}:${rank}`
  questionSeq: number;
  answerSeq: number;
};

type Globals = typeof globalThis & { __miniQuizStore?: Store };
const g = globalThis as Globals;

function init(): Store {
  return {
    rooms: new Map(),
    questions: new Map(),
    players: new Map(),
    answers: new Map(),
    payouts: new Map(),
    questionSeq: 1,
    answerSeq: 1,
  };
}

export function getStore(): Store {
  if (!g.__miniQuizStore) g.__miniQuizStore = init();
  return g.__miniQuizStore;
}

// ---------------------------------------------------------------------------
// Query helpers

export function createRoom(args: {
  durationMs: number;
  questionTimeMs: number;
  prizeAmounts: string[];
}): Room {
  const store = getStore();
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
  store.rooms.set(id, room);
  SEED_QUESTIONS.forEach((q, i) => {
    const qid = store.questionSeq++;
    store.questions.set(qid, {
      id: qid,
      roomId: id,
      position: i,
      prompt: q.prompt,
      choices: q.choices,
      correctChoiceId: q.correctChoiceId,
    });
  });
  return room;
}

export function getRoom(id: string): Room | undefined {
  return getStore().rooms.get(id);
}

export function updateRoom(id: string, patch: Partial<Room>): void {
  const store = getStore();
  const room = store.rooms.get(id);
  if (!room) return;
  store.rooms.set(id, { ...room, ...patch });
}

export function playersInRoom(roomId: string): Player[] {
  const out: Player[] = [];
  for (const p of getStore().players.values()) {
    if (p.roomId === roomId) out.push(p);
  }
  return out;
}

export function addPlayer(p: Player): void {
  getStore().players.set(p.id, p);
}

export function getPlayer(id: string): Player | undefined {
  return getStore().players.get(id);
}

export function questionsInRoom(roomId: string): Question[] {
  const out: Question[] = [];
  for (const q of getStore().questions.values()) {
    if (q.roomId === roomId) out.push(q);
  }
  out.sort((a, b) => a.position - b.position);
  return out;
}

export function getQuestion(id: number): Question | undefined {
  return getStore().questions.get(id);
}

export function existingAnswer(playerId: string, questionId: number): Answer | undefined {
  for (const a of getStore().answers.values()) {
    if (a.playerId === playerId && a.questionId === questionId) return a;
  }
  return undefined;
}

export function insertAnswer(a: Omit<Answer, "id">): Answer {
  const store = getStore();
  const id = store.answerSeq++;
  const full: Answer = { ...a, id };
  store.answers.set(id, full);
  return full;
}

export function answersForPlayer(playerId: string): Answer[] {
  const out: Answer[] = [];
  for (const a of getStore().answers.values()) {
    if (a.playerId === playerId) out.push(a);
  }
  return out;
}

export function upsertPayout(p: Payout): void {
  const key = `${p.roomId}:${p.rank}`;
  const store = getStore();
  const existing = store.payouts.get(key);
  if (existing) {
    store.payouts.set(key, {
      ...existing,
      ...p,
      confirmedAt: p.confirmedAt ?? existing.confirmedAt,
    });
  } else {
    store.payouts.set(key, p);
  }
}

export function payoutsForRoom(roomId: string): Payout[] {
  const out: Payout[] = [];
  for (const p of getStore().payouts.values()) {
    if (p.roomId === roomId) out.push(p);
  }
  out.sort((a, b) => a.rank - b.rank);
  return out;
}
