import pino from "pino";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { startScoreWorker } from "./services/score-worker.js";

const log = pino({ level: config.LOG_LEVEL });

async function main() {
  log.info("score worker: starting");
  const handle = await startScoreWorker(log as never);

  const shutdown = async (signal: string) => {
    log.info({ signal }, "score worker: shutting down");
    await handle.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((e) => {
  log.error({ err: e }, "score worker: failed");
  process.exit(1);
});
