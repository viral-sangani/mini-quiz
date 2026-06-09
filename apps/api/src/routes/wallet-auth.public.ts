import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  issueWalletNonce,
  verifyWalletSignature,
} from "../services/wallet-auth.service.js";
import {
  captureBackendEvent,
  identifyWallet,
} from "../services/posthog.js";

// Public wallet-ownership auth endpoints. The player app calls these to prove
// it controls a wallet (EIP-191 personal_sign, MiniPay-compatible) and receive
// a short-lived session token that mutating routes require.

const nonceSchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const verifySchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export async function walletAuthRoutes(app: FastifyInstance) {
  // POST /auth/wallet/nonce  { walletAddress } -> { address, nonce, message }
  // Client signs `message` with personal_sign and posts it to /verify.
  app.post("/auth/wallet/nonce", async (req, reply) => {
    const parsed = nonceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await issueWalletNonce(parsed.data.walletAddress);
    if (!result) {
      return reply.code(400).send({ error: "Invalid wallet address" });
    }
    return result;
  });

  // POST /auth/wallet/verify  { walletAddress, signature } -> { token, ... }
  app.post("/auth/wallet/verify", async (req, reply) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await verifyWalletSignature({
      address: parsed.data.walletAddress,
      signature: parsed.data.signature,
    });
    if (!result.ok) {
      const status = result.code === "BAD_INPUT" ? 400 : 401;
      return reply.code(status).send({ error: result.code });
    }
    identifyWallet(result.address, {
      wallet_session_expires_in_seconds: result.expiresInSeconds,
    });
    captureBackendEvent("wallet session verified", {
      distinctId: result.address,
      properties: {
        expires_in_seconds: result.expiresInSeconds,
      },
    });
    return {
      token: result.token,
      address: result.address,
      expiresInSeconds: result.expiresInSeconds,
    };
  });
}
