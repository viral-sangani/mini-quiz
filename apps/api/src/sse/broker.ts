import type { FastifyBaseLogger } from "fastify";
import { nanoid } from "nanoid";
import type { RoomEvent } from "@mini-quiz/shared";
import { createRedisClient, readyRedis } from "../services/redis.js";

export type SseClient = {
  id: string;
  send: (event: RoomEvent) => void;
};

type Registry = Map<string, Set<SseClient>>;
type WireEvent = {
  publisherId: string;
  quizId: string;
  event: RoomEvent;
};

declare global {
  // eslint-disable-next-line no-var
  var __sseRegistry: Registry | undefined;
}

const publisherId = nanoid();
let pub = createRedisClient("sse-pub");
let sub = createRedisClient("sse-sub");
let started = false;
let brokerLog: FastifyBaseLogger | null = null;

function registry(): Registry {
  if (!globalThis.__sseRegistry) globalThis.__sseRegistry = new Map();
  return globalThis.__sseRegistry;
}

function channelFor(quizId: string): string {
  return `room:${quizId}:events`;
}

function localFanout(quizId: string, event: RoomEvent): void {
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

export async function startBroker(log?: FastifyBaseLogger): Promise<void> {
  brokerLog = log ?? null;
  if (started || !sub) return;
  const client = await readyRedis(sub);
  if (!client) {
    log?.warn("sse broker: redis unavailable, using process-local fanout");
    return;
  }
  client.on("pmessage", (_pattern, channel, message) => {
    if (!channel.endsWith(":events")) return;
    try {
      const parsed = JSON.parse(message) as WireEvent;
      localFanout(parsed.quizId, parsed.event);
    } catch (e) {
      brokerLog?.warn({ err: e }, "sse broker: invalid redis message");
    }
  });
  await client.psubscribe("room:*:events");
  started = true;
  log?.info({ publisherId }, "sse broker: redis pub/sub enabled");
}

export async function stopBroker(): Promise<void> {
  started = false;
  await Promise.allSettled([pub?.quit(), sub?.quit()]);
  pub = null;
  sub = null;
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
  if (!pub) {
    localFanout(quizId, event);
    return;
  }
  void readyRedis(pub)
    .then(async (client) => {
      if (!client) {
        localFanout(quizId, event);
        return;
      }
      await client.publish(
        channelFor(quizId),
        JSON.stringify({ publisherId, quizId, event } satisfies WireEvent),
      );
    })
    .catch(() => localFanout(quizId, event));
}

export function subscriberCount(quizId: string): number {
  return registry().get(quizId)?.size ?? 0;
}
