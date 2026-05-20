import crypto from "node:crypto";
import Redis from "ioredis";
import { config } from "../config.js";

const WINDOW_SECONDS = 15 * 60;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;

type Counter = { count: number; expiresAt: number };

const memoryCounters = new Map<string, Counter>();
const memoryLocks = new Map<string, number>();

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (!config.REDIS_URL) return null;
  if (redis !== undefined) return redis;
  redis = new Redis(config.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  redis.on("error", () => {
    // Callers fall back to memory when an operation throws.
  });
  return redis;
}

async function readyRedis(): Promise<Redis | null> {
  const r = getRedis();
  if (!r) return null;
  if (r.status === "wait" || r.status === "end") await r.connect();
  return r;
}

function nowMs(): number {
  return Date.now();
}

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashForLog(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function key(kind: "email" | "ip" | "lock", value: string): string {
  return `admin-login:${kind}:${hashForLog(value)}`;
}

async function redisGetInt(k: string): Promise<number> {
  const r = await readyRedis();
  if (!r) return -1;
  const value = await r.get(k);
  return value ? Number(value) || 0 : 0;
}

async function redisIncrement(k: string): Promise<number> {
  const r = await readyRedis();
  if (!r) return -1;
  const count = await r.incr(k);
  if (count === 1) await r.expire(k, WINDOW_SECONDS);
  return count;
}

async function redisSetLock(k: string): Promise<void> {
  const r = await readyRedis();
  if (!r) return;
  await r.set(k, "1", "EX", WINDOW_SECONDS);
}

async function redisClear(keys: string[]): Promise<void> {
  const r = await readyRedis();
  if (!r || keys.length === 0) return;
  await r.del(...keys);
}

function pruneMemory(k: string): Counter | null {
  const row = memoryCounters.get(k);
  if (!row) return null;
  if (row.expiresAt <= nowMs()) {
    memoryCounters.delete(k);
    return null;
  }
  return row;
}

function memoryGet(k: string): number {
  return pruneMemory(k)?.count ?? 0;
}

function memoryIncrement(k: string): number {
  const existing = pruneMemory(k);
  const next = {
    count: (existing?.count ?? 0) + 1,
    expiresAt: existing?.expiresAt ?? nowMs() + WINDOW_SECONDS * 1000,
  };
  memoryCounters.set(k, next);
  return next.count;
}

function memoryLocked(k: string): boolean {
  const lockedUntil = memoryLocks.get(k);
  if (!lockedUntil) return false;
  if (lockedUntil <= nowMs()) {
    memoryLocks.delete(k);
    return false;
  }
  return true;
}

function memorySetLock(k: string): void {
  memoryLocks.set(k, nowMs() + WINDOW_SECONDS * 1000);
}

export async function checkAdminLoginAllowed(params: {
  email: string;
  ip: string;
}): Promise<{ ok: true } | { ok: false; reason: "email_locked" | "ip_limited"; retryAfterSeconds: number }> {
  const email = normalizeAdminEmail(params.email);
  const emailKey = key("email", email);
  const ipKey = key("ip", params.ip);
  const lockKey = key("lock", email);

  try {
    const r = getRedis();
    if (r) {
      if ((await redisGetInt(lockKey)) > 0 || (await redisGetInt(emailKey)) >= EMAIL_LIMIT) {
        await redisSetLock(lockKey);
        return { ok: false, reason: "email_locked", retryAfterSeconds: WINDOW_SECONDS };
      }
      if ((await redisGetInt(ipKey)) >= IP_LIMIT) {
        return { ok: false, reason: "ip_limited", retryAfterSeconds: WINDOW_SECONDS };
      }
      return { ok: true };
    }
  } catch {
    // Fall through to memory limiter.
  }

  if (memoryLocked(lockKey) || memoryGet(emailKey) >= EMAIL_LIMIT) {
    memorySetLock(lockKey);
    return { ok: false, reason: "email_locked", retryAfterSeconds: WINDOW_SECONDS };
  }
  if (memoryGet(ipKey) >= IP_LIMIT) {
    return { ok: false, reason: "ip_limited", retryAfterSeconds: WINDOW_SECONDS };
  }
  return { ok: true };
}

export async function recordAdminLoginFailure(params: {
  email: string;
  ip: string;
}): Promise<{ emailFailures: number; ipFailures: number }> {
  const email = normalizeAdminEmail(params.email);
  const emailKey = key("email", email);
  const ipKey = key("ip", params.ip);
  const lockKey = key("lock", email);

  try {
    const r = getRedis();
    if (r) {
      const [emailFailures, ipFailures] = await Promise.all([
        redisIncrement(emailKey),
        redisIncrement(ipKey),
      ]);
      if (emailFailures >= EMAIL_LIMIT) await redisSetLock(lockKey);
      return { emailFailures, ipFailures };
    }
  } catch {
    // Fall through to memory limiter.
  }

  const emailFailures = memoryIncrement(emailKey);
  const ipFailures = memoryIncrement(ipKey);
  if (emailFailures >= EMAIL_LIMIT) memorySetLock(lockKey);
  return { emailFailures, ipFailures };
}

export async function recordAdminLoginSuccess(email: string): Promise<void> {
  const normalized = normalizeAdminEmail(email);
  const keys = [key("email", normalized), key("lock", normalized)];
  try {
    await redisClear(keys);
  } catch {
    // Non-fatal; memory cleanup below is harmless either way.
  }
  for (const k of keys) {
    memoryCounters.delete(k);
    memoryLocks.delete(k);
  }
}
