import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import {
  getTreasurySummary,
  withdrawFromTreasury,
} from "../services/treasury.service.js";

const tokenSchema = z.enum(["CELO", "USDC", "USDT"]);

const withdrawBodySchema = z.object({
  token: tokenSchema,
  amount: z.string().regex(/^\d+(\.\d+)?$/, "amount must be a decimal string"),
  toAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "toAddress must be a 0x address"),
});

export async function treasuryAdminRoutes(app: FastifyInstance) {
  app.get("/admin/treasury", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    try {
      const summary = await getTreasurySummary();
      return summary;
    } catch (e) {
      req.log.error({ err: e }, "treasury summary failed");
      return reply.code(500).send({
        error: e instanceof Error ? e.message : "Failed to read treasury",
      });
    }
  });

  app.post("/admin/treasury/withdraw", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = withdrawBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await withdrawFromTreasury({
      tokenSymbol: parsed.data.token,
      amount: parsed.data.amount,
      toAddress: parsed.data.toAddress,
    });
    if (!result.ok) {
      const status =
        result.code === "INSUFFICIENT_AVAILABLE"
          ? 409
          : result.code === "IN_FLIGHT"
            ? 423
            : result.code === "RPC_ERROR"
              ? 502
              : 400;
      req.log.warn(
        {
          adminEmail: admin.email,
          token: parsed.data.token,
          amount: parsed.data.amount,
          to: parsed.data.toAddress,
          code: result.code,
        },
        "treasury withdraw rejected",
      );
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    req.log.info(
      {
        adminEmail: admin.email,
        token: parsed.data.token,
        amount: parsed.data.amount,
        to: parsed.data.toAddress,
        txHash: result.txHash,
      },
      "treasury withdraw broadcast",
    );
    return { ok: true, txHash: result.txHash };
  });
}
