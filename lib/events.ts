export type RoomEvent =
  | { type: "player_joined"; playerId: string; name: string }
  | { type: "room_started"; endsAt: number; startedAt: number }
  | { type: "leaderboard"; rows: LeaderboardRow[] }
  | { type: "answer_submitted"; playerId: string; name: string; questionPosition: number; isCorrect: boolean }
  | { type: "room_ended" }
  | { type: "payout_sent"; rank: number; playerId: string; amount: string; txHash: string }
  | { type: "payout_confirmed"; rank: number; playerId: string; amount: string; txHash: string };

export type LeaderboardRow = {
  playerId: string;
  name: string;
  address: string | null;
  points: number;
  correctCount: number;
  answeredCount: number;
  totalTimeMs: number;
};

type Sub = { send: (event: RoomEvent) => void };

type Globals = typeof globalThis & { __miniQuizEvents?: Map<string, Set<Sub>> };
const g = globalThis as Globals;

function registry(): Map<string, Set<Sub>> {
  if (!g.__miniQuizEvents) g.__miniQuizEvents = new Map();
  return g.__miniQuizEvents;
}

export function subscribe(roomId: string, sub: Sub): () => void {
  const reg = registry();
  let set = reg.get(roomId);
  if (!set) {
    set = new Set();
    reg.set(roomId, set);
  }
  set.add(sub);
  return () => {
    set?.delete(sub);
  };
}

export function broadcast(roomId: string, event: RoomEvent): void {
  const subs = registry().get(roomId);
  if (!subs) return;
  for (const sub of subs) {
    try {
      sub.send(event);
    } catch {
      // dead subscriber; ignore — will be cleaned on next send attempt
    }
  }
}
