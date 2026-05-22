import pino from "pino";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { evaluateBadgesAfterQuiz } from "./services/badge.service.js";
import { enqueueAutoPayouts, runPayoutBroadcast } from "./services/payout.service.js";
import {
  startWorkerCommandListener,
  stopWorkerCommands,
  type WorkerCommand,
} from "./services/worker-commands.js";

const log = pino({ level: config.LOG_LEVEL });

async function handleCommand(command: WorkerCommand): Promise<void> {
  switch (command.type) {
    case "process_quiz_end":
      await enqueueAutoPayouts(command.quizId);
      await evaluateBadgesAfterQuiz(command.quizId);
      break;
    case "broadcast_payout":
      await runPayoutBroadcast(command.payoutId);
      break;
  }
}

async function main() {
  log.info("payout worker: starting");
  await startWorkerCommandListener(log, handleCommand);

  const shutdown = async (signal: string) => {
    log.info({ signal }, "payout worker: shutting down");
    await stopWorkerCommands();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((e) => {
  log.error({ err: e }, "payout worker: failed");
  process.exit(1);
});
