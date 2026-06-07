import type { FastifyBaseLogger } from "fastify";
import { nanoid } from "nanoid";
import type { RoomEvent } from "@mini-quiz/shared";
import {
  onNatsConnectionLost,
  publishRoomEvent,
  stopNats,
  subscribeRoomEvents,
} from "../services/nats.js";
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
let stopNatsRoomEvents: (() => void) | null = null;
// True while the NATS room-event subscription is the live cross-pod path.
// When NATS drops mid-run we flip this off so the Redis fallback delivers;
// the Redis pmessage handler ignores messages while NATS is active to avoid
// double delivery on reconnect.
let natsFanoutActive = false;
// Idempotency guard: Redis psubscribe is wired at most once per process.
let redisFallbackReady = false;
let unsubConnectionLost: (() => void) | null = null;

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

// Wire the Redis psubscribe cross-pod path. Idempotent: safe to call at
// startup (when NATS is down) and again later if NATS drops mid-run. While
// NATS fanout is active the pmessage handler is a no-op so we don't deliver
// the same event twice; self-published messages are always skipped.
async function ensureRedisFallback(log?: FastifyBaseLogger): Promise<boolean> {
  if (redisFallbackReady) return true;
  if (!sub) return false;
  const client = await readyRedis(sub);
  if (!client) {
    log?.warn("sse broker: redis unavailable, using process-local fanout");
    return false;
  }
  client.on("pmessage", (_pattern, channel, message) => {
    if (!channel.endsWith(":events")) return;
    // NATS is the live path right now; ignore Redis to avoid double delivery.
    if (natsFanoutActive) return;
    try {
      const parsed = JSON.parse(message) as WireEvent;
      // Skip our own publishes; localFanout already ran on the publishing pod.
      if (parsed.publisherId === publisherId) return;
      localFanout(parsed.quizId, parsed.event);
    } catch (e) {
      brokerLog?.warn({ err: e }, "sse broker: invalid redis message");
    }
  });
  await client.psubscribe("room:*:events");
  redisFallbackReady = true;
  log?.info({ publisherId }, "sse broker: redis pub/sub fallback enabled");
  return true;
}

export async function startBroker(log?: FastifyBaseLogger): Promise<void> {
  brokerLog = log ?? null;
  if (started) return;

  // Transient NATS blips are handled by the nats client itself: it is
  // configured with infinite reconnect (maxReconnectAttempts: -1), so the
  // core room-event subscription auto-resumes and connection.closed() only
  // resolves on a *permanent* teardown. When that permanent loss happens we
  // flip off the NATS path and bring up the Redis psubscribe fallback so
  // cross-pod fanout keeps working. The Redis pmessage handler only delivers
  // while natsFanoutActive is false and always skips self-published messages,
  // so there is no double delivery during the NATS-active window.
  //
  // Boundary (intentionally minimal): on a permanent loss we settle on the
  // Redis fallback for the rest of the process lifetime rather than re-driving
  // subscribeRoomEvents to re-arm the NATS path. This is a correct steady
  // state (Redis keeps cross-pod fanout working). See returned notes re: a
  // recommended NATS PodDisruptionBudget (not deployed here).
  if (!unsubConnectionLost) {
    unsubConnectionLost = onNatsConnectionLost(() => {
      natsFanoutActive = false;
      void ensureRedisFallback(brokerLog ?? undefined).catch((err) =>
        brokerLog?.warn({ err }, "sse broker: redis fallback wiring failed"),
      );
    });
  }

  stopNatsRoomEvents = await subscribeRoomEvents(
    (quizId, event) => localFanout(quizId, event),
    log,
  );
  if (stopNatsRoomEvents) {
    natsFanoutActive = true;
    started = true;
    log?.info({ publisherId }, "sse broker: NATS room fanout enabled");
    return;
  }

  // NATS unavailable at startup: rely on Redis (or process-local) fanout.
  natsFanoutActive = false;
  await ensureRedisFallback(log);
  started = true;
}

export async function stopBroker(): Promise<void> {
  started = false;
  natsFanoutActive = false;
  redisFallbackReady = false;
  unsubConnectionLost?.();
  unsubConnectionLost = null;
  stopNatsRoomEvents?.();
  stopNatsRoomEvents = null;
  await stopNats();
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
  void publishRoomEvent(quizId, event, brokerLog ?? undefined)
    .then((published) => {
      if (published) return;
      publishRedisOrLocal(quizId, event);
    })
    .catch((err) => {
      // publishRoomEvent ends in an unguarded js.publish; a rejection here
      // (e.g. NATS publish timeout / no-responders) must still reach the
      // Redis/local fallback so cross-pod delivery is not silently dropped.
      brokerLog?.warn({ err }, "sse broker: nats publish failed, falling back");
      publishRedisOrLocal(quizId, event);
    });
}

function publishRedisOrLocal(quizId: string, event: RoomEvent): void {
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
