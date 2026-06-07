import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { verifyMessage } from "viem";
import { config } from "../config.js";
import { createRedisClient, readyRedis } from "./redis.js";

// Wallet-ownership auth for the public player API.
//
// Identity used to be a self-asserted `walletAddress` in the request body/query
// with no proof — anyone could mutate anyone else's profile. This module adds an
// EIP-191 (`personal_sign`) ownership proof, which MiniPay supports:
//
//   1. Client asks for a nonce bound to its wallet  (POST /auth/wallet/nonce).
//   2. Client signs the rendered message with `personal_sign` and posts the
//      signature back (POST /auth/wallet/verify). We recover/verify the signer
//      with viem and, on success, mint a short-lived session JWT bound to the
//      verified address.
//   3. Mutating routes use `requireWallet` to extract the verified address from
//      the bearer token instead of trusting a body field.
//
// The session JWT uses a dedicated audience (`WALLET_SESSION_AUDIENCE`) so it
// can never be confused with the admin token minted by the Next.js admin app
// (which carries `role` and no audience). `requireWallet` rejects any token
// missing this audience, and `requireAdmin` already rejects wallet tokens
// because they carry no `role`.

const NONCE_TTL_SECONDS = 5 * 60; // nonce is single-use, short window to sign
const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24h player session
export const WALLET_SESSION_AUDIENCE = "wallet-session";
const WALLET_SESSION_ISSUER = "mini-quiz/api";

const encoder = new TextEncoder();

// The signing secret is independent of admin auth in purpose, but we derive it
// from NEXTAUTH_SECRET (the one shared secret the api already holds) so we don't
// introduce a new env var / Sealed Secret. The distinct audience + issuer is
// what keeps wallet sessions and admin tokens separate, not the key material.
const sessionSecret = encoder.encode(config.NEXTAUTH_SECRET);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function normalizeAddress(address: string): string | null {
  if (!ADDRESS_RE.test(address)) return null;
  return address.toLowerCase();
}

// ---------- nonce store (Redis-first, in-memory fallback) ----------
//
// Same pattern as admin-login-rate-limit: Redis is optional in local/dev, so a
// process-local map is the fallback. Single-region api, so the fallback is only
// a correctness gap across pods (a nonce issued on pod A can't be verified on
// pod B without Redis) — acceptable for dev, and prod runs with Redis.

const redis = createRedisClient("wallet-auth");

type MemoryNonce = { nonce: string; expiresAt: number };
const memoryNonces = new Map<string, MemoryNonce>();

function nonceKey(address: string): string {
  return `wallet-auth:nonce:${address}`;
}

function pruneMemoryNonce(address: string): MemoryNonce | null {
  const row = memoryNonces.get(address);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    memoryNonces.delete(address);
    return null;
  }
  return row;
}

// Issues a fresh single-use nonce bound to `address`, overwriting any prior one
// so a stale nonce can't be replayed. Returns the message the client must sign.
export async function issueWalletNonce(
  address: string,
): Promise<{ address: string; nonce: string; message: string; expiresInSeconds: number } | null> {
  const addr = normalizeAddress(address);
  if (!addr) return null;

  const nonce = crypto.randomBytes(16).toString("hex");
  const key = nonceKey(addr);

  const r = await readyRedis(redis);
  if (r) {
    await r.set(key, nonce, "EX", NONCE_TTL_SECONDS);
  } else {
    memoryNonces.set(addr, { nonce, expiresAt: Date.now() + NONCE_TTL_SECONDS * 1000 });
  }

  return {
    address: addr,
    nonce,
    message: buildSignInMessage(addr, nonce),
    expiresInSeconds: NONCE_TTL_SECONDS,
  };
}

// The exact human-readable message the client signs. Both nonce issuance and
// verification render it identically so the signature check is deterministic.
export function buildSignInMessage(address: string, nonce: string): string {
  return [
    "Mini Quiz wants you to sign in with your wallet.",
    "",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    "",
    "Signing this message proves you own this wallet. It costs no gas.",
  ].join("\n");
}

// Reads and atomically consumes (single-use) the nonce for `address`.
async function consumeWalletNonce(address: string): Promise<string | null> {
  const key = nonceKey(address);
  const r = await readyRedis(redis);
  if (r) {
    // GETDEL is atomic single-use; fall back to get+del on older servers.
    const value = (await r.getdel(key).catch(async () => {
      const v = await r.get(key);
      if (v) await r.del(key);
      return v;
    })) as string | null;
    return value ?? null;
  }
  const row = pruneMemoryNonce(address);
  if (!row) return null;
  memoryNonces.delete(address);
  return row.nonce;
}

// ---------- verify signature + mint session ----------

export type VerifyWalletResult =
  | { ok: true; address: string; token: string; expiresInSeconds: number }
  | { ok: false; code: "BAD_INPUT" | "NONCE_NOT_FOUND" | "BAD_SIGNATURE" };

export async function verifyWalletSignature(input: {
  address: string;
  signature: string;
}): Promise<VerifyWalletResult> {
  const addr = normalizeAddress(input.address);
  if (!addr) return { ok: false, code: "BAD_INPUT" };
  if (typeof input.signature !== "string" || !input.signature.startsWith("0x")) {
    return { ok: false, code: "BAD_INPUT" };
  }

  const nonce = await consumeWalletNonce(addr);
  if (!nonce) return { ok: false, code: "NONCE_NOT_FOUND" };

  const message = buildSignInMessage(addr, nonce);
  let valid = false;
  try {
    valid = await verifyMessage({
      address: addr as `0x${string}`,
      message,
      signature: input.signature as `0x${string}`,
    });
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, code: "BAD_SIGNATURE" };

  const token = await mintWalletSession(addr);
  return { ok: true, address: addr, token, expiresInSeconds: SESSION_TTL_SECONDS };
}

async function mintWalletSession(address: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(address)
    .setIssuer(WALLET_SESSION_ISSUER)
    .setAudience(WALLET_SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret);
}

// ---------- preHandler / verification ----------

async function verifyWalletToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret, {
      algorithms: ["HS256"],
      audience: WALLET_SESSION_AUDIENCE,
      issuer: WALLET_SESSION_ISSUER,
    });
    const sub = typeof payload.sub === "string" ? normalizeAddress(payload.sub) : null;
    return sub;
  } catch {
    return null;
  }
}

// Fastify preHandler: requires a valid wallet-session bearer token and stashes
// the verified lowercase address on the request. Routes read it via
// `getVerifiedWallet(req)`. On failure it sends a 401 and returns false so the
// route handler can short-circuit (`if (!(await requireWallet(req, reply))) return;`).
export async function requireWallet(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing wallet session token" });
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  const address = await verifyWalletToken(token);
  if (!address) {
    reply.code(401).send({ error: "Invalid or expired wallet session" });
    return null;
  }
  (req as FastifyRequest & { verifiedWallet?: string }).verifiedWallet = address;
  return address;
}

// Reads the verified address stashed by `requireWallet`. Only valid inside a
// handler guarded by `requireWallet`.
export function getVerifiedWallet(req: FastifyRequest): string | null {
  return (req as FastifyRequest & { verifiedWallet?: string }).verifiedWallet ?? null;
}
