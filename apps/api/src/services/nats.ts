import type { FastifyBaseLogger } from "fastify";
import type { RoomEvent } from "@mini-quiz/shared";
import {
  AckPolicy,
  DeliverPolicy,
  RetentionPolicy,
  StorageType,
  StringCodec,
  connect,
  type ConsumerMessages,
  type NatsConnection,
  type Subscription,
} from "nats";
import { config } from "../config.js";

const ROOM_EVENTS_STREAM = "ROOM_EVENTS";
const ROOM_ANSWERS_STREAM = "ROOM_ANSWERS";
const PAYOUT_STREAM = "PAYOUT_EVENTS";
const SCORE_WORKER_DURABLE = "score-workers";

const sc = StringCodec();
let nc: NatsConnection | null = null;
let connectPromise: Promise<NatsConnection | null> | null = null;
let streamsReady = false;
let warnedUnavailable = false;

export type AcceptedAnswerEvent = {
  version: 1;
  quizId: string;
  questionId: string;
  roomPlayerId: string;
  userId: string;
  choiceId: string;
  isCorrect: boolean;
  points: number;
  timeTakenMs: number;
  acceptedAt: string;
};

export function roomEventsSubject(quizId: string): string {
  return `room.${quizId}.events`;
}

export function roomAnswersSubject(quizId: string): string {
  return `room.${quizId}.answers`;
}

export function roomScoresSubject(quizId: string): string {
  return `room.${quizId}.scores`;
}

function quizIdFromSubject(subject: string): string | null {
  const parts = subject.split(".");
  return parts.length === 3 && parts[0] === "room" && parts[1] ? parts[1] : null;
}

async function getConnection(log?: FastifyBaseLogger): Promise<NatsConnection | null> {
  if (!config.NATS_URL) return null;
  if (nc) return nc;
  if (!connectPromise) {
    connectPromise = connect({
      servers: config.NATS_URL,
      name: `mini-quiz-${config.APP_ROLE}`,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 1_000,
      timeout: 2_000,
    })
      .then((connection) => {
        nc = connection;
        warnedUnavailable = false;
        void connection.closed().then((err) => {
          if (err) log?.warn({ err }, "nats: connection closed");
          nc = null;
          streamsReady = false;
          connectPromise = null;
        });
        return connection;
      })
      .catch((err) => {
        connectPromise = null;
        if (!warnedUnavailable) {
          warnedUnavailable = true;
          log?.warn({ err }, "nats: unavailable, falling back where possible");
        }
        return null;
      });
  }
  return connectPromise;
}

export async function ensureJetStream(log?: FastifyBaseLogger): Promise<boolean> {
  if (streamsReady) return true;
  const connection = await getConnection(log);
  if (!connection) return false;
  const jsm = await connection.jetstreamManager({ timeout: 2_000 });

  await ensureStream(jsm, {
    name: ROOM_EVENTS_STREAM,
    subjects: ["room.*.events", "room.*.scores"],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_age: 2 * 24 * 60 * 60 * 1_000_000_000,
  });
  await ensureStream(jsm, {
    name: ROOM_ANSWERS_STREAM,
    subjects: ["room.*.answers"],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_age: 2 * 24 * 60 * 60 * 1_000_000_000,
    max_msgs: 5_000_000,
  });
  await ensureStream(jsm, {
    name: PAYOUT_STREAM,
    subjects: ["payout.commands", "payout.events"],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
  });
  await ensureConsumer(jsm);

  streamsReady = true;
  log?.info("nats: JetStream streams ready");
  return true;
}

async function ensureStream(
  jsm: Awaited<ReturnType<NatsConnection["jetstreamManager"]>>,
  cfg: {
    name: string;
    subjects: string[];
    retention: RetentionPolicy;
    storage: StorageType;
    max_age: number;
    max_msgs?: number;
  },
): Promise<void> {
  let exists = false;
  try {
    await jsm.streams.info(cfg.name);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) {
    await jsm.streams.update(cfg.name, cfg);
  } else {
    await jsm.streams.add(cfg);
  }
}

async function ensureConsumer(
  jsm: Awaited<ReturnType<NatsConnection["jetstreamManager"]>>,
): Promise<void> {
  const cfg = {
    durable_name: SCORE_WORKER_DURABLE,
    name: SCORE_WORKER_DURABLE,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subject: "room.*.answers",
    max_deliver: 5,
    ack_wait: 30 * 1_000_000_000,
    max_ack_pending: config.ANSWER_QUEUE_MAX_PENDING,
  };
  let exists = false;
  try {
    await jsm.consumers.info(ROOM_ANSWERS_STREAM, SCORE_WORKER_DURABLE);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) {
    await jsm.consumers.update(ROOM_ANSWERS_STREAM, SCORE_WORKER_DURABLE, cfg);
  } else {
    await jsm.consumers.add(ROOM_ANSWERS_STREAM, cfg);
  }
}

export async function publishRoomEvent(
  quizId: string,
  event: RoomEvent,
  log?: FastifyBaseLogger,
): Promise<boolean> {
  const connection = await getConnection(log);
  if (!connection || !(await ensureJetStream(log))) return false;
  await connection
    .jetstream()
    .publish(roomEventsSubject(quizId), sc.encode(JSON.stringify(event)));
  return true;
}

export async function publishAcceptedAnswer(
  event: AcceptedAnswerEvent,
  log?: FastifyBaseLogger,
): Promise<boolean> {
  const connection = await getConnection(log);
  if (!connection || !(await ensureJetStream(log))) return false;
  await connection
    .jetstream()
    .publish(roomAnswersSubject(event.quizId), sc.encode(JSON.stringify(event)));
  return true;
}

export async function subscribeRoomEvents(
  onEvent: (quizId: string, event: RoomEvent) => void,
  log?: FastifyBaseLogger,
): Promise<(() => void) | null> {
  const connection = await getConnection(log);
  if (!connection || !(await ensureJetStream(log))) return null;
  const sub = connection.subscribe("room.*.events");
  void (async () => {
    for await (const msg of sub) {
      const quizId = quizIdFromSubject(msg.subject);
      if (!quizId) continue;
      try {
        onEvent(quizId, JSON.parse(sc.decode(msg.data)) as RoomEvent);
      } catch (err) {
        log?.warn({ err }, "nats: invalid room event");
      }
    }
  })();
  log?.info("nats: room event subscription ready");
  return () => sub.unsubscribe();
}

export async function consumeAcceptedAnswers(
  handler: (event: AcceptedAnswerEvent) => Promise<void>,
  log?: FastifyBaseLogger,
): Promise<ConsumerMessages | null> {
  const connection = await getConnection(log);
  if (!connection || !(await ensureJetStream(log))) return null;
  const consumer = await connection
    .jetstream()
    .consumers.get(ROOM_ANSWERS_STREAM, SCORE_WORKER_DURABLE);
  const messages = await consumer.consume({
    max_messages: config.SCORE_WORKER_CONCURRENCY,
  });
  void (async () => {
    for await (const msg of messages) {
      try {
        await handler(JSON.parse(msg.string()) as AcceptedAnswerEvent);
        msg.ack();
      } catch (err) {
        log?.error({ err }, "score worker: answer event failed");
        msg.nak(1_000);
      }
    }
  })();
  return messages;
}

export async function stopNats(
  handles: (Subscription | ConsumerMessages | null)[] = [],
): Promise<void> {
  await Promise.allSettled(
    handles.filter((handle): handle is Subscription | ConsumerMessages => Boolean(handle)).map((handle) => {
      if ("close" in handle) return handle.close();
      handle.unsubscribe();
      return Promise.resolve();
    }),
  );
  await nc?.close();
  nc = null;
  streamsReady = false;
  connectPromise = null;
}
