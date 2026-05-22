import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { healthRoutes } from "./routes/health.js";
import { roomEventRoutes } from "./routes/room-events.js";
import { startBroker, stopBroker } from "./sse/broker.js";

async function main() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
          : undefined,
    },
    disableRequestLogging: config.NODE_ENV === "production" ? false : true,
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "OPTIONS"],
  });
  await app.register(healthRoutes);
  await app.register(roomEventRoutes);
  await startBroker(app.log);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "realtime gateway: shutting down");
    await stopBroker();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: "0.0.0.0", port: config.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
