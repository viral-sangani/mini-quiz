import { BaseError } from "viem";
import type { Address } from "viem";
import { createRedisClient, readyRedis } from "./redis.js";

// Serialization + nonce management for the single treasury account.
//
// Three layers of protection against double-sends / nonce collisions:
//   1. In-process async mutex: all treasury sends in this pod run one at a
//      time, so we never fire two sendTransaction calls concurrently from
//      one account.
//   2. Explicit nonce: viem would otherwise fetch the pending nonce per call;
//      under serialized-but-rapid sends the node can hand back the same
//      pending nonce twice. We fetch it once and increment locally, only
//      re-syncing from chain on a nonce error.
//   3. Cross-pod Redis lock (SET NX with TTL, keyed on the treasury address):
//      multiple pods share the treasury key, so the in-process mutex alone is
//      not enough. If Redis is unavailable we fall back to the in-process
//      mutex and log a warning.

// ---------- In-process mutex ----------

let chain: Promise<unknown> = Promise.resolve();

function withLocalMutex<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  // Keep the chain alive regardless of success/failure of the previous link.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ---------- Cross-pod Redis lock ----------

const lockRedis = createRedisClient("treasury-lock");
// TTL is a safety net only: the lock is actively renewed by a watchdog while
// fn() runs (see renewRedisLock), so the critical section is protected for as
// long as it actually takes. The TTL just bounds how long a CRASHED holder can
// block others — if a pod dies mid-send, the lock auto-expires after this long.
// Kept comfortably above one renew interval so a single slow renew never lets
// the lock lapse under a live holder.
const LOCK_TTL_MS = 60_000;
// Re-PEXPIRE the lock at this cadence while fn() runs. Must be well under
// LOCK_TTL_MS so a renew can be missed once (e.g. a brief Redis blip) without
// the lock expiring beneath an active holder.
const LOCK_RENEW_MS = 15_000;
const LOCK_RETRY_MS = 200;
const LOCK_MAX_WAIT_MS = 30_000;

function lockKey(address: Address): string {
  return `treasury:lock:${address.toLowerCase()}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Acquire the distributed lock, returning the unique token used to release it,
// or null if Redis is unavailable (caller falls back to the in-process mutex).
async function acquireRedisLock(
  address: Address,
  log?: { warn: (msg: string) => void },
): Promise<string | null> {
  const client = await readyRedis(lockRedis);
  if (!client) {
    log?.warn("treasury lock: redis unavailable, using in-process mutex only");
    return null;
  }
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const key = lockKey(address);
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await client.set(key, token, "PX", LOCK_TTL_MS, "NX");
    if (res === "OK") return token;
    if (Date.now() >= deadline) {
      // Give up on the distributed lock but still proceed under the local
      // mutex rather than dropping a real payout on the floor.
      log?.warn("treasury lock: redis lock contended past timeout, proceeding under local mutex");
      return null;
    }
    await sleep(LOCK_RETRY_MS);
  }
}

const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

async function releaseRedisLock(address: Address, token: string): Promise<void> {
  const client = await readyRedis(lockRedis);
  if (!client) return;
  try {
    await client.eval(RELEASE_SCRIPT, 1, lockKey(address), token);
  } catch {
    // Best-effort release; the TTL will expire it otherwise.
  }
}

// Renew the lock's TTL, but ONLY if we still hold it (token matches). This
// prevents extending a lock that already expired and was re-acquired by another
// pod. Returns true if the renewal landed.
const RENEW_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

async function renewRedisLock(address: Address, token: string): Promise<boolean> {
  const client = await readyRedis(lockRedis);
  if (!client) return false;
  try {
    const res = await client.eval(
      RENEW_SCRIPT,
      1,
      lockKey(address),
      token,
      String(LOCK_TTL_MS),
    );
    return res === 1;
  } catch {
    return false;
  }
}

// Run `fn` while holding both the in-process mutex and (best-effort) the
// cross-pod Redis lock for the treasury address. While fn() runs, a watchdog
// re-PEXPIREs the lock every LOCK_RENEW_MS so a send that legitimately takes
// longer than LOCK_TTL_MS (slow RPC, retries) can never have the lock expire
// beneath it and let another pod send concurrently. The watchdog is always
// cancelled before the lock is released.
export async function withTreasuryLock<T>(
  address: Address,
  fn: () => Promise<T>,
  log?: { warn: (msg: string) => void },
): Promise<T> {
  return withLocalMutex(async () => {
    const token = await acquireRedisLock(address, log);
    let watchdog: ReturnType<typeof setInterval> | null = null;
    if (token) {
      watchdog = setInterval(() => {
        void renewRedisLock(address, token).then((ok) => {
          if (!ok) {
            log?.warn(
              "treasury lock: renewal failed; lock may have expired or been lost",
            );
          }
        });
      }, LOCK_RENEW_MS);
      // Don't let the renewal timer keep the event loop alive on shutdown.
      if (typeof watchdog.unref === "function") watchdog.unref();
    }
    try {
      return await fn();
    } finally {
      if (watchdog) clearInterval(watchdog);
      if (token) await releaseRedisLock(address, token);
    }
  });
}

// ---------- Explicit nonce ----------

// Cached next nonce per treasury address. Reset to null on any nonce error so
// the next send re-syncs from chain. Only mutated inside withTreasuryLock.
const nextNonce = new Map<string, number>();

export async function getNextNonce(
  address: Address,
  fetchPendingNonce: () => Promise<number>,
): Promise<number> {
  const key = address.toLowerCase();
  const cached = nextNonce.get(key);
  if (cached !== undefined) return cached;
  const pending = await fetchPendingNonce();
  nextNonce.set(key, pending);
  return pending;
}

export function commitNonce(address: Address, used: number): void {
  nextNonce.set(address.toLowerCase(), used + 1);
}

export function resetNonce(address: Address): void {
  nextNonce.delete(address.toLowerCase());
}

export function isNonceError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("nonce too low") ||
    m.includes("nonce too high") ||
    m.includes("invalid nonce") ||
    m.includes("nonce has already been used") ||
    m.includes("replacement transaction underpriced") ||
    m.includes("already known")
  );
}

// ---------- Send-error classification ----------
//
// When a treasury send throws we MUST know whether the tx could have entered
// the mempool. Getting this wrong is a double-pay (treat a maybe-broadcast as a
// hard failure -> retry re-sends) or a stranded nonce (reset a nonce a sent tx
// already consumed -> later sends skip/reuse it and cascade to FAILED).
//
//   PRE_BROADCAST  the node definitively rejected the tx before accepting it
//                  (insufficient funds, bad params, classified nonce error,
//                  execution revert during estimation). The tx never entered
//                  the mempool, so it is safe to mark FAILED and to reset the
//                  nonce cache.
//   AMBIGUOUS      anything else — network timeout, dropped connection, RPC
//                  transport error, unknown node error. The node MAY have
//                  accepted the tx after we lost the response. We must NOT mark
//                  FAILED and MUST NOT reset the nonce (the tx may have used it).
export type SendErrorClass = "PRE_BROADCAST" | "AMBIGUOUS";

// viem error class names that prove the tx was rejected before broadcast. These
// are raised by the node during validation/estimation, before the tx is in the
// mempool. Anything not in this set (transport timeouts, socket close, unknown
// node errors) is treated as AMBIGUOUS — the safe default.
const PRE_BROADCAST_ERROR_NAMES = new Set<string>([
  "NonceTooLowError",
  "NonceTooHighError",
  "NonceMaxValueError",
  "InsufficientFundsError",
  "IntrinsicGasTooLowError",
  "IntrinsicGasTooHighError",
  "FeeCapTooLowError",
  "FeeCapTooHighError",
  "TipAboveFeeCapError",
  "TransactionTypeNotSupportedError",
  "ExecutionRevertedError",
]);

// Substrings of raw node messages that prove pre-broadcast rejection, for RPC
// providers that surface a plain message rather than a typed viem error.
function isPreBroadcastMessage(message: string): boolean {
  const m = message.toLowerCase();
  if (isNonceError(m)) return true;
  return (
    m.includes("insufficient funds") ||
    m.includes("intrinsic gas too low") ||
    m.includes("intrinsic gas too high") ||
    m.includes("exceeds block gas limit") ||
    m.includes("max fee per gas less than block base fee") ||
    m.includes("max priority fee per gas higher than max fee per gas") ||
    m.includes("transaction underpriced") ||
    m.includes("gas price too low") ||
    m.includes("execution reverted") ||
    m.includes("invalid sender") ||
    m.includes("transaction type not supported")
  );
}

// Substrings that strongly indicate an ambiguous (maybe-broadcast) outcome.
// These override message-based pre-broadcast hints: a timeout wrapping a body
// that mentions e.g. "execution reverted" must still be treated as ambiguous,
// because the request itself did not complete.
function isAmbiguousMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("socket") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("network") ||
    m.includes("fetch failed") ||
    m.includes("connection")
  );
}

export function classifySendError(e: unknown): SendErrorClass {
  if (e instanceof BaseError) {
    // Walk the viem cause chain looking for an ambiguous transport failure
    // first (timeout / socket close / http request error). If the failure is
    // transport-level the outcome is unknown regardless of any inner message.
    const transportFailure = e.walk(
      (err) =>
        err instanceof BaseError &&
        (err.name === "TimeoutError" ||
          err.name === "SocketClosedError" ||
          err.name === "HttpRequestError" ||
          err.name === "WebSocketRequestError"),
    );
    if (transportFailure) return "AMBIGUOUS";

    const preBroadcast = e.walk(
      (err) => err instanceof BaseError && PRE_BROADCAST_ERROR_NAMES.has(err.name),
    );
    if (preBroadcast) return "PRE_BROADCAST";

    // Fall through to message inspection for providers that don't map to a
    // typed node error.
  }
  const message = e instanceof Error ? e.message : String(e);
  if (isAmbiguousMessage(message)) return "AMBIGUOUS";
  if (isPreBroadcastMessage(message)) return "PRE_BROADCAST";
  // Unknown failure: treat as ambiguous. Safer to leave the row in flight and
  // re-check on resume than to re-send and risk a double pay.
  return "AMBIGUOUS";
}

// ---------- Redis idempotency record (withdrawals) ----------

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

// Reserve an idempotency key. Returns true if this is the first time the key
// is seen (caller may proceed), false if it was already reserved (duplicate
// request — caller must reject). Returns true with a null client (Redis
// unavailable) so local/dev still works, but logs the degraded mode.
export async function reserveIdempotencyKey(
  scope: string,
  key: string,
  log?: { warn: (msg: string) => void },
): Promise<boolean> {
  const client = await readyRedis(lockRedis);
  if (!client) {
    log?.warn("treasury idempotency: redis unavailable, key not enforced");
    return true;
  }
  const res = await client.set(
    `treasury:idem:${scope}:${key}`,
    "1",
    "PX",
    IDEMPOTENCY_TTL_MS,
    "NX",
  );
  return res === "OK";
}

// Release a previously reserved idempotency key. Call this ONLY when the
// operation definitively did NOT broadcast (validation rejected, or a
// pre-broadcast RPC error) so a legitimate client retry isn't blocked for the
// full TTL. NEVER release on an ambiguous/maybe-broadcast failure — that key
// must stay reserved to keep the request deduped.
export async function releaseIdempotencyKey(
  scope: string,
  key: string,
): Promise<void> {
  const client = await readyRedis(lockRedis);
  if (!client) return;
  try {
    await client.del(`treasury:idem:${scope}:${key}`);
  } catch {
    // Best-effort; the TTL will expire it otherwise.
  }
}
