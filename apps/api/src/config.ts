// Load .env BEFORE we read process.env. The apps/api/.env file is a symlink
// to the repo root .env so the monorepo can keep one source of truth.
import { config as loadDotenv } from "dotenv";
loadDotenv();

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_ROLE: z
    .enum([
      "web",
      "worker",
      "scheduler-worker",
      "realtime",
      "score-worker",
      "payout-worker",
      "capacity-prewarmer",
    ])
    .default("web"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(16),
  // Used only by apps/api/src/seed-admin.ts. If set on api boot, the seed
  // script will idempotently create an admin with this email + password
  // when it doesn't already exist. After the initial bootstrap these can be
  // removed from the Sealed Secret.
  INITIAL_ADMIN_EMAIL: z.string().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
  TREASURY_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .pipe(
      z
        .string()
        .regex(/^0x[0-9a-fA-F]{64}$/)
        .optional(),
    ),
  CELO_RPC_URL: z.string().url().default("https://forno.celo.org"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  REDIS_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  NATS_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  ENABLE_EMBEDDED_SSE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  SCORE_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(32),
  ANSWER_QUEUE_MAX_PENDING: z.coerce.number().int().positive().default(25_000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  // OpenRouter for AI question generation. Optional so the api can boot
  // without a key — the /admin/ai/generate-questions route returns a clean
  // 503 if missing instead of crashing on import.
  OPENROUTER_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_MODEL: z.string().default("google/gemini-3.5-flash"),
});

export type Config = z.infer<typeof schema>;

export const config: Config = (() => {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
})();
