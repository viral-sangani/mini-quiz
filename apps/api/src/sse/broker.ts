import type { RoomEvent } from "@mini-quiz/shared";

// In-process SSE fan-out. Works on a single-VPS deployment (one Node process).
// If we ever scale horizontally, swap to Postgres LISTEN/NOTIFY or Redis pub/sub.

export type SseClient = {
  id: string;
  send: (event: RoomEvent) => void;
};

type Registry = Map<string, Set<SseClient>>;

declare global {
  // eslint-disable-next-line no-var
  var __sseRegistry: Registry | undefined;
}

function registry(): Registry {
  if (!globalThis.__sseRegistry) globalThis.__sseRegistry = new Map();
  return globalThis.__sseRegistry;
}

export function subscribe(quizId: string, client: SseClient): () => void {
  const reg = registry();
  let set = reg.get(quizId);
  if (!set) {
    set = new Set();
    reg.set(quizId, set);
  }
  set.add(client);
  return () => {
    set?.delete(client);
    if (set?.size === 0) reg.delete(quizId);
  };
}

export function broadcast(quizId: string, event: RoomEvent): void {
  const set = registry().get(quizId);
  if (!set) return;
  for (const client of set) {
    try {
      client.send(event);
    } catch {
      // client is dead; cleanup happens on the next write attempt
    }
  }
}

export function subscriberCount(quizId: string): number {
  return registry().get(quizId)?.size ?? 0;
}
