import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { healthRoutes } from "./routes/health.js";
import { publicLeaderboardRoutes } from "./routes/leaderboard.public.js";
import { publicProfileRoutes } from "./routes/profile.public.js";
import { walletAuthRoutes } from "./routes/wallet-auth.public.js";
import { publicQuizRoutes } from "./routes/quizzes.public.js";
import { adminQuizRoutes } from "./routes/quizzes.admin.js";
import { roomRoutes } from "./routes/rooms.js";
import { adminPayoutRoutes } from "./routes/payouts.admin.js";
import { adminStatsRoutes } from "./routes/admin-stats.admin.js";
import { adminUserRoutes } from "./routes/users.admin.js";
import { adminAuthRoutes } from "./routes/admin-auth.admin.js";
import { dailyPublicRoutes } from "./routes/daily.public.js";
import { practicePublicRoutes } from "./routes/practice.public.js";
import { dailyAdminRoutes } from "./routes/daily.admin.js";
import { practiceAdminRoutes } from "./routes/practice.admin.js";
import { aiGenAdminRoutes } from "./routes/ai-gen.admin.js";
import { treasuryAdminRoutes } from "./routes/treasury.admin.js";
import { roomEventRoutes } from "./routes/room-events.js";
import {
  captureBackendEvent,
  captureBackendException,
  distinctIdFromRequest,
  requestAnalyticsProperties,
  shouldCapturePublicRequest,
  shutdownPostHog,
} from "./services/posthog.js";
import { startBroker, stopBroker } from "./sse/broker.js";

async function main() {
  const requestStartMs = new WeakMap<object, number>();
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

  app.addHook("onRequest", async (req) => {
    requestStartMs.set(req, Date.now());
  });

  app.addHook("onResponse", async (req, reply) => {
    if (!shouldCapturePublicRequest(req)) return;
    captureBackendEvent("backend request completed", {
      distinctId: distinctIdFromRequest(req),
      properties: {
        ...requestAnalyticsProperties(req),
        status_code: reply.statusCode,
        duration_ms: Date.now() - (requestStartMs.get(req) ?? Date.now()),
      },
    });
  });

  app.setErrorHandler((err, req, reply) => {
    if (shouldCapturePublicRequest(req)) {
      captureBackendException(err, {
        distinctId: distinctIdFromRequest(req),
        properties: requestAnalyticsProperties(req),
      });
    }
    reply.send(err);
  });

  // Accept empty JSON bodies on POSTs that legitimately have no payload
  // (e.g. /admin/users/:id/unflag, /admin/quizzes/:id/end). Fastify's default
  // parser rejects with FST_ERR_CTP_EMPTY_JSON_BODY otherwise.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      const trimmed = typeof body === "string" ? body.trim() : "";
      if (!trimmed) return done(null, {});
      try {
        done(null, JSON.parse(trimmed));
      } catch (e) {
        done(e as Error, undefined);
      }
    },
  );
  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(healthRoutes);
  await app.register(publicQuizRoutes);
  await app.register(publicProfileRoutes);
  await app.register(walletAuthRoutes);
  await app.register(publicLeaderboardRoutes);
  await app.register(roomRoutes);
  if (config.ENABLE_EMBEDDED_SSE) {
    await app.register(roomEventRoutes);
  }
  await app.register(adminQuizRoutes);
  await app.register(adminPayoutRoutes);
  await app.register(adminStatsRoutes);
  await app.register(adminUserRoutes);
  await app.register(adminAuthRoutes);
  await app.register(dailyPublicRoutes);
  await app.register(practicePublicRoutes);
  await app.register(dailyAdminRoutes);
  await app.register(practiceAdminRoutes);
  await app.register(aiGenAdminRoutes);
  await app.register(treasuryAdminRoutes);

  await startBroker(app.log);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await stopBroker();
    await app.close();
    await shutdownPostHog();
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
