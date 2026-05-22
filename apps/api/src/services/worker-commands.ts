import type { FastifyBaseLogger } from "fastify";
import { createRedisClient, readyRedis } from "./redis.js";

export type WorkerCommand =
  | { type: "process_quiz_end"; quizId: string }
  | { type: "broadcast_payout"; payoutId: string };

const QUEUE = "worker:commands";
let pub = createRedisClient("worker-command-pub");
let consumer = createRedisClient("worker-command-consumer");
let listening = false;

export async function publishWorkerCommand(command: WorkerCommand): Promise<boolean> {
  const client = await readyRedis(pub);
  if (!client) return false;
  await client.rpush(QUEUE, JSON.stringify(command));
  return true;
}

export async function startWorkerCommandListener(
  log: FastifyBaseLogger,
  handler: (command: WorkerCommand) => Promise<void>,
): Promise<void> {
  const client = await readyRedis(consumer);
  if (!client) {
    log.warn("worker commands: redis unavailable");
    return;
  }
  listening = true;
  log.info("worker commands: listening");
  void (async () => {
    while (listening) {
      const item = await client.blpop(QUEUE, 5);
      if (!item) continue;
      const [, message] = item;
      try {
        const command = JSON.parse(message) as WorkerCommand;
        await handler(command);
      } catch (e) {
        log.error({ err: e }, "worker command failed");
      }
    }
  })().catch((e) => log.error({ err: e }, "worker command listener stopped"));
}

export async function stopWorkerCommands(): Promise<void> {
  listening = false;
  await Promise.allSettled([pub?.quit(), consumer?.quit()]);
  pub = null;
  consumer = null;
}
